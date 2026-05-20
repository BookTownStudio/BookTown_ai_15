import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { assertAuthenticated } from "../shared/auth";
import { assertRoleAtLeast } from "../control/assertRole";
import type {
  AdminDeleteFeedbackAttachmentResponse,
  CreateFeedbackAttachmentUploadRequest,
  CreateFeedbackAttachmentUploadResponse,
  FeedbackAttachmentMetadata,
  FinalizeFeedbackAttachmentRequest,
  FinalizeFeedbackAttachmentResponse,
} from "../contracts/shared/apiContracts";

const FEEDBACK_COLLECTION = "feedback_reports";
const ATTACHMENTS_COLLECTION = "attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;
const ADMIN_READ_URL_TTL_MS = 10 * 60 * 1000;
const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const db = admin.firestore();
const getStorage = () => admin.storage();

function sanitizeFileName(fileName: string): string {
  const raw = fileName.trim().split("/").pop() || "screenshot.png";
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return sanitized || "screenshot.png";
}

function toIsoTimestamp(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function attachmentRef(feedbackId: string, attachmentId: string) {
  return db
    .collection(FEEDBACK_COLLECTION)
    .doc(feedbackId)
    .collection(ATTACHMENTS_COLLECTION)
    .doc(attachmentId);
}

function serializeAttachment(id: string, data: FirebaseFirestore.DocumentData, downloadUrl?: string | null): FeedbackAttachmentMetadata {
  return {
    attachmentId: id,
    feedbackId: String(data.feedbackId ?? ""),
    uid: String(data.uid ?? ""),
    fileName: String(data.fileName ?? ""),
    contentType: data.contentType,
    size: Number(data.size ?? 0),
    storagePath: String(data.storagePath ?? ""),
    status: data.status,
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
    finalizedAt: data.finalizedAt ? toIsoTimestamp(data.finalizedAt) : null,
    deletedAt: data.deletedAt ? toIsoTimestamp(data.deletedAt) : null,
    deletedBy: typeof data.deletedBy === "string" ? data.deletedBy : null,
    ...(downloadUrl === undefined ? {} : { downloadUrl }),
  };
}

async function assertFeedbackOwner(feedbackId: string, uid: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await db.collection(FEEDBACK_COLLECTION).doc(feedbackId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Feedback report not found.");
  if (snap.data()?.uid !== uid) throw new HttpsError("permission-denied", "Feedback report does not belong to caller.");
  return snap;
}

export async function listFeedbackAttachmentsForAdmin(feedbackId: string): Promise<FeedbackAttachmentMetadata[]> {
  const snap = await db
    .collection(FEEDBACK_COLLECTION)
    .doc(feedbackId)
    .collection(ATTACHMENTS_COLLECTION)
    .where("status", "==", "finalized")
    .orderBy("createdAt", "asc")
    .limit(MAX_ATTACHMENTS)
    .get();

  return Promise.all(snap.docs.map(async (doc) => {
    const data = doc.data();
    const storagePath = String(data.storagePath ?? "");
    const [downloadUrl] = storagePath
      ? await getStorage().bucket().file(storagePath).getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + ADMIN_READ_URL_TTL_MS,
        })
      : [null];
    return serializeAttachment(doc.id, data, downloadUrl);
  }));
}

