import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { buildCatalogBookView, isPublicReadableBook } from "./catalogBookView";

const db = admin.firestore();
const RELATED_BOOKS_LIMIT = 12;
const AUTHOR_QUERY_LIMIT = 36;

function asNonEmptyString(value: unknown, maxLen = 256): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export const getRelatedBooks = onCall({ cors: true }, async (request) => {
  const bookId = asNonEmptyString((request.data as { bookId?: unknown } | undefined)?.bookId);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = (bookSnap.data() || {}) as Record<string, unknown>;
  const authorId = asNonEmptyString(book.authorId);
  const authorEn = asNonEmptyString(book.authorEn, 300);

  let candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (authorId) {
    const snap = await db
      .collection("books")
      .where("authorId", "==", authorId)
      .limit(AUTHOR_QUERY_LIMIT)
      .get();
    candidates = snap.docs;
  }

  if (candidates.length === 0 && authorEn) {
    const snap = await db
      .collection("books")
      .where("authorEn", "==", authorEn)
      .limit(AUTHOR_QUERY_LIMIT)
      .get();
    candidates = snap.docs;
  }

  const filtered = candidates
    .filter((doc) => doc.id !== bookId)
    .map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
    .filter((entry) => isPublicReadableBook(entry.data))
    .sort((a, b) => {
      const ratingA = Number(a.data.rating) || 0;
      const ratingB = Number(b.data.rating) || 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
      const titleA = asNonEmptyString(a.data.titleEn, 300) || asNonEmptyString(a.data.title, 300);
      const titleB = asNonEmptyString(b.data.titleEn, 300) || asNonEmptyString(b.data.title, 300);
      return titleA.localeCompare(titleB);
    })
    .slice(0, RELATED_BOOKS_LIMIT);

  const books = await Promise.all(
    filtered.map((entry) => buildCatalogBookView(entry.id, entry.data))
  );

  return {
    books,
  };
});
