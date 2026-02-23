import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();
const storage = admin.storage();

const ALLOWED_PARENT_TYPES = new Set(["posts", "projects", "drafts"]);
const ALLOWED_ATTACHMENT_TYPES = new Set(["IMAGE", "DOCUMENT"]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

type ParentType = "posts" | "projects" | "drafts";
type AttachmentType = "IMAGE" | "DOCUMENT";

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const fallback = "upload.bin";
  if (!trimmed) return fallback;
  const raw = trimmed.split("/").pop() ?? fallback;
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : fallback;
}

function inferFormat(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || ext.length > 12) return "bin";
  return ext;
}

function assertPathOwnership(uid: string, storagePath: string): void {
  const ownsAttachmentPath = storagePath.startsWith(`attachments/${uid}/`);
  if (!ownsAttachmentPath) {
    throw new HttpsError("permission-denied", "Invalid storage ownership.");
  }
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
    // Allow transient composer draft id used before server draft persistence.
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
 * getUploadToken
 *
 * ATTACHMENT_UPLOAD_INTENT_V2
 * Issues a short-lived signed write URL and stores authoritative upload intent.
 */
export const getUploadToken = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;

  const rawParentType = String(request.data?.parentType ?? "").trim();
  const rawParentId = String(request.data?.parentId ?? "").trim();
  const rawType = String(request.data?.type ?? "").trim().toUpperCase();
  const rawFileName = String(request.data?.fileName ?? "").trim();
  const rawContentType = String(request.data?.contentType ?? "").trim().toLowerCase();
  const rawSize = Number(request.data?.size ?? 0);

  if (
    !rawParentType ||
    !rawParentId ||
    !rawType ||
    !rawFileName
  ) {
    throw new HttpsError("invalid-argument", "Missing upload intent fields.");
  }

  if (!ALLOWED_PARENT_TYPES.has(rawParentType)) {
    throw new HttpsError("invalid-argument", "Unsupported parent type.");
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(rawType)) {
    throw new HttpsError("invalid-argument", "Unsupported attachment type.");
  }

  const parentType = rawParentType as ParentType;
  const parentId = rawParentId;
  const type = rawType as AttachmentType;

  await assertParentAccess(uid, parentType, parentId);

  const attachmentId = `att_${randomUUID()}`;
  const fileName = sanitizeFileName(rawFileName);
  const format = inferFormat(fileName);
  const purpose = type.toLowerCase();

  let storagePath = "";
  let expectedMimePrefix = "";
  let maxBytes = IMAGE_MAX_BYTES;

  if (type === "IMAGE") {
    storagePath = `attachments/${uid}/${attachmentId}/${fileName}`;
    expectedMimePrefix = "image/";
    maxBytes = IMAGE_MAX_BYTES;
  } else {
    if (format !== "pdf") {
      throw new HttpsError(
        "invalid-argument",
        "Only PDF documents are supported."
      );
    }
    storagePath = `attachments/${uid}/${attachmentId}.pdf`;
    expectedMimePrefix = "application/pdf";
    maxBytes = DOCUMENT_MAX_BYTES;
  }

  if (!Number.isFinite(rawSize) || rawSize <= 0) {
    throw new HttpsError("invalid-argument", "Invalid file size.");
  }
  if (rawSize > maxBytes) {
    throw new HttpsError("invalid-argument", "File exceeds maximum allowed size.");
  }

  if (!rawContentType) {
    throw new HttpsError("invalid-argument", "Missing contentType.");
  }
  if (type === "IMAGE" && !rawContentType.startsWith("image/")) {
    throw new HttpsError("invalid-argument", "Only image uploads are allowed for IMAGE type.");
  }
  if (type === "DOCUMENT" && rawContentType !== "application/pdf") {
    throw new HttpsError("invalid-argument", "Only PDF uploads are allowed for DOCUMENT type.");
  }

  assertPathOwnership(uid, storagePath);

  const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAtMs,
  });

  const now = FieldValue.serverTimestamp();
  await db.collection("_attachment_upload_intents").doc(attachmentId).set({
    attachmentId,
    uid,
    parentType,
    parentId,
    type,
    purpose,
    format,
    fileName,
    storagePath,
    expectedMimePrefix,
    maxBytes,
    declaredContentType: rawContentType,
    declaredSize: rawSize,
    status: "issued",
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    createdAt: now,
    updatedAt: now,
  });

  logger.info("[ATTACHMENT][INTENT_ISSUED]", {
    attachmentId,
    uid,
    parentType,
    parentId,
    type,
    expiresAtMs,
  });

  return {
    token: attachmentId,
    attachmentId,
    uploadUrl,
    storagePath,
    fileName,
    purpose,
    format,
    type,
    expiresAt: expiresAtMs,
  };
});
