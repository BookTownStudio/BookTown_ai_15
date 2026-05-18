import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  buildShelfBookDocId,
  SHELF_BOOKS_COLLECTION,
} from "./shelfBookEntry";

const db = admin.firestore();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ListShelfEntriesRequest = {
  shelfId?: unknown;
  cursor?: unknown;
  limit?: unknown;
};

type ShelfVisibility = "public" | "unlisted" | "private";

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

function toBoundedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function resolveShelfVisibility(value: unknown): ShelfVisibility {
  const normalized = sanitizeString(value, 40).toLowerCase();
  if (normalized === "public" || normalized === "unlisted" || normalized === "private") {
    return normalized;
  }
  return "public";
}

function canReadShelf(shelf: Record<string, unknown>, viewerUid: string | null): boolean {
  const ownerId = sanitizeString(shelf.ownerId, 128);
  if (viewerUid && ownerId === viewerUid) return true;
  const visibility = resolveShelfVisibility(shelf.visibility);
  return visibility === "public" || visibility === "unlisted";
}

function readCursor(value: unknown): { addedAt: string; bookId: string } | null {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  if (!raw) return null;
  const addedAt = sanitizeString(raw.addedAt, 80);
  const bookId = sanitizeString(raw.bookId, 128);
  if (!addedAt || !bookId) {
    throw new HttpsError("invalid-argument", "cursor is invalid.");
  }
  return { addedAt, bookId };
}

function toEntry(doc: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> | null {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const bookId = sanitizeString(data.bookId, 128);
  const shelfId = sanitizeString(data.shelfId, 190);
  const ownerId = sanitizeString(data.ownerId, 128);
  const addedAt = sanitizeString(data.addedAt, 80);
  if (!bookId || !shelfId || !ownerId || !addedAt) return null;

  const snapshot =
    data.snapshot && typeof data.snapshot === "object" && !Array.isArray(data.snapshot)
      ? (data.snapshot as Record<string, unknown>)
      : null;
  const recommendationOrigin =
    data.recommendationOrigin &&
    typeof data.recommendationOrigin === "object" &&
    !Array.isArray(data.recommendationOrigin)
      ? (data.recommendationOrigin as Record<string, unknown>)
      : null;

  return {
    id: doc.id,
    shelfId,
    bookId,
    ownerId,
    addedAt,
    snapshot,
    ...(recommendationOrigin ? { recommendationOrigin } : {}),
  };
}

async function logLegacyProjectionMismatch(params: {
  ownerId: string;
  shelfId: string;
  canonicalCount: number;
}): Promise<void> {
  try {
    const legacySnap = await db
      .collection("users")
      .doc(params.ownerId)
      .collection("shelves")
      .doc(params.shelfId)
      .collection("books")
      .limit(MAX_LIMIT + 1)
      .get();

    if (!legacySnap.empty && legacySnap.size !== params.canonicalCount) {
      logger.warn("[SHELVES][LEGACY_PROJECTION_MISMATCH]", {
        ownerId: params.ownerId,
        shelfId: params.shelfId,
        canonicalCount: params.canonicalCount,
        legacyCount: legacySnap.size,
      });
    }
  } catch (error: any) {
    logger.warn("[SHELVES][LEGACY_PROJECTION_CHECK_FAILED]", {
      ownerId: params.ownerId,
      shelfId: params.shelfId,
      error: String(error?.message || error),
    });
  }
}

export const listShelfEntriesHandler = async (request: any) => {
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const limit = toBoundedLimit(request.data?.limit);
  const cursor = readCursor(request.data?.cursor);
  const viewerUid = request.auth?.uid ? sanitizeString(request.auth.uid, 128) : null;

  const shelfSnap = await db.collection("shelves").doc(shelfId).get();
  if (!shelfSnap.exists) {
    throw new HttpsError("not-found", "Shelf not found.");
  }

  const shelfData = (shelfSnap.data() ?? {}) as Record<string, unknown>;
  if (!canReadShelf(shelfData, viewerUid)) {
    throw new HttpsError("permission-denied", "This shelf is not accessible.");
  }

  const ownerId = sanitizeString(shelfData.ownerId, 128);
  if (!ownerId) {
    throw new HttpsError("failed-precondition", "Shelf owner is missing.");
  }

  let query: FirebaseFirestore.Query = db
    .collection(SHELF_BOOKS_COLLECTION)
    .where("shelfId", "==", shelfId)
    .where("ownerId", "==", ownerId)
    .orderBy("addedAt", "asc")
    .orderBy("bookId", "asc")
    .limit(limit + 1);

  if (cursor) {
    query = query.startAfter(cursor.addedAt, cursor.bookId);
  }

  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const items = docs
    .map(toEntry)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const last = items[items.length - 1] ?? null;
  const nextCursor =
    snap.docs.length > limit && last
      ? {
          addedAt: sanitizeString(last.addedAt, 80),
          bookId: sanitizeString(last.bookId, 128),
        }
      : null;

  await logLegacyProjectionMismatch({
    ownerId,
    shelfId,
    canonicalCount: snap.size,
  });

  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    source: "shelf_books",
    membershipAuthority: "shelf_books",
    shelfBookDocIds: items.map((entry) =>
      buildShelfBookDocId(
        sanitizeString(entry.shelfId, 190),
        sanitizeString(entry.bookId, 128)
      )
    ),
  };
};

export const listShelfEntries = onCall<ListShelfEntriesRequest>(
  { cors: true },
  listShelfEntriesHandler
);
