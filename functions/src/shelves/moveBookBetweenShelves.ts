import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertShelfAllowsEntryMutation } from "./currentlyReadingInvariant";
import {
  writeShelfBookInTransaction,
  deleteShelfBookInTransaction,
} from "./shelfBookEntry";

const db = admin.firestore();

type MoveBookBetweenShelvesRequest = {
  fromShelfId?: unknown;
  toShelfId?: unknown;
  bookId?: unknown;
  snapshot?: unknown;
};

type ShelfBookSnapshot = {
  titleEn: string | null;
  titleAr: string | null;
  coverUrl: string | null;
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

function sanitizeSnapshot(input: unknown): ShelfBookSnapshot | null {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!source) return null;

  const titleEn = sanitizeString(source.titleEn, 300);
  const titleAr = sanitizeString(source.titleAr, 300);
  const coverUrl = sanitizeString(source.coverUrl, 2048);
  const hasAnyField = titleEn.length > 0 || titleAr.length > 0 || coverUrl.length > 0;

  if (!hasAnyField) return null;

  return {
    titleEn: titleEn || null,
    titleAr: titleAr || null,
    coverUrl: coverUrl || null,
  };
}

function readShelfOwnerId(shelfData: Record<string, unknown>): string {
  return sanitizeString(shelfData.ownerId, 128);
}

function readEntries(
  shelfData: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  if (!shelfData.entries || typeof shelfData.entries !== "object" || Array.isArray(shelfData.entries)) {
    return {};
  }
  return shelfData.entries as Record<string, Record<string, unknown>>;
}

export const moveBookBetweenShelves = onCall<MoveBookBetweenShelvesRequest>(
  { cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const fromShelfId = readRequiredString(request.data?.fromShelfId, "fromShelfId", 190);
    const toShelfId = readRequiredString(request.data?.toShelfId, "toShelfId", 190);
    const bookId = readRequiredString(request.data?.bookId, "bookId", 128);
    const fallbackSnapshot = sanitizeSnapshot(request.data?.snapshot);

    if (fromShelfId === toShelfId) {
      throw new HttpsError("failed-precondition", "Source and destination shelves must differ.");
    }

    const sourceRef = db.collection("shelves").doc(fromShelfId);
    const destinationRef = db.collection("shelves").doc(toShelfId);

    await db.runTransaction(async (tx) => {
      const [sourceSnap, destinationSnap] = await Promise.all([
        tx.get(sourceRef),
        tx.get(destinationRef),
      ]);

      if (!sourceSnap.exists) {
        throw new HttpsError("not-found", "Source shelf not found.");
      }
      if (!destinationSnap.exists) {
        throw new HttpsError("not-found", "Destination shelf not found.");
      }

      const sourceData = (sourceSnap.data() ?? {}) as Record<string, unknown>;
      const destinationData = (destinationSnap.data() ?? {}) as Record<string, unknown>;

      const sourceOwnerId = readShelfOwnerId(sourceData);
      const destinationOwnerId = readShelfOwnerId(destinationData);
      if (!sourceOwnerId || sourceOwnerId !== uid) {
        throw new HttpsError("permission-denied", "You do not own the source shelf.");
      }
      if (!destinationOwnerId || destinationOwnerId !== uid) {
        throw new HttpsError("permission-denied", "You do not own the destination shelf.");
      }

      assertShelfAllowsEntryMutation({
        physicalShelfId: sourceSnap.id,
        shelfData: sourceData,
      });
      assertShelfAllowsEntryMutation({
        physicalShelfId: destinationSnap.id,
        shelfData: destinationData,
      });

      const sourceEntries = readEntries(sourceData);
      const sourceEntry =
        sourceEntries[bookId] && typeof sourceEntries[bookId] === "object"
          ? (sourceEntries[bookId] as Record<string, unknown>)
          : null;

      if (!sourceEntry) {
        throw new HttpsError(
          "failed-precondition",
          "Book is not present on the source shelf."
        );
      }

      const destinationEntries = readEntries(destinationData);
      const destinationEntry =
        destinationEntries[bookId] && typeof destinationEntries[bookId] === "object"
          ? (destinationEntries[bookId] as Record<string, unknown>)
          : null;

      const sourceSnapshot =
        sourceEntry.snapshot && typeof sourceEntry.snapshot === "object" && !Array.isArray(sourceEntry.snapshot)
          ? sanitizeSnapshot(sourceEntry.snapshot)
          : null;
      const destinationSnapshot =
        destinationEntry?.snapshot && typeof destinationEntry.snapshot === "object" && !Array.isArray(destinationEntry.snapshot)
          ? sanitizeSnapshot(destinationEntry.snapshot)
          : null;

      const resolvedSnapshot = destinationSnapshot ?? sourceSnapshot ?? fallbackSnapshot ?? null;
      const addedAt =
        typeof sourceEntry.addedAt === "string" && sourceEntry.addedAt.trim().length > 0
          ? sourceEntry.addedAt
          : new Date().toISOString();

      // Write to shelf_books collection (SHELF_BOOKS_SCHEMA_V1).
      deleteShelfBookInTransaction(tx, db, fromShelfId, bookId);

      const recommendationOrigin =
        sourceEntry.recommendationOrigin &&
        typeof sourceEntry.recommendationOrigin === "object" &&
        !Array.isArray(sourceEntry.recommendationOrigin)
          ? (sourceEntry.recommendationOrigin as Record<string, unknown>)
          : undefined;

      writeShelfBookInTransaction(tx, db, {
        shelfId: toShelfId,
        bookId,
        ownerId: uid,
        addedAt,
        snapshot: resolvedSnapshot as Record<string, unknown> | null,
        ...(recommendationOrigin ? { recommendationOrigin } : {}),
      });
    });

    return { ok: true };
  }
);
