import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { recomputeUserStats } from "../userStats/recomputeUserStats";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();

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

  logger.info("[ATTACHMENT][FINALIZE] Start", {
    attachmentId,
    parentType,
    parentId,
    purpose,
    format,
  });

  // -------------------------------------------------
  // Guardrails
  // -------------------------------------------------
  const allowedFormats = ["epub", "pdf"];
  if (purpose === "ebook" && !allowedFormats.includes(format)) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid ebook format."
    );
  }

  // -------------------------------------------------
  // Public Domain enforcement (BOOKS ONLY)
  // -------------------------------------------------
  if (purpose === "ebook" && ["books", "editions"].includes(parentType)) {
    const parentSnap = await db
      .collection(parentType)
      .doc(parentId)
      .get();

    if (!parentSnap.exists) {
      throw new HttpsError("not-found", "Parent entity not found.");
    }

    const parent = parentSnap.data()!;
    if (!parent.publicDomain) {
      logger.warn("[ATTACHMENT][DENIED] Non-PD ebook upload", {
        parentType,
        parentId,
        uid,
      });

      throw new HttpsError(
        "permission-denied",
        "Ebooks for non-public-domain books are not allowed."
      );
    }
  }

  // -------------------------------------------------
  // Persist attachment metadata (AUTHORITATIVE)
  // -------------------------------------------------
  const now = FieldValue.serverTimestamp();

  await db
    .collection("attachments")
    .doc(attachmentId)
    .set(
      {
        id: attachmentId,
        type: purpose === "ebook" ? "ebook" : "file",
        purpose,
        format,
        parentType,
        parentId,
        storagePath,
        uploader: {
          uid,
        },
        visibility:
          ["books", "editions"].includes(parentType) ? "public" : "private",
        status: "active",
        finalizedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

  // 🔒 Recompute if avatar related (hasAvatar check)
  if (purpose === 'avatar' || purpose === 'profile_picture') {
    await recomputeUserStats(uid);
  }

  logger.info("[ATTACHMENT][FINALIZED]", { attachmentId });

  return {
    ok: true,
    attachmentId,
  };
});
