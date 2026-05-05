import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import {
  RecommendationOrigin,
  resolveAuthoritativeRecommendationOrigin,
  sanitizeRecommendationOrigin,
} from "../attribution/recommendationOrigin";
import { assertShelfAllowsEntryMutation } from "./currentlyReadingInvariant";
import {
  writeShelfBookInTransaction,
} from "./shelfBookEntry";

const db = admin.firestore();

type AddBookToShelfRequest = {
  shelfId?: unknown;
  bookId?: unknown;
  snapshot?: unknown;
  recommendationContext?: unknown;
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

function readExistingRecommendationOrigin(value: unknown): RecommendationOrigin | null {
  return sanitizeRecommendationOrigin(value);
}

export const addBookToShelf = onCall<AddBookToShelfRequest>({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const bookId = readRequiredString(request.data?.bookId, "bookId", 128);
  const snapshot = sanitizeSnapshot(request.data?.snapshot);
  const parsedRecommendationOrigin = sanitizeRecommendationOrigin(
    request.data?.recommendationContext
  );

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

    const entries =
      shelfData.entries && typeof shelfData.entries === "object"
        ? (shelfData.entries as Record<string, unknown>)
        : {};
    const existingEntry =
      entries[bookId] && typeof entries[bookId] === "object"
        ? (entries[bookId] as Record<string, unknown>)
        : null;
    const existingOrigin = readExistingRecommendationOrigin(
      existingEntry?.recommendationOrigin
    );

    let recommendationOrigin: RecommendationOrigin | null = existingOrigin;
    if (!recommendationOrigin && parsedRecommendationOrigin) {
      recommendationOrigin = await resolveAuthoritativeRecommendationOrigin({
        uid,
        bookId,
        input: parsedRecommendationOrigin,
        tx,
      });
    }

    const addedAt =
      typeof existingEntry?.addedAt === "string" && existingEntry.addedAt.trim().length > 0
        ? existingEntry.addedAt
        : new Date().toISOString();

    // Write to shelf_books collection (SHELF_BOOKS_SCHEMA_V1).
    writeShelfBookInTransaction(tx, db, {
      shelfId,
      bookId,
      ownerId: uid,
      addedAt,
      snapshot: (snapshot ?? existingEntry?.snapshot ?? null) as Record<string, unknown> | null,
      ...(recommendationOrigin
        ? { recommendationOrigin: recommendationOrigin as Record<string, unknown> }
        : {}),
    });
  });

  return { ok: true };
});
