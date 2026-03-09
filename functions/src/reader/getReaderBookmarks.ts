import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const MAX_BOOKMARKS = 200;

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }
  return 0;
}

export const getReaderBookmarksHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = request.auth.uid;
  const { bookId } = request.data || {};
  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required.");
  }

  const prefix = `${uid}_${bookId}_`;
  logger.info("[READER][GET_BOOKMARKS]", {
    uid,
    bookId,
  });

  const snap = await db
    .collection("reader_bookmarks")
    .where(FieldPath.documentId(), ">=", prefix)
    .where(FieldPath.documentId(), "<", `${prefix}\uf8ff`)
    .limit(MAX_BOOKMARKS)
    .get();

  const bookmarks = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        bookmarkId:
          typeof data.bookmarkId === "string" && data.bookmarkId.trim().length > 0
            ? data.bookmarkId.trim()
            : doc.id.slice(prefix.length),
        bookId:
          typeof data.bookId === "string" && data.bookId.trim().length > 0
            ? data.bookId.trim()
            : bookId,
        label: typeof data.label === "string" ? data.label : "",
        page:
          typeof data.page === "number" && Number.isFinite(data.page)
            ? Math.max(1, Math.trunc(data.page))
            : null,
        cfi: typeof data.cfi === "string" && data.cfi.trim().length > 0 ? data.cfi : null,
        updatedAt: toMillis(data.updatedAt) || null,
      };
    })
    .sort((left, right) => {
      const rightUpdated = right.updatedAt || 0;
      const leftUpdated = left.updatedAt || 0;
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
      const rightPage = right.page || 0;
      const leftPage = left.page || 0;
      return rightPage - leftPage;
    });

  return {
    bookmarks,
  };
};

export const getReaderBookmarks = onCall({ cors: true }, getReaderBookmarksHandler);
