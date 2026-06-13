import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import {
  attachmentVisibilityForPublication,
  normalizeBookRightsMode,
  normalizePublicationVisibility,
  publicationVisibilityForRightsMode,
  resolveBookOwnerUid,
  type PublicationVisibility,
} from "./rights/bookRights";

const VISIBILITY_WRITE_ALLOWLIST = new Set([
  "visibility",
  "visibilityUpdatedAt",
  "updatedAt",
]);

function assertAllowedVisibilityPatch(
  patch: Record<string, unknown>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter(
    (field) => !VISIBILITY_WRITE_ALLOWLIST.has(field)
  );
  if (unexpectedFields.length > 0) {
    logger.error("[PUBLISH][DISALLOWED_VISIBILITY_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    throw new HttpsError(
      "internal",
      "Visibility update attempted to mutate fields outside its authority."
    );
  }
}

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeBookId(value: unknown): string {
  const bookId = asNonEmptyString(value, 256);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }
  return bookId;
}

function normalizeRequestedVisibility(value: unknown): PublicationVisibility {
  const normalized = normalizePublicationVisibility(value, "public");
  if (value !== "public" && value !== "private") {
    throw new HttpsError("invalid-argument", "A valid visibility is required.");
  }
  return normalized;
}

export const updatePublishedBookVisibility = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const bookId = normalizeBookId((request.data as { bookId?: unknown }).bookId);
  const visibility = normalizeRequestedVisibility(
    (request.data as { visibility?: unknown }).visibility
  );
  const db = admin.firestore();
  const bookRef = db.collection("books").doc(bookId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const bookSnap = await tx.get(bookRef);
      if (!bookSnap.exists) {
        throw new HttpsError("not-found", "Book not found.");
      }

      const book = (bookSnap.data() ?? {}) as Record<string, unknown>;
      const ownerUid = resolveBookOwnerUid(book);
      if (!ownerUid || ownerUid !== caller.uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the book owner can update visibility."
        );
      }

      const editionId = asNonEmptyString(book.primaryEditionId, 256);
      if (!editionId) {
        throw new HttpsError(
          "failed-precondition",
          "Published Work has no primary Edition authority."
        );
      }
      const manifestationAvailability = asRecord(book.manifestationAvailability);
      const attachmentId = asNonEmptyString(manifestationAvailability?.attachmentId, 256);
      const rightsMode = normalizeBookRightsMode(book.rightsMode);
      const effectiveVisibility = publicationVisibilityForRightsMode(rightsMode, visibility);
      const attachmentVisibility = attachmentVisibilityForPublication(
        rightsMode,
        effectiveVisibility
      );
      const now = FieldValue.serverTimestamp();
      const visibilityPatch: Record<string, unknown> = {
        visibility: effectiveVisibility,
        visibilityUpdatedAt: now,
        updatedAt: now,
      };
      assertAllowedVisibilityPatch(
        visibilityPatch,
        "updatePublishedBookVisibility.book"
      );

      tx.set(
        bookRef,
        visibilityPatch,
        { merge: true }
      );

      assertAllowedVisibilityPatch(
        visibilityPatch,
        "updatePublishedBookVisibility.edition"
      );
      tx.set(
        db.collection("editions").doc(editionId),
        visibilityPatch,
        { merge: true }
      );

      if (attachmentId) {
        tx.set(
          db.collection("attachments").doc(attachmentId),
          {
            visibility: attachmentVisibility,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      return {
        bookId,
        visibility: effectiveVisibility,
        attachmentVisibility,
      };
    });

    logger.info("[PUBLISH][AUTHORED_BOOK_VISIBILITY_UPDATED]", {
      uid: caller.uid,
      bookId: result.bookId,
      visibility: result.visibility,
      attachmentVisibility: result.attachmentVisibility,
    });

    return result;
  } catch (error) {
    logger.error("[PUBLISH][AUTHORED_BOOK_VISIBILITY_UPDATE_FAILED]", {
      uid: caller.uid,
      bookId,
      visibility,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "Failed to update published book visibility."
    );
  }
});
