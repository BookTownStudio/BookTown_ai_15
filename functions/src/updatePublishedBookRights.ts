import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import {
  attachmentVisibilityForRightsMode,
  bookVisibilityForRightsMode,
  normalizeBookRightsMode,
  type BookRightsMode,
  resolveBookOwnerUid,
} from "./rights/bookRights";

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeBookId(value: unknown): string {
  const bookId = asNonEmptyString(value, 256);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }
  return bookId;
}

function normalizeRequestedRightsMode(value: unknown): BookRightsMode {
  const normalized = normalizeBookRightsMode(value);
  if (
    value !== "public_free" &&
    value !== "private" &&
    value !== "paid" &&
    value !== "premium_only"
  ) {
    throw new HttpsError("invalid-argument", "A valid rightsMode is required.");
  }
  return normalized;
}

export const updatePublishedBookRights = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const bookId = normalizeBookId((request.data as { bookId?: unknown }).bookId);
  const rightsMode = normalizeRequestedRightsMode(
    (request.data as { rightsMode?: unknown }).rightsMode
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
          "Only the book owner can update rights."
        );
      }

      const bookType = asNonEmptyString(book.bookType, 64);
      const source = asNonEmptyString(book.source, 64);
      if (bookType !== "authored_native" && source !== "write_release") {
        throw new HttpsError(
          "failed-precondition",
          "This rights update path is only available for authored books."
        );
      }

      const editionId = asNonEmptyString(book.editionId, 256);
      const attachmentId = asNonEmptyString(book.ebookAttachmentId, 256);
      const now = FieldValue.serverTimestamp();
      const bookVisibility = bookVisibilityForRightsMode(rightsMode);
      const attachmentVisibility = attachmentVisibilityForRightsMode(rightsMode);

      tx.set(
        bookRef,
        {
          rightsMode,
          visibility: bookVisibility,
          updatedAt: now,
        },
        { merge: true }
      );

      if (editionId) {
        tx.set(
          db.collection("editions").doc(editionId),
          {
            rightsMode,
            visibility: bookVisibility,
            updatedAt: now,
          },
          { merge: true }
        );
      }

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
        rightsMode,
        visibility: bookVisibility,
        attachmentVisibility,
      };
    });

    logger.info("[PUBLISH][AUTHORED_BOOK_RIGHTS_UPDATED]", {
      uid: caller.uid,
      bookId: result.bookId,
      rightsMode: result.rightsMode,
      visibility: result.visibility,
      attachmentVisibility: result.attachmentVisibility,
    });

    return result;
  } catch (error) {
    logger.error("[PUBLISH][AUTHORED_BOOK_RIGHTS_UPDATE_FAILED]", {
      uid: caller.uid,
      bookId,
      rightsMode,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "Failed to update published book rights."
    );
  }
});
