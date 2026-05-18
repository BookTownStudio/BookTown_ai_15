import type {
  Firestore,
  DocumentReference,
  Transaction,
  WriteBatch,
} from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export const SHELF_BOOKS_COLLECTION = "shelf_books";

/**
 * SHELF_BOOKS_SCHEMA_V1
 *
 * Collection: shelf_books
 * Document ID: {shelfId}_{bookId}
 *
 * Fields:
 *   shelfId            string   — parent shelf document ID
 *   bookId             string   — canonical book document ID
 *   ownerId            string   — user UID who owns the shelf
 *   addedAt            string   — ISO-8601 timestamp of when book was added
 *   snapshot           object|null — {titleEn, titleAr, coverUrl} at add time
 *   recommendationOrigin object|null — optional attribution data
 *   updatedAt          Timestamp  — server-set on every write
 *
 * Replaces: shelves/{shelfId}.entries.{bookId} map field
 * The legacy entries map is kept for backward compatibility until a migration
 * removes it. All new writes go to both paths (dual-write).
 */

export type ShelfBookEntryPayload = {
  shelfId: string;
  bookId: string;
  ownerId: string;
  addedAt: string;
  snapshot: Record<string, unknown> | null;
  recommendationOrigin?: Record<string, unknown>;
};

export function buildShelfBookDocId(shelfId: string, bookId: string): string {
  return `${shelfId}_${bookId}`;
}

export function shelfBookRef(
  db: Firestore,
  shelfId: string,
  bookId: string
): DocumentReference {
  return db
    .collection(SHELF_BOOKS_COLLECTION)
    .doc(buildShelfBookDocId(shelfId, bookId));
}

export async function readShelfBookInTransaction(
  tx: Transaction,
  db: Firestore,
  shelfId: string,
  bookId: string
): Promise<Record<string, unknown> | null> {
  const snap = await tx.get(shelfBookRef(db, shelfId, bookId));
  return snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
}

export function writeShelfBookInTransaction(
  tx: Transaction,
  db: Firestore,
  payload: ShelfBookEntryPayload
): void {
  const ref = shelfBookRef(db, payload.shelfId, payload.bookId);
  const doc: Record<string, unknown> = {
    shelfId: payload.shelfId,
    bookId: payload.bookId,
    ownerId: payload.ownerId,
    addedAt: payload.addedAt,
    snapshot: payload.snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (payload.recommendationOrigin) {
    doc.recommendationOrigin = payload.recommendationOrigin;
  }
  tx.set(ref, doc);
}

export function deleteShelfBookInTransaction(
  tx: Transaction,
  db: Firestore,
  shelfId: string,
  bookId: string
): void {
  tx.delete(shelfBookRef(db, shelfId, bookId));
}

export function writeShelfBookInBatch(
  batch: WriteBatch,
  db: Firestore,
  payload: ShelfBookEntryPayload
): void {
  const ref = shelfBookRef(db, payload.shelfId, payload.bookId);
  const doc: Record<string, unknown> = {
    shelfId: payload.shelfId,
    bookId: payload.bookId,
    ownerId: payload.ownerId,
    addedAt: payload.addedAt,
    snapshot: payload.snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (payload.recommendationOrigin) {
    doc.recommendationOrigin = payload.recommendationOrigin;
  }
  batch.set(ref, doc);
}
