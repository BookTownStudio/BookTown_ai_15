import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertShelfAllowsEntryMutation } from "./currentlyReadingInvariant";
import { deleteShelfBookInTransaction } from "./shelfBookEntry";

const db = admin.firestore();

type RemoveBookFromShelfRequest = {
  shelfId?: unknown;
  bookId?: unknown;
};

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function readRequiredString(value: unknown, field: string, maxLen: number): string {
  const normalized = sanitizeString(value, maxLen);
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return normalized;
}

export const removeBookFromShelf = onCall<RemoveBookFromShelfRequest>(
  { cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
    const bookId = readRequiredString(request.data?.bookId, "bookId", 128);

    const shelfRef = db.collection("shelves").doc(shelfId);
    await db.runTransaction(async (tx) => {
      const shelfSnap = await tx.get(shelfRef);
      if (!shelfSnap.exists) {
        throw new HttpsError("not-found", "Shelf not found.");
      }

      const shelfData = (shelfSnap.data() ?? {}) as Record<string, unknown>;
      const ownerId = sanitizeString(shelfData.ownerId, 128);
      if (!ownerId || ownerId !== uid) {
        throw new HttpsError("permission-denied", "You do not own this shelf.");
      }
      assertShelfAllowsEntryMutation({
        physicalShelfId: shelfSnap.id,
        shelfData,
      });

      // Remove from shelf_books collection (SHELF_BOOKS_SCHEMA_V1).
      deleteShelfBookInTransaction(tx, db, shelfId, bookId);
    });

    return { ok: true };
  }
);
