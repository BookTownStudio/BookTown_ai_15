import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { canUserReadBook } from "./rights/bookRights";
import { buildCatalogBookView } from "./catalog/catalogBookView";

const db = admin.firestore();

function asNonEmptyString(value: unknown, maxLen = 2048): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export const getAccessibleBook = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const bookId = asNonEmptyString((request.data as { bookId?: unknown } | undefined)?.bookId, 256);

  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = (bookSnap.data() ?? {}) as Record<string, unknown>;
  if (!canUserReadBook(book, caller.uid)) {
    throw new HttpsError("permission-denied", "Book access denied.");
  }

  const catalogBook = await buildCatalogBookView(bookId, book);

  logger.info("[BOOK_DETAILS][ACCESSIBLE_BOOK_LOADED]", {
    requestedBy: caller.uid,
    bookId,
    visibility: asNonEmptyString(book.visibility, 32) || "public",
    rightsMode: asNonEmptyString(book.rightsMode, 32) || "public_free",
    coverResolved: catalogBook.coverUrl.length > 0,
  });

  return catalogBook;
});
