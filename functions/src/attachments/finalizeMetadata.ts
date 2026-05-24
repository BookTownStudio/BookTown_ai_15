import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { recomputeUserStats } from "../userStats/recomputeUserStats";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();
const storage = admin.storage();

type ParentType = "posts" | "projects" | "drafts";
type MediaProcessingStatus = "pending" | "processing" | "ready" | "failed";

type MediaRenditionMetadata = {
  storagePath: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
};

function assertPathOwnership(uid: string, storagePath: string): void {
  const ownsAttachmentPath = storagePath.startsWith(`attachments/${uid}/`);
  if (!ownsAttachmentPath) {
    throw new HttpsError("permission-denied", "Invalid storage ownership.");
  }
}

function aspectRatio(width: number, height: number): number {
  return height > 0 ? Number((width / height).toFixed(6)) : 0;
}

function readExistingRenditions(value: unknown): Record<string, MediaRenditionMetadata> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, MediaRenditionMetadata> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Partial<MediaRenditionMetadata>;
    if (
      typeof item.storagePath !== "string" ||
      typeof item.width !== "number" ||
      typeof item.height !== "number" ||
      typeof item.mimeType !== "string" ||
      typeof item.sizeBytes !== "number"
    ) {
      continue;
    }
    output[key] = {
      storagePath: item.storagePath,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    };
  }
  return output;
}

function readProcessingStatus(value: unknown): MediaProcessingStatus | null {
  return value === "pending" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
    ? value
    : null;
}