export const createFeedbackAttachmentUpload = onCall({ cors: true }, async (request): Promise<CreateFeedbackAttachmentUploadResponse> => {
  const caller = assertAuthenticated(request.auth);
  const uid = caller.uid;
  const payload = request.data as CreateFeedbackAttachmentUploadRequest;

  if (!ALLOWED_CONTENT_TYPES.includes(payload.contentType)) {
    throw new HttpsError("invalid-argument", "Unsupported image content type.");
  }
  if (payload.size <= 0 || payload.size > MAX_BYTES) {
    throw new HttpsError("invalid-argument", "Image exceeds feedback attachment size limit.");
  }

  await assertFeedbackOwner(payload.feedbackId, uid);

  const existing = await db
    .collection(FEEDBACK_COLLECTION)
    .doc(payload.feedbackId)
    .collection(ATTACHMENTS_COLLECTION)
    .where("status", "in", ["pending", "finalized"])
    .get();
  if (existing.size >= MAX_ATTACHMENTS) {
    throw new HttpsError("resource-exhausted", "Maximum feedback attachments reached.");
  }

  const attachmentId = `fba_${randomUUID()}`;
  const fileName = sanitizeFileName(payload.fileName);
  const storagePath = `feedback_attachments/${payload.feedbackId}/${attachmentId}/${fileName}`;
  const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
  const [uploadUrl] = await getStorage().bucket().file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAtMs,
  });

  const now = FieldValue.serverTimestamp();
  await attachmentRef(payload.feedbackId, attachmentId).set({
    attachmentId,
    feedbackId: payload.feedbackId,
    uid,
    fileName,
    contentType: payload.contentType,
    size: payload.size,
    storagePath,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
    deletedAt: null,
    deletedBy: null,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
  });

  logger.info("[FEEDBACK_ATTACHMENT][UPLOAD_CREATED]", {
    uid,
    feedbackId: payload.feedbackId,
    attachmentId,
    size: payload.size,
    contentType: payload.contentType,
  });

  return {
    attachmentId,
    feedbackId: payload.feedbackId,
    uploadUrl,
    storagePath,
    expiresAt: new Date(expiresAtMs).toISOString(),
    maxBytes: MAX_BYTES,
    allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
  };
});

export const finalizeFeedbackAttachment = onCall({ cors: true }, async (request): Promise<FinalizeFeedbackAttachmentResponse> => {
  const caller = assertAuthenticated(request.auth);
  const uid = caller.uid;
  const payload = request.data as FinalizeFeedbackAttachmentRequest;
  await assertFeedbackOwner(payload.feedbackId, uid);

  const ref = attachmentRef(payload.feedbackId, payload.attachmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Attachment upload intent not found.");
  const data = snap.data() ?? {};
  if (data.uid !== uid) throw new HttpsError("permission-denied", "Attachment does not belong to caller.");
  if (data.status === "finalized") {
    return { attachment: serializeAttachment(snap.id, data) };
  }
  if (data.status !== "pending") throw new HttpsError("failed-precondition", "Attachment is not pending.");
  const expiresAt = data.expiresAt;
  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("deadline-exceeded", "Attachment upload token expired.");
  }

  const file = getStorage().bucket().file(String(data.storagePath ?? ""));
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "Uploaded attachment not found.");
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType ?? "");
  const size = Number(metadata.size ?? 0);
  if (!ALLOWED_CONTENT_TYPES.includes(contentType as typeof ALLOWED_CONTENT_TYPES[number])) {
    throw new HttpsError("failed-precondition", "Uploaded file content type is not allowed.");
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES || size !== Number(data.size)) {
    throw new HttpsError("failed-precondition", "Uploaded file size is invalid.");
  }

  const now = FieldValue.serverTimestamp();
  await ref.update({
    status: "finalized",
    contentType,
    size,
    finalizedAt: now,
    updatedAt: now,
  });
  const updated = (await ref.get()).data() ?? {};

  logger.info("[FEEDBACK_ATTACHMENT][FINALIZED]", {
    uid,
    feedbackId: payload.feedbackId,
    attachmentId: payload.attachmentId,
    size,
    contentType,
  });

  return { attachment: serializeAttachment(payload.attachmentId, updated) };
});

export const adminDeleteFeedbackAttachment = onCall({ cors: true }, async (request): Promise<AdminDeleteFeedbackAttachmentResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as { feedbackId: string; attachmentId: string };
  const ref = attachmentRef(payload.feedbackId, payload.attachmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Feedback attachment not found.");
  const data = snap.data() ?? {};
  const storagePath = String(data.storagePath ?? "");
  if (storagePath) {
    await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  }
  await ref.update({
    status: "deleted",
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.warn("[FEEDBACK_ATTACHMENT][ADMIN_DELETED]", {
    actorUid: uid,
    feedbackId: payload.feedbackId,
    attachmentId: payload.attachmentId,
  });

  return { attachmentId: payload.attachmentId, deleted: true };
});
