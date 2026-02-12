import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const storage = admin.storage();

/**
 * createEbookAttachment
 *
 * 🔒 AUTHORITATIVE EBOOK INGESTION (PDF ONLY — Phase 3.7 LOCK)
 *
 * PURPOSE:
 * - Register a PDF ebook file already uploaded to Cloud Storage
 * - Create a canonical attachment record
 * - Bind it to a book / edition
 *
 * SECURITY CONTRACT:
 * - Auth required
 * - Caller must be admin or system
 * - Callable ONLY from ingestion / admin surfaces
 *
 * NOTE:
 * - This function DOES NOT upload files
 * - It only FINALIZES metadata + linkage
 */
export const createEbookAttachment = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;

  const {
    bookId,
    editionId,
    storagePath,
    mimeType,
    surface,
  } = request.data || {};

  // --------------------------------------------------
  // 🔐 ROLE CHECK (AUTHORITATIVE)
  // --------------------------------------------------
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User record not found.");
  }

  const user = userSnap.data()!;
  const role = user.role;

  if (role !== "admin" && role !== "system") {
    logger.warn("[EBOOK][DENY] Non-authoritative caller", { uid, role });
    throw new HttpsError(
      "permission-denied",
      "Only admin or system may attach ebooks."
    );
  }

  // --------------------------------------------------
  // 🔐 SURFACE LOCK
  // --------------------------------------------------
  if (surface !== "ingestion") {
    throw new HttpsError(
      "permission-denied",
      "Invalid call surface for ebook attachment."
    );
  }

  // --------------------------------------------------
  // 🧾 VALIDATION
  // --------------------------------------------------
  if (!bookId || !editionId || !storagePath) {
    throw new HttpsError(
      "invalid-argument",
      "Missing bookId, editionId, or storagePath."
    );
  }

  if (mimeType !== "application/pdf") {
    throw new HttpsError(
      "invalid-argument",
      "Only PDF ebooks are supported in Phase 3."
    );
  }

  // Enforce canonical storage location
  if (!storagePath.startsWith(`ebooks/${bookId}/`)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid ebook storage path."
    );
  }

  // --------------------------------------------------
  // 🧠 VERIFY STORAGE OBJECT EXISTS
  // --------------------------------------------------
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new HttpsError("not-found", "Ebook file not found in storage.");
  }

  // --------------------------------------------------
  // 🔁 PREVENT DUPLICATE EBOOK ATTACHMENTS
  // --------------------------------------------------
  const existing = await db
    .collection("attachments")
    .where("parentId", "==", editionId)
    .where("type", "==", "ebook")
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new HttpsError(
      "already-exists",
      "An ebook is already attached to this edition."
    );
  }

  // --------------------------------------------------
  // 🧱 CREATE ATTACHMENT (ATOMIC)
  // --------------------------------------------------
  const attachmentRef = db.collection("attachments").doc();
  const now = FieldValue.serverTimestamp();

  await attachmentRef.set({
    id: attachmentRef.id,
    type: "ebook",
    format: "pdf",
    mimeType,
    storagePath,

    parentType: "editions",
    parentId: editionId,
    bookId,

    uploader: {
      uid,
      role,
    },

    visibility: "restricted", // Accessed via signed URLs only
    status: "active",

    createdAt: now,
    updatedAt: now,
  });

  // --------------------------------------------------
  // 🔗 LINK TO EDITION (CANONICAL POINTER)
  // --------------------------------------------------
  await db.collection("editions").doc(editionId).set(
    {
      ebookAttachmentId: attachmentRef.id,
      updatedAt: now,
    },
    { merge: true }
  );

  logger.info("[EBOOK][ATTACHED]", {
    attachmentId: attachmentRef.id,
    editionId,
    bookId,
  });

  return {
    ok: true,
    attachmentId: attachmentRef.id,
  };
});