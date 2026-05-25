import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

const db = admin.firestore();
const storage = admin.storage();
const ATTACHMENT_WRITE_ALLOWLIST = new Set([
  "ebookAttachmentId",
  "ebookStoragePath",
  "epubStoragePath",
  "updatedAt",
]);

function assertAllowedAttachmentPatch(
  patch: Record<string, unknown>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter(
    (field) => !ATTACHMENT_WRITE_ALLOWLIST.has(field)
  );
  if (unexpectedFields.length > 0) {
    logger.error("[EBOOK][DISALLOWED_ATTACHMENT_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    throw new HttpsError(
      "internal",
      "Ebook attachment attempted to mutate fields outside its authority."
    );
  }
}

/**
 * createEbookAttachment
 *
 * 🔒 AUTHORITATIVE EBOOK INGESTION (PDF ONLY — Phase 3.7 LOCK)
 *
 * PURPOSE:
 * - Register a PDF ebook file already uploaded to Cloud Storage
 * - Create a canonical attachment record
 * - Bind it to a book / edition
 * - Own in-app readable-copy pointer fields:
 *   ebookAttachmentId, ebookStoragePath, and isReadableInApp semantics.
 *
 * AVAILABILITY FIELD OWNERSHIP:
 * - hasEbook: materializeBookAuthority.
 * - ebookAttachmentId / ebookStoragePath: this attachment finalizer for
 *   uploaded/admin-ingested ebooks.
 * - downloadable / isEbookAvailable: outside attachment ownership; readers must
 *   derive availability from attachment pointers.
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
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const { uid, role } = assertRoleFromClaims(caller, "superadmin");

  const {
    bookId,
    editionId,
    storagePath,
    mimeType,
    surface,
  } = request.data || {};

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
  // 🔗 LINK TO EDITION (CANONICAL READABLE-COPY POINTER)
  // --------------------------------------------------
  const editionPatch: Record<string, unknown> = {
    ebookAttachmentId: attachmentRef.id,
    ebookStoragePath: storagePath,
    updatedAt: now,
  };
  assertAllowedAttachmentPatch(editionPatch, "createEbookAttachment.edition");

  await db.collection("editions").doc(editionId).set(
    editionPatch,
    { merge: true }
  );

  const bookPatch: Record<string, unknown> = {
    ebookAttachmentId: attachmentRef.id,
    ebookStoragePath: storagePath,
    ...(mimeType === "application/epub+zip" ? { epubStoragePath: storagePath } : {}),
    updatedAt: now,
  };
  assertAllowedAttachmentPatch(bookPatch, "createEbookAttachment.book");

  await db.collection("books").doc(bookId).set(
    bookPatch,
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
