import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const MAX_SHELF_LIMIT = 200;

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

function normalizeEntries(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, Record<string, unknown>> = {};
  for (const [bookId, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedBookId = sanitizeString(bookId, 128);
    if (!normalizedBookId || !entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    result[normalizedBookId] = { ...(entry as Record<string, unknown>) };
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
  source: ShelfRecord
): Record<string, unknown> {
  const titleEn = sanitizeString(source.titleEn, 120);
  const titleAr = sanitizeString(source.titleAr, 120);
  const entries = normalizeEntries(source.entries);
  const orderedBookIds = normalizeOrderedBookIds(source.orderedBookIds);
  const copiedFromRaw =
    source.copiedFrom && typeof source.copiedFrom === "object" && !Array.isArray(source.copiedFrom)
      ? (source.copiedFrom as Record<string, unknown>)
      : null;

  return {
    id: shelfId,
    ownerId: sanitizeString(source.ownerId, 128),
    titleEn: titleEn || titleAr || "Shelf",
    titleAr: titleAr || titleEn || "Shelf",
    descriptionEn: sanitizeString(source.descriptionEn, 280),
    descriptionAr: sanitizeString(source.descriptionAr, 280),
    entries,
    ...(orderedBookIds ? { orderedBookIds } : {}),
    ...(sanitizeString(source.userCoverUrl, 2048)
      ? { userCoverUrl: sanitizeString(source.userCoverUrl, 2048) }
      : {}),
    visibility: resolveShelfVisibility(source.visibility),
    isSystem: source.isSystem === true,
    bookCount: Object.keys(entries).length,
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

export const listUserShelves = onCall<ListUserShelvesRequest>({ cors: true }, async (request) => {
  const targetUid = readRequiredString(request.data?.uid, "uid", 128);
  const viewerUid = request.auth?.uid ? sanitizeString(request.auth.uid, 128) : null;
  const limitSize = toBoundedLimit(request.data?.limit, 100);
  const isOwnerView = viewerUid === targetUid;

  const snap = await db
    .collection("shelves")
    .where("ownerId", "==", targetUid)
    .orderBy("createdAt", "asc")
    .limit(limitSize + 50)
    .get();

  const items: Record<string, unknown>[] = [];
  for (const shelfDoc of snap.docs) {
    const shelf = serializeShelfDoc(shelfDoc.id, (shelfDoc.data() ?? {}) as ShelfRecord);
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
    hasMore: snap.docs.length > items.length,
  };
});

export const getShelf = onCall<GetShelfRequest>({ cors: true }, async (request) => {
  const shelfId = readRequiredString(request.data?.shelfId, "shelfId", 190);
  const viewerUid = request.auth?.uid ? sanitizeString(request.auth.uid, 128) : null;
  const snap = await db.collection("shelves").doc(shelfId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Shelf not found.");
  }
  const shelf = serializeShelfDoc(snap.id, (snap.data() ?? {}) as ShelfRecord);
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
    entries: {},
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
    entries: {},
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

  return {
    shelfId,
    deleted: true,
  };
});
