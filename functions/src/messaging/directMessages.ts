import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATION_LIST_LIMIT = 50;
const MAX_MESSAGES_LIST_LIMIT = 200;
const MAX_MESSAGES_PER_MINUTE = 30;
const RATE_WINDOW_MS = 60_000;

type ParticipantProfile = {
  name: string;
  avatarUrl: string;
  handle: string;
};

type DirectMessageAttachment = {
  type: "book" | "publication" | "quote";
  entityId: string;
  title?: string;
  author?: string;
  coverUrl?: string;
  canonicalSlug?: string;
  quoteOwnerId?: string;
  quoteText?: string;
};

type ConversationDoc = {
  kind: "direct";
  participantIds: string[];
  participantSet: Record<string, boolean>;
  participantProfiles: Record<string, ParticipantProfile>;
  lastMessageText: string;
  lastMessageAt: admin.firestore.Timestamp | null;
  lastMessageSenderId: string | null;
  unreadCounts: Record<string, number>;
  lastReadAtByUser: Record<
    string,
    admin.firestore.FieldValue | admin.firestore.Timestamp | null
  >;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  version: number;
};

function normalizeUid(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return normalized;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "text must be a string.");
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", "Message text cannot be empty.");
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Message text exceeds ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "text must be a string.");
  }
  const normalized = value.trim();
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Message text exceeds ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return normalized;
}

function readTrimmedString(value: unknown, maxLength = 2048): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeDirectMessageAttachment(
  value: unknown
): { type: "book" | "publication" | "quote"; entityId: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const type = readTrimmedString(raw.type, 32).toLowerCase();
  if (type !== "book" && type !== "publication" && type !== "quote") {
    throw new HttpsError("invalid-argument", "attachment.type is invalid.");
  }
  const entityId = readTrimmedString(raw.entityId, 256);
  if (!entityId) {
    throw new HttpsError("invalid-argument", "attachment.entityId is required.");
  }
  return {
    type,
    entityId,
  };
}

function normalizeStoredAttachment(value: unknown): DirectMessageAttachment | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const type = readTrimmedString(raw.type, 32).toLowerCase();
  if (type !== "book" && type !== "publication" && type !== "quote") {
    return undefined;
  }
  const entityId = readTrimmedString(raw.entityId, 256);
  if (!entityId) {
    return undefined;
  }
  const title = readTrimmedString(raw.title, 300);
  const author = readTrimmedString(raw.author, 300);
  const coverUrl = readTrimmedString(raw.coverUrl, 2048);
  const canonicalSlug = readTrimmedString(raw.canonicalSlug, 160);
  const quoteOwnerId = readTrimmedString(raw.quoteOwnerId, 128);
  const quoteText = readTrimmedString(raw.quoteText, 600);

  return {
    type,
    entityId,
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(canonicalSlug ? { canonicalSlug } : {}),
    ...(quoteOwnerId ? { quoteOwnerId } : {}),
    ...(quoteText ? { quoteText } : {}),
  };
}

function normalizeLimit(value: unknown, fallbackValue: number, max: number): number {
  if (value === undefined || value === null) {
    return fallbackValue;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpsError("invalid-argument", "limit must be a positive integer.");
  }
  return Math.min(value, max);
}

function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey must be a string.");
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      "idempotencyKey must be 8-96 chars [A-Za-z0-9_-]."
    );
  }
  return normalized;
}

function toTimestamp(value: unknown): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return value as admin.firestore.Timestamp;
  }
  return null;
}

