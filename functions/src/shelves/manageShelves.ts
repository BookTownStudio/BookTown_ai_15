import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { SHELF_BOOKS_COLLECTION } from "./shelfBookEntry";

const db = admin.firestore();
const MAX_SHELF_LIMIT = 200;
// Firestore batches are capped at 500 operations per commit.
const BATCH_SIZE = 500;

type ShelfVisibility = "public" | "unlisted" | "private";

type ShelfRecord = Record<string, unknown>;

type ListUserShelvesRequest = {
  uid?: unknown;
  limit?: unknown;
};

type GetShelfRequest = {
  shelfId?: unknown;
};

type CreateShelfRequest = {
  titleEn?: unknown;
  titleAr?: unknown;
  visibility?: unknown;
};

type UpdateShelfRequest = {
  shelfId?: unknown;
  updates?: unknown;
};

type DeleteShelfRequest = {
  shelfId?: unknown;
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

function toIsoString(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return new Date().toISOString();
}

function toBoundedLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(MAX_SHELF_LIMIT, Math.trunc(value)));
}

function resolveShelfVisibility(value: unknown): ShelfVisibility {
  const normalized = sanitizeString(value, 40).toLowerCase();
  if (normalized === "public" || normalized === "unlisted" || normalized === "private") {
    return normalized;
  }
  return "public";
}

/**
 * Builds an entries map keyed by bookId from shelf_books collection documents.
 * This is the authoritative source for shelf membership (SHELF_BOOKS_SCHEMA_V1).
 */
function buildEntriesFromShelfBooks(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const sbDoc of docs) {
    const sb = sbDoc.data() as Record<string, unknown>;
    const bookId = sanitizeString(sb.bookId, 128);
    if (!bookId) continue;
    result[bookId] = { ...sb };
  }
  return result;
}

function normalizeOrderedBookIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((item) => sanitizeString(item, 128))
    .filter((item) => item.length > 0);
  if (ids.length === 0) return undefined;
  return Array.from(new Set(ids));
}

function canReadShelf(
  shelf: ShelfRecord,
  viewerUid: string | null
): boolean {
  const ownerId = sanitizeString(shelf.ownerId, 128);
  if (viewerUid && ownerId === viewerUid) {
    return true;
  }
  const visibility = resolveShelfVisibility(shelf.visibility);
  return visibility === "public" || visibility === "unlisted";
}

function serializeShelfDoc(
  shelfId: string,
  source: ShelfRecord,
  prebuiltEntries: Record<string, Record<string, unknown>> = {}
): Record<string, unknown> {
  const titleEn = sanitizeString(source.titleEn, 120);
  const titleAr = sanitizeString(source.titleAr, 120);
  const projectedBookIds = Object.keys(prebuiltEntries);
  const orderedBookIds = normalizeOrderedBookIds(source.orderedBookIds);
  const copiedFromRaw =
    source.copiedFrom && typeof source.copiedFrom === "object" && !Array.isArray(source.copiedFrom)
      ? (source.copiedFrom as Record<string, unknown>)
      : null;

  return {
    id: shelfId,
    ownerId: sanitizeString(source.ownerId, 128),
    membershipAuthority: "shelf_books",
    membershipBookIds: projectedBookIds,
    titleEn: titleEn || titleAr || "Shelf",
    titleAr: titleAr || titleEn || "Shelf",
    descriptionEn: sanitizeString(source.descriptionEn, 280),
    descriptionAr: sanitizeString(source.descriptionAr, 280),
    // Projection only: generated from shelf_books for legacy display surfaces.
    // Consumers must not treat bookIds as a membership authority.
    bookIds: projectedBookIds,
    ...(orderedBookIds ? { orderedBookIds } : {}),
    ...(sanitizeString(source.userCoverUrl, 2048)
      ? { userCoverUrl: sanitizeString(source.userCoverUrl, 2048) }
      : {}),
    visibility: resolveShelfVisibility(source.visibility),
    isSystem: source.isSystem === true,
    // Projection only: generated from shelf_books for display.
    bookCount: projectedBookIds.length,
    createdAt: toIsoString(source.createdAt),
    updatedAt: toIsoString(source.updatedAt),
    ...(copiedFromRaw
      ? {
          copiedFrom: {
            shelfId: sanitizeString(copiedFromRaw.shelfId, 190),
            ownerId: sanitizeString(copiedFromRaw.ownerId, 128),
            ...(copiedFromRaw.createdAt ? { createdAt: toIsoString(copiedFromRaw.createdAt) } : {}),
            ...(copiedFromRaw.copiedAt ? { copiedAt: toIsoString(copiedFromRaw.copiedAt) } : {}),
          },
        }
      : {}),
  };
}

