import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "./userStats/recomputeUserStats";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { checkUserMutationQuota } from "./utils/mutationQuota";

type StructuredEntityType =
  | "book"
  | "author"
  | "quote"
  | "shelf"
  | "venue"
  | "publication";

type StructuredAttachment = {
  type: StructuredEntityType;
  entityId: string;
  entityOwnerId?: string;
};

type MediaAttachment = {
  attachmentId: string;
  type: string;
};

type CanonicalMediaAttachmentRecord = {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
};

const STRUCTURED_ENTITY_TYPES = new Set<StructuredEntityType>([
  "book",
  "author",
  "quote",
  "shelf",
  "venue",
  "publication",
]);

function readNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStructuredAttachment(
  raw: Record<string, unknown>
): StructuredAttachment | null {
  const typeRaw = readNonEmptyString(raw.type).toLowerCase();
  if (!STRUCTURED_ENTITY_TYPES.has(typeRaw as StructuredEntityType)) {
    return null;
  }

  const entityType = typeRaw as StructuredEntityType;
  const idFromType =
    entityType === "book"
      ? readNonEmptyString(raw.bookId)
      : entityType === "author"
        ? readNonEmptyString(raw.authorId)
        : entityType === "quote"
          ? readNonEmptyString(raw.quoteId)
          : entityType === "shelf"
            ? readNonEmptyString(raw.shelfId)
            : entityType === "venue"
              ? readNonEmptyString(raw.venueId)
              : readNonEmptyString(raw.publicationId);
  const explicitEntityId = readNonEmptyString(raw.entityId);
  const structuredAttachmentId = readNonEmptyString(raw.attachmentId);
  const entityId = explicitEntityId || idFromType;

  if (!entityId && structuredAttachmentId) {
    throw new HttpsError(
      "invalid-argument",
      `Structured attachment "${entityType}" must include entityId (attachmentId is not accepted).`
    );
  }

  if (!entityId) {
    throw new HttpsError(
      "invalid-argument",
      `Structured attachment "${entityType}" must include entity id.`
    );
  }

  if (structuredAttachmentId && structuredAttachmentId === entityId) {
    throw new HttpsError(
      "invalid-argument",
      `Structured attachment "${entityType}" has invalid id mapping (entityId cannot equal attachmentId).`
    );
  }

  const entityOwnerId =
    readNonEmptyString(raw.entityOwnerId) ||
    readNonEmptyString(raw.quoteOwnerId) ||
    readNonEmptyString(raw.ownerId) ||
    undefined;

  return {
    type: entityType,
    entityId,
    ...(entityOwnerId ? { entityOwnerId } : {}),
  };
}

function normalizeMediaAttachment(
  raw: Record<string, unknown>
): MediaAttachment | null {
  const typeRaw = readNonEmptyString(raw.type);
  if (
    typeRaw &&
    STRUCTURED_ENTITY_TYPES.has(typeRaw.toLowerCase() as StructuredEntityType)
  ) {
    return null;
  }

  const attachmentId =
    readNonEmptyString(raw.attachmentId) || readNonEmptyString(raw.id);
  if (!attachmentId) {
    if (typeRaw) {
      throw new HttpsError(
        "invalid-argument",
        "Media attachments must include attachmentId."
      );
    }
    return null;
  }

  return {
    attachmentId,
    type: typeRaw || "IMAGE",
  };
}