function toIsoString(value: unknown): string {
  const timestamp = toTimestamp(value);
  if (timestamp) {
    return timestamp.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

function conversationIdForUsers(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted[0]}__${sorted[1]}`;
}

function asParticipantProfile(payload: unknown): ParticipantProfile {
  const data = (payload ?? {}) as Record<string, unknown>;
  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Unknown",
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : "",
    handle: typeof data.handle === "string" ? data.handle : "",
  };
}

async function resolveAttachmentSnapshot(
  transaction: FirebaseFirestore.Transaction,
  attachment: { type: "book" | "publication" | "quote"; entityId: string },
  uid: string
): Promise<DirectMessageAttachment> {
  if (attachment.type === "book") {
    const snap = await transaction.get(db.collection("books").doc(attachment.entityId));
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced book not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const title =
      readTrimmedString(data.titleEn, 300) ||
      readTrimmedString(data.titleAr, 300);
    const author =
      readTrimmedString(data.authorEn, 300) ||
      readTrimmedString(data.authorAr, 300);
    const coverUrl = readTrimmedString(data.coverUrl, 2048);

    return {
      type: "book",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    };
  }

  if (attachment.type === "publication") {
    const snap = await transaction.get(
      db.collection("longform_publications").doc(attachment.entityId)
    );
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced publication not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = readTrimmedString(data.ownerUid, 128);
    const visibility = readTrimmedString(data.visibility, 32).toLowerCase();
    if (ownerUid && ownerUid !== uid && visibility !== "public") {
      throw new HttpsError("permission-denied", "Referenced publication is not accessible.");
    }

    const title = readTrimmedString(data.title, 300);
    const author = readTrimmedString(data.authorDisplayName, 300);
    const coverUrl = readTrimmedString(data.coverUrl, 2048);
    const canonicalSlug = readTrimmedString(data.canonicalSlug, 160);

    return {
      type: "publication",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      ...(canonicalSlug ? { canonicalSlug } : {}),
    };
  }

  const quoteQuery = db
    .collectionGroup("quotes")
    .where(admin.firestore.FieldPath.documentId(), "==", attachment.entityId)
    .limit(10);
  const quoteSnap = await transaction.get(quoteQuery);
  const accessibleQuotes = quoteSnap.docs
    .map((docSnap) => {
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const quoteOwnerId = readTrimmedString(docSnap.ref.parent.parent?.id, 128);
      const isPublic = data.isPublic === true;
      if (!quoteOwnerId) return null;
      if (!isPublic && quoteOwnerId !== uid) return null;
      return { docSnap, data, quoteOwnerId };
    })
    .filter(
      (
        entry
      ): entry is {
        docSnap: FirebaseFirestore.QueryDocumentSnapshot;
        data: Record<string, unknown>;
        quoteOwnerId: string;
      } => entry !== null
    );

  if (accessibleQuotes.length === 0) {
    throw new HttpsError("not-found", "Referenced quote not found.");
  }
  if (accessibleQuotes.length > 1) {
    throw new HttpsError(
      "failed-precondition",
      "Referenced quote identity is ambiguous."
    );
  }

  const { data, quoteOwnerId } = accessibleQuotes[0];
  const quoteText =
    readTrimmedString(data.textEn, 600) ||
    readTrimmedString(data.textAr, 600);

  return {
    type: "quote",
    entityId: attachment.entityId,
    quoteOwnerId,
    ...(quoteText ? { quoteText } : {}),
  };
}

async function assertUserExists(uid: string): Promise<void> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }
  const data = snap.data();
  if (data?.isSuspended === true) {
    throw new HttpsError("failed-precondition", "Target user is not available.");
  }
}

async function assertNoBlockRelationship(uid: string, peerUid: string): Promise<void> {
  const [aBlocksB, bBlocksA] = await Promise.all([
    db.collection("users").doc(uid).collection("blocks").doc(peerUid).get(),
    db.collection("users").doc(peerUid).collection("blocks").doc(uid).get(),
  ]);

  if (aBlocksB.exists || bBlocksA.exists) {
    throw new HttpsError("failed-precondition", "Direct messaging is blocked.");
  }
}

export const createDirectConversation = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const peerUid = normalizeUid((request.data as { peerUid?: unknown })?.peerUid, "peerUid");

  if (peerUid === uid) {
    throw new HttpsError("invalid-argument", "Cannot create a conversation with yourself.");
  }

  await Promise.all([assertUserExists(uid), assertUserExists(peerUid)]);
  await assertNoBlockRelationship(uid, peerUid);

  const conversationId = conversationIdForUsers(uid, peerUid);
  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const [conversationSnap, userSnap, peerSnap] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(db.collection("users").doc(uid)),
      transaction.get(db.collection("users").doc(peerUid)),
    ]);

    const participantIds = [uid, peerUid].sort();

    if (conversationSnap.exists) {
      const existing = conversationSnap.data() as Partial<ConversationDoc>;
      const existingParticipants = Array.isArray(existing.participantIds)
        ? existing.participantIds
        : [];
      const sameParticipants =
        existingParticipants.length === 2 &&
        existingParticipants[0] === participantIds[0] &&
        existingParticipants[1] === participantIds[1];
      if (!sameParticipants) {
        throw new HttpsError("failed-precondition", "Conversation identity mismatch.");
      }
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const participantSet: Record<string, boolean> = {
      [participantIds[0]]: true,
      [participantIds[1]]: true,
    };

    const userProfile = asParticipantProfile(userSnap.data());
    const peerProfile = asParticipantProfile(peerSnap.data());

    const participantProfiles: Record<string, ParticipantProfile> = {
      [uid]: userProfile,
      [peerUid]: peerProfile,
    };

    const unreadCounts: Record<string, number> = {
      [uid]: 0,
      [peerUid]: 0,
    };

    const lastReadAtByUser: Record<string, admin.firestore.FieldValue> = {
      [uid]: now,
      [peerUid]: now,
    };

    transaction.set(conversationRef, {
      kind: "direct",
      participantIds,
      participantSet,
      participantProfiles,
      lastMessageText: "",
      lastMessageAt: null,
      lastMessageSenderId: null,
      unreadCounts,
      lastReadAtByUser,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies ConversationDoc);
  });

  return { conversationId };
});

export const listDirectConversations = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const listLimit = normalizeLimit(
    (request.data as { limit?: unknown })?.limit,
    MAX_CONVERSATION_LIST_LIMIT,
    MAX_CONVERSATION_LIST_LIMIT
  );

  const snap = await db
    .collection("conversations")
    .where("participantIds", "array-contains", uid)
    .orderBy("updatedAt", "desc")
    .limit(listLimit)
    .get();

  const conversations = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() as Partial<ConversationDoc>;
      const participantIds = Array.isArray(data.participantIds)
        ? data.participantIds
        : [];
      const contactId = participantIds.find((id) => id !== uid);
      if (!contactId) {
        return null;
      }

      const participantProfiles =
        data.participantProfiles && typeof data.participantProfiles === "object"
          ? data.participantProfiles
          : {};
      const contactProfile = asParticipantProfile(
        (participantProfiles as Record<string, unknown>)[contactId]
      );

      const unreadCounts =
        data.unreadCounts && typeof data.unreadCounts === "object"
          ? (data.unreadCounts as Record<string, unknown>)
          : {};
      const rawUnread = unreadCounts[uid];
      const unreadCount = typeof rawUnread === "number" && rawUnread > 0 ? Math.floor(rawUnread) : 0;

      return {
        id: docSnap.id,
        contactId,
        contactName: contactProfile.name,
        contactAvatar: contactProfile.avatarUrl,
        lastMessage: typeof data.lastMessageText === "string" ? data.lastMessageText : "",
        timestamp: toIsoString(data.lastMessageAt ?? data.updatedAt ?? data.createdAt),
        unreadCount,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return { conversations };
});

export const listDirectMessages = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as {
    conversationId?: unknown;
    limit?: unknown;
  };
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const listLimit = normalizeLimit(
    data.limit,
    MAX_MESSAGES_LIST_LIMIT,
    MAX_MESSAGES_LIST_LIMIT
  );

  const conversationRef = db.collection("conversations").doc(conversationId);
  const conversationSnap = await conversationRef.get();
  if (!conversationSnap.exists) {
    throw new HttpsError("not-found", "Conversation not found.");
  }

  const conversation = conversationSnap.data() as Partial<ConversationDoc>;
  const participantSet =
    conversation.participantSet && typeof conversation.participantSet === "object"
      ? (conversation.participantSet as Record<string, unknown>)
      : {};
  if (participantSet[uid] !== true) {
    throw new HttpsError("permission-denied", "Not a conversation participant.");
  }

  const participantIds = Array.isArray(conversation.participantIds)
    ? conversation.participantIds
    : [];
  const peerUid = participantIds.find((id) => id !== uid) ?? null;
  const lastReadAtByUser =
    conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
      ? (conversation.lastReadAtByUser as Record<string, unknown>)
      : {};
  const peerReadTimestamp = peerUid ? toTimestamp(lastReadAtByUser[peerUid]) : null;
  const peerReadMillis = peerReadTimestamp ? peerReadTimestamp.toMillis() : null;

  const messagesSnap = await conversationRef
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(listLimit)
    .get();

  const messages = messagesSnap.docs.reverse().map((messageSnap) => {
    const messageData = messageSnap.data() as Record<string, unknown>;
    const createdAt = toTimestamp(messageData.createdAt);
    const createdMillis = createdAt ? createdAt.toMillis() : null;
    const senderId =
      typeof messageData.senderId === "string" ? messageData.senderId : "unknown";
    const isReadByPeer =
      senderId === uid &&
      peerReadMillis !== null &&
      createdMillis !== null &&
      peerReadMillis >= createdMillis;

    return {
      id: messageSnap.id,
      senderId,
      text: typeof messageData.text === "string" ? messageData.text : "",
      ...(normalizeStoredAttachment(messageData.attachment)
        ? { attachment: normalizeStoredAttachment(messageData.attachment) }
        : {}),
      timestamp: toIsoString(messageData.createdAt),
      readByPeer: isReadByPeer,
      ...(isReadByPeer && peerReadTimestamp
        ? { seenAt: peerReadTimestamp.toDate().toISOString() }
        : {}),
    };
  });

  return { messages };
});

export const sendDirectMessage = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as {
    conversationId?: unknown;
    text?: unknown;
    attachment?: unknown;
    idempotencyKey?: unknown;
  };
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const text = normalizeOptionalText(data.text);
  const attachment = normalizeDirectMessageAttachment(data.attachment);
  const idempotencyKey = normalizeIdempotencyKey(data.idempotencyKey);
  if (!text && !attachment) {
    throw new HttpsError(
      "invalid-argument",
      "Message text or attachment is required."
    );
  }

  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc();
  const dedupeRef = conversationRef
    .collection("idempotency")
    .doc(`${uid}_${idempotencyKey}`);
  const rateRef = db.collection("users").doc(uid).collection("meta").doc("dm_rate_limit");

  const result = await db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }

    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds
      : [];
    if (participantIds.length !== 2) {
      throw new HttpsError("failed-precondition", "Only direct conversations are supported.");
    }

    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }

    const peerUid = participantIds.find((id) => id !== uid);
    if (!peerUid) {
      throw new HttpsError("failed-precondition", "Invalid direct conversation.");
    }

    const attachmentSnapshot = attachment
      ? await resolveAttachmentSnapshot(transaction, attachment, uid)
      : null;

    const [dedupeSnap, rateSnap, senderBlocksPeerSnap, peerBlocksSenderSnap] =
      await Promise.all([
        transaction.get(dedupeRef),
        transaction.get(rateRef),
        transaction.get(db.collection("users").doc(uid).collection("blocks").doc(peerUid)),
        transaction.get(db.collection("users").doc(peerUid).collection("blocks").doc(uid)),
      ]);

    if (senderBlocksPeerSnap.exists || peerBlocksSenderSnap.exists) {
      throw new HttpsError("failed-precondition", "Direct messaging is blocked.");
    }

    if (dedupeSnap.exists) {
      const dedupeData = dedupeSnap.data() as { messageId?: unknown };
      const existingMessageId =
        typeof dedupeData.messageId === "string" ? dedupeData.messageId : "";
      if (!existingMessageId) {
        throw new HttpsError(
          "failed-precondition",
          "Idempotency state is invalid for this conversation."
        );
      }
      return {
        conversationId,
        messageId: existingMessageId,
      };
    }

    const nowMs = Date.now();
    const currentBucketStart = nowMs - (nowMs % RATE_WINDOW_MS);
    const rateData = (rateSnap.data() ?? {}) as Record<string, unknown>;
    const storedBucketStart =
      typeof rateData.bucketStartMs === "number" ? rateData.bucketStartMs : 0;
    const storedCount = typeof rateData.count === "number" ? rateData.count : 0;
    const sameWindow = storedBucketStart === currentBucketStart;
    const nextCount = sameWindow ? storedCount + 1 : 1;

    if (nextCount > MAX_MESSAGES_PER_MINUTE) {
      throw new HttpsError(
        "resource-exhausted",
        "Message rate limit exceeded. Please retry in one minute."
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(
      rateRef,
      {
        bucketStartMs: currentBucketStart,
        count: nextCount,
        updatedAt: now,
      },
      { merge: true }
    );

    const unreadCounts =
      conversation.unreadCounts && typeof conversation.unreadCounts === "object"
        ? { ...(conversation.unreadCounts as Record<string, number>) }
        : {};

    for (const participantId of participantIds) {
      if (participantId === uid) {
        unreadCounts[participantId] = 0;
      } else {
        const current = Number(unreadCounts[participantId] ?? 0);
        unreadCounts[participantId] = Number.isFinite(current) ? current + 1 : 1;
      }
    }

    const lastReadAtByUser =
      conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
        ? { ...(conversation.lastReadAtByUser as Record<string, unknown>) }
        : {};
    lastReadAtByUser[uid] = now;

    const participantProfiles =
      conversation.participantProfiles && typeof conversation.participantProfiles === "object"
        ? (conversation.participantProfiles as Record<string, unknown>)
        : {};
    const senderProfile = asParticipantProfile(participantProfiles[uid]);
    const senderName = senderProfile.name || "Someone";
    const conversationPreviewText =
      text ||
      (attachmentSnapshot?.type === "publication"
        ? "Shared a publication"
        : attachmentSnapshot?.type === "book"
          ? "Shared a book"
          : attachmentSnapshot?.type === "quote"
            ? "Shared a quote"
          : "");

    transaction.set(messageRef, {
      senderId: uid,
      text,
      ...(attachmentSnapshot ? { attachment: attachmentSnapshot } : {}),
      createdAt: now,
      idempotencyKey,
      version: 1,
    });

    transaction.set(dedupeRef, {
      senderId: uid,
      messageId: messageRef.id,
      createdAt: now,
    });

    transaction.set(
      conversationRef,
      {
        lastMessageText: conversationPreviewText,
        lastMessageAt: now,
        lastMessageSenderId: uid,
        unreadCounts,
        lastReadAtByUser,
        updatedAt: now,
      },
      { merge: true }
    );

    const prefRef = db.collection("notification_preferences").doc(peerUid);
    const prefSnap = await transaction.get(prefRef);

    let canSendInAppNotification = true;
    if (prefSnap.exists) {
      const prefData = prefSnap.data() as Record<string, unknown>;
      const channels =
        prefData.channels && typeof prefData.channels === "object"
          ? (prefData.channels as Record<string, unknown>)
          : {};
      const categories =
        prefData.categories && typeof prefData.categories === "object"
          ? (prefData.categories as Record<string, unknown>)
          : {};

      canSendInAppNotification = channels.in_app !== false && categories.messages !== false;
    } else {
      transaction.set(
        prefRef,
        {
          uid: peerUid,
          channels: {
            in_app: true,
            email: false,
            push: false,
          },
          categories: {
            likes: true,
            comments: true,
            reposts: true,
            follows: true,
            mentions: true,
            quotes: true,
            system: true,
            messages: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    if (canSendInAppNotification) {
      const preview =
        conversationPreviewText.length > 96
          ? `${conversationPreviewText.slice(0, 93).trimEnd()}...`
          : conversationPreviewText;
      const notificationId = `dm_${conversationId}_${messageRef.id}_${peerUid}`;
      const notificationRef = db.collection("notifications").doc(notificationId);
      const unreadRef = db.collection("users").doc(peerUid).collection("meta").doc("unread");

      transaction.set(notificationRef, {
        uid: peerUid,
        type: "dm",
        priority: "medium",
        actor: { uid, name: senderName },
        target: { entity_type: "conversation", entity_id: conversationId },
        actorId: uid,
        actorType: "user",
        entityType: "conversation",
        entityId: conversationId,
        postId: null,
        message: `${senderName}: ${preview}`,
        createdAt: now,
        readAt: null,
        read: false,
        sourceActivityId: `dm_${messageRef.id}`,
        dedupeId: notificationId,
        count: 1,
      });

      transaction.set(
        unreadRef,
        {
          notificationsCount: admin.firestore.FieldValue.increment(1),
          lastUpdatedAt: now,
        },
        { merge: true }
      );
    }

    return {
      conversationId,
      messageId: messageRef.id,
    };
  });

  return result;
});

export const markDirectConversationRead = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const conversationId = normalizeUid(
    (request.data as { conversationId?: unknown })?.conversationId,
    "conversationId"
  );

  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }

    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }

    const unreadCounts =
      conversation.unreadCounts && typeof conversation.unreadCounts === "object"
        ? { ...(conversation.unreadCounts as Record<string, number>) }
        : {};
    unreadCounts[uid] = 0;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const lastReadAtByUser =
      conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
        ? { ...(conversation.lastReadAtByUser as Record<string, unknown>) }
        : {};
    lastReadAtByUser[uid] = now;

    transaction.set(
      conversationRef,
      {
        unreadCounts,
        lastReadAtByUser,
      },
      { merge: true }
    );
  });

  return {
    conversationId,
    unreadCount: 0,
  };
});