function sanitizeShelfPatch(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!source) {
    throw new HttpsError("invalid-argument", "updates must be an object.");
  }

  const patch: Record<string, unknown> = {};
  if ("titleEn" in source) {
    const titleEn = sanitizeString(source.titleEn, 120);
    if (!titleEn) {
      throw new HttpsError("invalid-argument", "titleEn must not be empty.");
    }
    patch.titleEn = titleEn;
  }
  if ("titleAr" in source) {
    const titleAr = sanitizeString(source.titleAr, 120);
    if (!titleAr) {
      throw new HttpsError("invalid-argument", "titleAr must not be empty.");
    }
    patch.titleAr = titleAr;
  }
  if ("descriptionEn" in source) {
    patch.descriptionEn = sanitizeString(source.descriptionEn, 280);
  }
  if ("descriptionAr" in source) {
    patch.descriptionAr = sanitizeString(source.descriptionAr, 280);
  }
  if ("userCoverUrl" in source) {
    const userCoverUrl = sanitizeString(source.userCoverUrl, 2048);
    patch.userCoverUrl = userCoverUrl || null;
  }
  if ("visibility" in source) {
    patch.visibility = resolveShelfVisibility(source.visibility);
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpsError("invalid-argument", "No valid shelf fields were provided.");
  }

  return patch;
}

/**
 * Batch-deletes all shelf_books documents belonging to a shelf.
 * Requires a single-field index on shelf_books(shelfId).
 * This is a best-effort cleanup — the shelf document is already deleted
 * before this runs, so orphaned shelf_books docs are harmless but wasteful.
 */
async function deleteShelfBooksForShelf(shelfId: string): Promise<void> {
  const snap = await db
    .collection(SHELF_BOOKS_COLLECTION)
    .where("shelfId", "==", shelfId)
    .get();

  if (snap.empty) return;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

export const listUserShelves = onCall<ListUserShelvesRequest>({ cors: true }, async (request) => {
  const targetUid = readRequiredString(request.data?.uid, "uid", 128);
  const viewerUid = request.auth?.uid ? sanitizeString(request.auth.uid, 128) : null;
  const limitSize = toBoundedLimit(request.data?.limit, 100);
  const isOwnerView = viewerUid === targetUid;

  // Fetch shelf metadata and all shelf_books for this user in parallel.
  const [shelvesSnap, shelfBooksSnap] = await Promise.all([
    db
      .collection("shelves")
      .where("ownerId", "==", targetUid)
      .orderBy("createdAt", "asc")
      .limit(limitSize + 50)
      .get(),
    db
      .collection(SHELF_BOOKS_COLLECTION)
      .where("ownerId", "==", targetUid)
      .get(),
  ]);

  // Group shelf_books by shelfId for O(1) lookup per shelf.
  const shelfBooksByShelf = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const sbDoc of shelfBooksSnap.docs) {
    const sid = sanitizeString((sbDoc.data() as Record<string, unknown>).shelfId, 190);
    if (!sid) continue;
    if (!shelfBooksByShelf.has(sid)) shelfBooksByShelf.set(sid, []);
    shelfBooksByShelf.get(sid)!.push(sbDoc);
  }

  const items: Record<string, unknown>[] = [];
  for (const shelfDoc of shelvesSnap.docs) {
    const entries = buildEntriesFromShelfBooks(shelfBooksByShelf.get(shelfDoc.id) ?? []);
    const shelf = serializeShelfDoc(shelfDoc.id, (shelfDoc.data() ?? {}) as ShelfRecord, entries);
    if (!isOwnerView && !canReadShelf(shelf, viewerUid)) {
      continue;
    }
    items.push(shelf);
    if (items.length >= limitSize) {
      break;
    }
  }

  return {
    items,
    hasMore: shelvesSnap.docs.length > items.length,
  };
});

