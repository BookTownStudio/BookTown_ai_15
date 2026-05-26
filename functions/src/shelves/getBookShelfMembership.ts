import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { recordOperationalMetric } from "../operations/operationalMetrics";
import { SHELF_BOOKS_COLLECTION } from "./shelfBookEntry";

const db = admin.firestore();
const MAX_MEMBERSHIPS = 50;

type GetBookShelfMembershipRequest = {
  uid?: unknown;
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

function normalizeReadingState(value: unknown): "reading" | "paused" | "abandoned" | "completed" | "rereading" | null {
  const normalized = sanitizeString(value, 32).toLowerCase();
  return normalized === "reading" ||
    normalized === "paused" ||
    normalized === "abandoned" ||
    normalized === "completed" ||
    normalized === "rereading"
    ? normalized
    : null;
}

function toIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function shelfNameFromData(data: Record<string, unknown>, fallback: string): string {
  return (
    sanitizeString(data.titleEn, 120) ||
    sanitizeString(data.titleAr, 120) ||
    sanitizeString(data.name, 120) ||
    fallback
  );
}

export const getBookShelfMembershipHandler = async (request: any) => {
  const startedAt = Date.now();
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = readRequiredString(request.data?.uid, "uid", 128);
  const bookId = readRequiredString(request.data?.bookId, "bookId", 128);
  if (request.auth.uid !== uid) {
    throw new HttpsError("permission-denied", "Cannot read another user's shelf membership.");
  }

  const [membershipSnap, progressSnap] = await Promise.all([
    db
      .collection(SHELF_BOOKS_COLLECTION)
      .where("ownerId", "==", uid)
      .where("bookId", "==", bookId)
      .orderBy("addedAt", "desc")
      .limit(MAX_MEMBERSHIPS + 1)
      .get(),
    db.collection("reading_progress").doc(`${uid}_${bookId}`).get(),
  ]);

  const membershipDocs = membershipSnap.docs.slice(0, MAX_MEMBERSHIPS);
  const hasMore = membershipSnap.docs.length > MAX_MEMBERSHIPS;
  const shelfIds = Array.from(
    new Set(
      membershipDocs
        .map((doc) => sanitizeString(doc.data().shelfId, 190))
        .filter(Boolean)
    )
  );

  const shelfSnaps = await Promise.all(
    shelfIds.map((shelfId) => db.collection("shelves").doc(shelfId).get())
  );
  const shelfNamesById = new Map<string, string>();
  shelfSnaps.forEach((snap, index) => {
    const shelfId = shelfIds[index];
    const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : {};
    shelfNamesById.set(shelfId, shelfNameFromData(data, shelfId));
  });

  const shelves = shelfIds.map((shelfId) => ({
    shelfId,
    shelfName: shelfNamesById.get(shelfId) || shelfId,
  }));

  const progress = progressSnap.exists ? ((progressSnap.data() ?? {}) as Record<string, unknown>) : null;
  const statusState = normalizeReadingState(progress?.status_state);

  const response = {
    uid,
    bookId,
    source: "shelf_books",
    membershipAuthority: "shelf_books",
    isOnAnyShelf: shelfIds.length > 0,
    shelfIds,
    shelfNames: shelves.map((shelf) => shelf.shelfName),
    shelves,
    hasMore,
    readingState: {
      exists: progressSnap.exists && statusState !== null,
      status_state: statusState,
      updatedAt: toIso(progress?.updatedAtIso ?? progress?.updatedAt ?? progress?.lastReadAt),
    },
  };
  await recordOperationalMetric({
    name: "shelf_membership_query_latency",
    value: Date.now() - startedAt,
    unit: "ms",
    dimensions: {
      membershipCount: shelfIds.length,
      hasMore,
    },
  });
  return response;
};

export const getBookShelfMembership = onCall<GetBookShelfMembershipRequest>(
  { cors: true },
  getBookShelfMembershipHandler
);