async function assertStructuredEntityAccessible(
  db: FirebaseFirestore.Firestore,
  uid: string,
  entity: StructuredAttachment
): Promise<StructuredAttachment> {
  if (entity.type === "book") {
    const snap = await db.collection("books").doc(entity.entityId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced book not found.");
    }
    return entity;
  }

  if (entity.type === "author") {
    const snap = await db.collection("authors").doc(entity.entityId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced author not found.");
    }
    return entity;
  }

  if (entity.type === "venue") {
    const snap = await db.collection("venues").doc(entity.entityId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced venue not found.");
    }
    return entity;
  }

  if (entity.type === "shelf") {
    const snap = await db.collection("shelves").doc(entity.entityId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced shelf not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerId = readNonEmptyString(data.ownerId);
    const visibility = readNonEmptyString(data.visibility).toLowerCase();
    const status = readNonEmptyString(data.status).toLowerCase();
    const isPublic =
      data.isPublic === true ||
      visibility === "public" ||
      status === "public" ||
      status === "visible";
    if (ownerId && ownerId !== uid && !isPublic) {
      throw new HttpsError(
        "permission-denied",
        "Referenced shelf is not accessible."
      );
    }
    return entity;
  }

  if (entity.type === "quote") {
    const rootSnap = await db.collection("quotes").doc(entity.entityId).get();
    if (rootSnap.exists) {
      const quote = (rootSnap.data() ?? {}) as Record<string, unknown>;
      const ownerId = readNonEmptyString(quote.ownerId);
      if (ownerId !== uid && quote.isPublic === false) {
        throw new HttpsError(
          "permission-denied",
          "Referenced quote is not accessible."
        );
      }
      return {
        type: "quote",
        entityId: entity.entityId,
        ...(ownerId ? { entityOwnerId: ownerId } : {}),
      };
    }

    const ownerId = entity.entityOwnerId || uid;
    const legacySnap = await db
      .collection("users")
      .doc(ownerId)
      .collection("quotes")
      .doc(entity.entityId)
      .get();
    if (!legacySnap.exists) {
      throw new HttpsError("not-found", "Referenced quote not found.");
    }
    const quote = (legacySnap.data() ?? {}) as Record<string, unknown>;
    if (ownerId !== uid && quote.isPublic === false) {
      throw new HttpsError(
        "permission-denied",
        "Referenced quote is not accessible."
      );
    }

    const canonicalQuoteId = readNonEmptyString(quote.canonicalQuoteId);
    if (!canonicalQuoteId) {
      throw new HttpsError(
        "failed-precondition",
        "Referenced quote is missing canonical identity."
      );
    }

    return {
      type: "quote",
      entityId: canonicalQuoteId,
      ...(ownerId ? { entityOwnerId: ownerId } : {}),
    };
  }

  if (entity.type === "publication") {
    const snap = await db
      .collection("longform_publications")
      .doc(entity.entityId)
      .get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced publication not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = readNonEmptyString(data.ownerUid);
    const visibility = readNonEmptyString(data.visibility).toLowerCase();
    const isPublic = visibility === "public";
    if (ownerUid && ownerUid !== uid && !isPublic) {
      throw new HttpsError(
        "permission-denied",
        "Referenced publication is not accessible."
      );
    }
    return entity;
  }

  return entity;
}

function readAttachmentUploaderUid(source: Record<string, unknown>): string {
  const uploader =
    source.uploader && typeof source.uploader === "object"
      ? (source.uploader as Record<string, unknown>)
      : {};
  return readNonEmptyString(uploader.uid);
}

function normalizeAttachmentLifecycleStatus(
  source: Record<string, unknown>
): string {
  return readNonEmptyString(source.status).toLowerCase();
}

/**
 * createSocialPost
 * Authoritative backend path for creating social posts.
 * Enforces POST_MODEL_V1 Locked Schema and POST_CREATION_FLOW_V1 principle.
 */
export const createSocialPost = onCall({ cors: true }, async (request) => {
  logger.info("[SOCIAL][PUBLISH_ATTEMPT] Processing publish request");

  const caller = await assertActiveAuthenticatedUser(request.auth);

  const { content, attachments: clientAttachments, publishToken, visibility: clientVisibility } = request.data;
  const uid = caller.uid;
  const email = typeof caller.token.email === "string" ? caller.token.email : "";

  if (!publishToken) {
    throw new HttpsError("invalid-argument", "publishToken is required.");
  }

  const text = typeof content === 'string' ? content.trim() : (content?.text?.trim() || null);
  const contentAttachments = Array.isArray(content?.attachments) ? content.attachments : [];
  const attachments = Array.isArray(clientAttachments)
    ? clientAttachments
    : contentAttachments;
  const visibility = ["public", "followers", "private", "restricted"].includes(clientVisibility)
    ? clientVisibility
    : "public";

  if (!text && attachments.length === 0) {
    throw new HttpsError("invalid-argument", "Text or attachments required.");
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const structuredAttachments: StructuredAttachment[] = [];
  const mediaAttachments: MediaAttachment[] = [];

  for (const rawAttachment of attachments) {
    if (!rawAttachment || typeof rawAttachment !== "object") {
      throw new HttpsError("invalid-argument", "Malformed attachment payload.");
    }
    const attachmentRecord = rawAttachment as Record<string, unknown>;
    const structured = normalizeStructuredAttachment(attachmentRecord);
    if (structured) {
      structuredAttachments.push(structured);
      continue;
    }
    const media = normalizeMediaAttachment(attachmentRecord);
    if (media) {
      mediaAttachments.push(media);
      continue;
    }
    throw new HttpsError("invalid-argument", "Malformed attachment payload.");
  }

  if (structuredAttachments.length > 1) {
    throw new HttpsError(
      "invalid-argument",
      "Exactly one structured attachment is allowed per post."
    );
  }

  const primaryStructured = structuredAttachments[0]
    ? await assertStructuredEntityAccessible(db, uid, structuredAttachments[0])
    : null;

  const attachmentRefs = [
    ...(primaryStructured
      ? [
          {
            attachmentId: primaryStructured.entityId,
            entityId: primaryStructured.entityId,
            ...(primaryStructured.entityOwnerId
              ? { entityOwnerId: primaryStructured.entityOwnerId }
              : {}),
            type: primaryStructured.type,
            role: "primary",
            renderHint: "card",
          },
        ]
      : []),
    ...mediaAttachments.map((attachment, index) => ({
      attachmentId: attachment.attachmentId,
      type: attachment.type,
      role: primaryStructured ? "secondary" : index === 0 ? "primary" : "secondary",
      renderHint: "card",
    })),
  ];

  if (primaryStructured) {
    const hasCanonicalPrimary = attachmentRefs.some(
      (attachment) =>
        attachment.role === "primary" &&
        attachment.type === primaryStructured.type &&
        attachment.attachmentId === primaryStructured.entityId &&
        (attachment as { entityId?: string }).entityId === primaryStructured.entityId
    );
    if (!hasCanonicalPrimary) {
      logger.error("[SOCIAL][STRUCTURED_ATTACHMENT_DROPPED]", {
        uid,
        entityType: primaryStructured.type,
        entityId: primaryStructured.entityId,
      });
      throw new HttpsError(
        "internal",
        "Structured attachment persistence contract failed."
      );
    }
  }

  // Construct Locked Schema (POST_MODEL_V1)
  const postData: any = {
    authorId: uid,
    authorName: caller.token.name || email.split('@')[0] || "Anonymous",
    authorHandle: `@${email.split('@')[0] || 'user'}`,
    authorAvatar: caller.token.picture || `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
    
    content: {
        text: text,
        attachments: attachmentRefs
    },
    primaryEntityType: primaryStructured?.type ?? null,
    primaryEntityId: primaryStructured?.entityId ?? null,
    editedAt: null,

    visibility,
    status: "published",
    isDeleted: false,

    counters: { 
        likes: 0, 
        comments: 0, 
        reposts: 0, 
        bookmarks: 0 
    },

    timestamps: {
        createdAt: now,
        updatedAt: null,
        publishedAt: now
    },

    flags: {
        edited: false,
        hasAttachments: attachmentRefs.length > 0
    },

    publishToken,
    version: 1
  };

  try {
    const result = await db.runTransaction(async (transaction) => {
        // Idempotency check: prevent duplicate publishing from UI glitches
        const idempotencyRef = db.collection('_publish_idempotency').doc(publishToken);
        const idempotencySnap = await transaction.get(idempotencyRef);
        
        if (idempotencySnap.exists) {
            return { success: true, postId: idempotencySnap.data()?.postId, isDuplicate: true };
        }

        await checkUserMutationQuota(db, transaction, uid, "createPost");

        const postRef = db.collection('posts').doc();
        const verifiedMediaAttachments: CanonicalMediaAttachmentRecord[] = [];

        for (const attachment of mediaAttachments) {
            const attachmentRef = db.collection("attachments").doc(attachment.attachmentId);
            const attachmentSnap = await transaction.get(attachmentRef);
            if (!attachmentSnap.exists) {
                throw new HttpsError("failed-precondition", "Attachment is missing.");
            }

            const attachmentData = (attachmentSnap.data() ?? {}) as Record<string, unknown>;
            const uploaderUid = readAttachmentUploaderUid(attachmentData);
            if (uploaderUid !== uid) {
                throw new HttpsError(
                    "permission-denied",
                    "Attachment does not belong to caller."
                );
            }

            const attachmentStatus = normalizeAttachmentLifecycleStatus(attachmentData);
            if (attachmentStatus !== "active") {
                throw new HttpsError(
                    "failed-precondition",
                    "Attachment is not finalized."
                );
            }

            const boundParentType = readNonEmptyString(attachmentData.parentType).toLowerCase();
            const boundParentId = readNonEmptyString(attachmentData.parentId);
            const metadata =
                attachmentData.metadata && typeof attachmentData.metadata === "object"
                    ? (attachmentData.metadata as Record<string, unknown>)
                    : {};
            const metadataParentType = readNonEmptyString(metadata.parentType).toLowerCase();
            const metadataParentId = readNonEmptyString(metadata.parentId);

            if (
                (boundParentType === "posts" && boundParentId && boundParentId !== postRef.id) ||
                (metadataParentType === "posts" && metadataParentId && metadataParentId !== postRef.id)
            ) {
                throw new HttpsError(
                    "failed-precondition",
                    "Attachment is already bound to another post."
                );
            }

            if (boundParentType && !["drafts", "posts"].includes(boundParentType)) {
                throw new HttpsError(
                    "failed-precondition",
                    "Attachment parent type is invalid for publish."
                );
            }

            verifiedMediaAttachments.push({
                ref: attachmentRef,
                data: attachmentData,
            });
        }

        transaction.set(postRef, postData);

        for (const attachment of verifiedMediaAttachments) {
            const attachmentMetadata =
                attachment.data.metadata && typeof attachment.data.metadata === "object"
                    ? (attachment.data.metadata as Record<string, unknown>)
                    : {};

            transaction.set(
                attachment.ref,
                {
                    parentType: "posts",
                    parentId: postRef.id,
                    updatedAt: now,
                    metadata: {
                        ...attachmentMetadata,
                        parentType: "posts",
                        parentId: postRef.id,
                    },
                },
                { merge: true }
            );
        }

        transaction.set(idempotencyRef, {
            postId: postRef.id,
            uid,
            createdAt: now
        });

        // Initialize empty stats document (FANOUT_V1)
        const statsRef = db.collection('post_stats').doc(postRef.id);
        transaction.set(statsRef, {
            counters: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
            lastUpdatedAt: now
        });

        return { success: true, postId: postRef.id, isDuplicate: false };
    });

    try {
        await recomputeUserStats(uid);
    } catch (error: any) {
        logger.warn("[SOCIAL][PUBLISH_RECOMPUTE_USER_STATS_FAILED]", {
            uid,
            postId: result.postId,
            message: error instanceof Error ? error.message : String(error),
        });
    }

    return result;

  } catch (error: any) {
    logger.error(`[SOCIAL][PUBLISH_FAILURE] ${error.message}`, { error });
    if (error instanceof HttpsError) {
        throw error;
    }
    throw new HttpsError("internal", "Failed to publish post.");
  }
});