async function readOriginalImageRendition(params: {
  file: ReturnType<ReturnType<typeof storage.bucket>["file"]>;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<MediaRenditionMetadata> {
  const [bytes] = await params.file.download();
  const { info } = await sharp(bytes, { failOn: "none" })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  return {
    storagePath: params.storagePath,
    width: info.width,
    height: info.height,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
  };
}

async function assertParentAccess(
  uid: string,
  parentType: ParentType,
  parentId: string
): Promise<void> {
  if (parentType === "posts") {
    const postSnap = await db.collection("posts").doc(parentId).get();
    if (!postSnap.exists) {
      throw new HttpsError("not-found", "Parent post not found.");
    }
    const authorId = (postSnap.data()?.authorId ?? "") as string;
    if (authorId !== uid) {
      throw new HttpsError("permission-denied", "Cannot attach to this post.");
    }
    return;
  }

  if (parentType === "projects") {
    const projectSnap = await db
      .collection("users")
      .doc(uid)
      .collection("projects")
      .doc(parentId)
      .get();
    if (!projectSnap.exists) {
      throw new HttpsError("not-found", "Parent project not found.");
    }
    return;
  }

  if (parentType === "drafts") {
    if (parentId === "draft") {
      return;
    }
    const draftSnap = await db
      .collection("users")
      .doc(uid)
      .collection("drafts")
      .doc(parentId)
      .get();
    if (!draftSnap.exists) {
      throw new HttpsError("not-found", "Parent draft not found.");
    }
    return;
  }

  throw new HttpsError("invalid-argument", "Unsupported parent type.");
}

/**
 * finalizeMetadata
 *
 * ATTACHMENT_FINALIZATION_V1
 * Canonical attachment registrar.
 *
 * Responsibilities (LOCKED):
 * - Validate uploaded file metadata
 * - Register EPUB / PDF as ebook attachments
 * - Enforce Public Domain rules for books / editions
 * - Never expose files
 * - Never return URLs
 */
export const finalizeMetadata = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const {
    attachmentId,
    parentType,
    parentId,
    purpose,
    format,
    storagePath,
  } = request.data || {};

  if (
    !attachmentId ||
    !parentType ||
    !parentId ||
    !purpose ||
    !format ||
    !storagePath
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing required attachment metadata."
    );
  }

  logger.info("[ATTACHMENT][FINALIZE] Start", { attachmentId, parentType, parentId });

  const intentRef = db.collection("_attachment_upload_intents").doc(attachmentId);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Upload intent missing or expired."
    );
  }

  const intent = (intentSnap.data() ?? {}) as Record<string, unknown>;
  const intentUid = String(intent.uid ?? "");
  const intentParentType = String(intent.parentType ?? "");
  const intentParentId = String(intent.parentId ?? "");
  const intentPurpose = String(intent.purpose ?? "");
  const intentFormat = String(intent.format ?? "");
  const intentType = String(intent.type ?? "").toUpperCase();
  const intentStoragePath = String(intent.storagePath ?? "");
  const expectedMimePrefix = String(intent.expectedMimePrefix ?? "");
  const maxBytesRaw = Number(intent.maxBytes ?? 0);
  const intentStatus = String(intent.status ?? "");

  if (intentUid !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Upload intent does not belong to caller."
    );
  }

  if (intentStatus === "finalized") {
    logger.info("[ATTACHMENT][FINALIZE] Already finalized", { attachmentId, uid });
    return { ok: true, attachmentId };
  }

  if (intentStatus !== "issued" && intentStatus !== "uploaded") {
    throw new HttpsError("failed-precondition", "Upload intent is not active.");
  }

  const expiresAt = intent.expiresAt;
  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("deadline-exceeded", "Upload intent has expired.");
  }

  if (
    intentParentType !== parentType ||
    intentParentId !== parentId ||
    intentPurpose !== purpose ||
    intentFormat !== format ||
    intentStoragePath !== storagePath
  ) {
    throw new HttpsError("permission-denied", "Finalize payload mismatch.");
  }

  if (!["posts", "projects", "drafts"].includes(intentParentType)) {
    throw new HttpsError("invalid-argument", "Unsupported parent type.");
  }

  const typedParentType = intentParentType as ParentType;
  await assertParentAccess(uid, typedParentType, intentParentId);
  assertPathOwnership(uid, intentStoragePath);

  const bucket = storage.bucket();
  const file = bucket.file(intentStoragePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError("not-found", "Uploaded file not found.");
  }

  const [objectMetadata] = await file.getMetadata();
  const mimeType = String(objectMetadata.contentType ?? "");
  const size = Number(objectMetadata.size ?? 0);
  const maxBytes = Number.isFinite(maxBytesRaw) && maxBytesRaw > 0 ? maxBytesRaw : 0;

  if (size <= 0 || (maxBytes > 0 && size > maxBytes)) {
    throw new HttpsError("failed-precondition", "Uploaded file size is invalid.");
  }
  if (expectedMimePrefix === "application/pdf") {
    if (mimeType !== "application/pdf") {
      throw new HttpsError("failed-precondition", "Only PDF files are allowed.");
    }
  } else if (expectedMimePrefix === "image/") {
    if (!mimeType.startsWith("image/")) {
      throw new HttpsError("failed-precondition", "Only image files are allowed.");
    }
  }

  // -------------------------------------------------
  // Persist attachment metadata (AUTHORITATIVE)
  // -------------------------------------------------
  const now = FieldValue.serverTimestamp();
  const nowIso = new Date().toISOString();
  const attachmentRef = db.collection("attachments").doc(attachmentId);
  const existingAttachmentSnap = await attachmentRef.get();
  const existingAttachmentData = existingAttachmentSnap.exists
    ? (existingAttachmentSnap.data() ?? {})
    : {};
  const existingMetadata =
    existingAttachmentData.metadata && typeof existingAttachmentData.metadata === "object"
      ? (existingAttachmentData.metadata as Record<string, unknown>)
      : {};
  const existingRenditions = readExistingRenditions(existingMetadata.renditions);
  const existingProcessingStatus =
    readProcessingStatus(existingMetadata.processingStatus) ??
    readProcessingStatus(existingAttachmentData.processingStatus);
  const canonicalAttachmentType =
    intentType === "IMAGE" || intentType === "DOCUMENT"
      ? intentType
      : intentPurpose === "ebook"
        ? "DOCUMENT"
        : "IMAGE";
  const originalRendition =
    canonicalAttachmentType === "IMAGE"
      ? await readOriginalImageRendition({
          file,
          storagePath: intentStoragePath,
          mimeType,
          sizeBytes: size,
        })
      : null;
  const imageProcessingStatus: MediaProcessingStatus =
    canonicalAttachmentType === "IMAGE"
      ? existingProcessingStatus ?? "pending"
      : "ready";
  const canonicalMetadata = {
    attachmentId,
    type: canonicalAttachmentType,
    contentType: mimeType,
    mimeType,
    size,
    createdAt: nowIso,
    uploadedAt: nowIso,
    uploader: {
      uid,
    },
    storagePath: intentStoragePath,
    parentType: intentParentType,
    parentId: intentParentId,
    ...(originalRendition
      ? {
          width: originalRendition.width,
          height: originalRendition.height,
          aspectRatio: aspectRatio(originalRendition.width, originalRendition.height),
          dimensions: {
            width: originalRendition.width,
            height: originalRendition.height,
          },
          processingStatus: imageProcessingStatus,
          renditions: {
            ...existingRenditions,
            original: originalRendition,
          },
        }
      : {}),
  };

  await db
    .collection("attachments")
    .doc(attachmentId)
    .set(
      {
        id: attachmentId,
        type: intentPurpose === "ebook" ? "ebook" : "file",
        purpose: intentPurpose,
        format: intentFormat,
        mimeType,
        size,
        parentType: intentParentType,
        parentId: intentParentId,
        storagePath: intentStoragePath,
        ...(originalRendition
          ? {
              width: originalRendition.width,
              height: originalRendition.height,
              aspectRatio: aspectRatio(originalRendition.width, originalRendition.height),
              processingStatus: imageProcessingStatus,
              renditions: {
                ...existingRenditions,
                original: originalRendition,
              },
            }
          : {}),
        uploader: {
          uid,
        },
        visibility: "private",
        status: "active",
        metadata: canonicalMetadata,
        createdAt: now,
        uploadedAt: now,
        finalizedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

  await intentRef.set(
    {
      status: "finalized",
      updatedAt: now,
      finalizedAt: now,
      finalizedBy: uid,
      observedMimeType: mimeType,
      observedSize: size,
    },
    { merge: true }
  );

  // 🔒 Recompute if avatar related (hasAvatar check)
  if (intentPurpose === "avatar" || intentPurpose === "profile_picture") {
    await recomputeUserStats(uid);
  }

  logger.info("[ATTACHMENT][FINALIZED]", { attachmentId });

  return {
    ok: true,
    attachmentId,
  };
});