export const getShelf = onCall<GetShelfRequest>({ cors: true }, async (request) => {
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const viewerUid = request.auth?.uid ? sanitizeString(request.auth.uid, 128) : null;
  // Fetch shelf metadata and its shelf_books in parallel.
  const [snap, shelfBooksSnap] = await Promise.all([
    db.collection("shelves").doc(shelfId).get(),
    db
      .collection(SHELF_BOOKS_COLLECTION)
      .where("shelfId", "==", shelfId)
      .get(),
  ]);

  if (!snap.exists) {
    throw new HttpsError("not-found", "Shelf not found.");
  }

  const entries = buildEntriesFromShelfBooks(shelfBooksSnap.docs);
  const shelf = serializeShelfDoc(snap.id, (snap.data() ?? {}) as ShelfRecord, entries);
  if (!canReadShelf(shelf, viewerUid)) {
    throw new HttpsError("permission-denied", "This shelf is not accessible.");
  }
  return shelf;
});

export const createShelf = onCall<CreateShelfRequest>({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = sanitizeString(request.auth.uid, 128);
  const titleEn = readRequiredString(request.data?.titleEn, "titleEn", 120);
  const titleAr = readRequiredString(request.data?.titleAr, "titleAr", 120);
  const visibility = resolveShelfVisibility(request.data?.visibility);
  const shelfRef = db.collection("shelves").doc();
  const now = FieldValue.serverTimestamp();

  await shelfRef.set({
    ownerId: uid,
    titleEn,
    titleAr,
    visibility,
    createdAt: now,
    updatedAt: now,
    isSystem: false,
  });

  return {
    id: shelfRef.id,
    ownerId: uid,
    titleEn,
    titleAr,
    bookIds: [],
    visibility,
    isSystem: false,
    bookCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
});

export const updateShelf = onCall<UpdateShelfRequest>({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = sanitizeString(request.auth.uid, 128);
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const patch = sanitizeShelfPatch(request.data?.updates);
  const shelfRef = db.collection("shelves").doc(shelfId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(shelfRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Shelf not found.");
    }
    const current = (snap.data() ?? {}) as ShelfRecord;
    const ownerId = sanitizeString(current.ownerId, 128);
    if (!ownerId || ownerId !== uid) {
      throw new HttpsError("permission-denied", "You do not own this shelf.");
    }
    if (current.isSystem === true && ("titleEn" in patch || "titleAr" in patch)) {
      throw new HttpsError(
        "failed-precondition",
        "System shelves cannot be renamed."
      );
    }
    tx.set(
      shelfRef,
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return {
    shelfId,
    updated: true,
  };
});

export const deleteShelf = onCall<DeleteShelfRequest>({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = sanitizeString(request.auth.uid, 128);
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const shelfRef = db.collection("shelves").doc(shelfId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(shelfRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Shelf not found.");
    }
    const current = (snap.data() ?? {}) as ShelfRecord;
    const ownerId = sanitizeString(current.ownerId, 128);
    if (!ownerId || ownerId !== uid) {
      throw new HttpsError("permission-denied", "You do not own this shelf.");
    }
    if (current.isSystem === true) {
      throw new HttpsError("failed-precondition", "System shelves cannot be deleted.");
    }
    tx.delete(shelfRef);
  });

  // Best-effort cleanup of shelf_books docs for this shelf.
  // Runs after the transaction so the shelf is already gone.
  // Requires a single-field index on shelf_books(shelfId).
  await deleteShelfBooksForShelf(shelfId);

  return {
    shelfId,
    deleted: true,
  };
});
