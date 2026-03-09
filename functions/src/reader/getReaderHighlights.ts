import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const MAX_HIGHLIGHTS = 500;

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

export const getReaderHighlightsHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = request.auth.uid;
  const { bookId } = request.data || {};
  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required.");
  }

  const prefix = `${uid}_${bookId}_`;
  logger.info("[READER][GET_HIGHLIGHTS]", {
    uid,
    bookId,
  });

  const snap = await db
    .collection("reader_highlights")
    .where(FieldPath.documentId(), ">=", prefix)
    .where(FieldPath.documentId(), "<", `${prefix}\uf8ff`)
    .limit(MAX_HIGHLIGHTS)
    .get();

  const highlights = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        highlightId:
          typeof data.highlightId === "string" && data.highlightId.trim().length > 0
            ? data.highlightId.trim()
            : doc.id.slice(prefix.length),
        bookId:
          typeof data.bookId === "string" && data.bookId.trim().length > 0
            ? data.bookId.trim()
            : bookId,
        quote: typeof data.quote === "string" ? data.quote : "",
        note: typeof data.note === "string" ? data.note : "",
        color:
          typeof data.color === "string" && data.color.trim().length > 0
            ? data.color.trim()
            : "yellow",
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
    highlights,
  };
};

export const getReaderHighlights = onCall({ cors: true }, getReaderHighlightsHandler);
