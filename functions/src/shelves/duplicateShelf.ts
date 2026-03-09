import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

type DuplicateShelfRequest = {
  sourceShelfId?: unknown;
  titleEn?: unknown;
  titleAr?: unknown;
};

function readNonEmptyString(value: unknown, maxLen = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function resolveShelfVisibility(data: Record<string, unknown>): "public" | "unlisted" | "private" {
  const visibilityRaw = readNonEmptyString(data.visibility, 40).toLowerCase();
  if (visibilityRaw === "public" || visibilityRaw === "unlisted") {
    return visibilityRaw;
  }

  if (data.isPublic === true) {
    return "public";
  }

  const statusRaw = readNonEmptyString(data.status, 40).toLowerCase();
  if (statusRaw === "public" || statusRaw === "visible") {
    return "public";
  }

  return "private";
}

function normalizeEntries(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, Record<string, unknown>> = {};
  for (const [bookId, entry] of Object.entries(source)) {
    const normalizedBookId = readNonEmptyString(bookId, 128);
    if (!normalizedBookId || !entry || typeof entry !== "object") {
      continue;
    }
    result[normalizedBookId] = { ...(entry as Record<string, unknown>) };
  }
  return result;
}

function normalizeOrderedBookIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value
    .map((item) => readNonEmptyString(item, 128))
    .filter((item) => item.length > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

export const duplicateShelf = onCall<DuplicateShelfRequest>({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const sourceShelfId = readNonEmptyString(request.data?.sourceShelfId, 190);
  if (!sourceShelfId) {
    throw new HttpsError("invalid-argument", "sourceShelfId is required.");
  }

  const db = admin.firestore();
  const sourceRef = db.collection("shelves").doc(sourceShelfId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Source shelf not found.");
  }

  const sourceData = (sourceSnap.data() ?? {}) as Record<string, unknown>;
  const sourceOwnerId = readNonEmptyString(sourceData.ownerId, 128);
  if (!sourceOwnerId) {
    throw new HttpsError("failed-precondition", "Source shelf owner is invalid.");
  }

  const sourceVisibility = resolveShelfVisibility(sourceData);
  const canDuplicate =
    uid === sourceOwnerId ||
    sourceVisibility === "public" ||
    sourceVisibility === "unlisted";
  if (!canDuplicate) {
    logger.warn("[SHELF][DUPLICATE_BLOCKED]", {
      uid,
      sourceShelfId,
      sourceOwnerId,
      visibility: sourceVisibility,
    });
    throw new HttpsError(
      "permission-denied",
      "This shelf cannot be duplicated."
    );
  }

  const sourceTitleEn =
    readNonEmptyString(sourceData.titleEn, 120) ||
    readNonEmptyString(sourceData.titleAr, 120) ||
    "Shelf";
  const sourceTitleAr =
    readNonEmptyString(sourceData.titleAr, 120) ||
    readNonEmptyString(sourceData.titleEn, 120) ||
    "Shelf";

  const requestedTitleEn = readNonEmptyString(request.data?.titleEn, 120);
  const requestedTitleAr = readNonEmptyString(request.data?.titleAr, 120);
  const titleEn = requestedTitleEn || `${sourceTitleEn} (Copy)`;
  const titleAr = requestedTitleAr || `${sourceTitleAr} (Copy)`;

  const entries = normalizeEntries(sourceData.entries);
  const orderedBookIds = normalizeOrderedBookIds(sourceData.orderedBookIds);
  const userCoverUrl = readNonEmptyString(sourceData.userCoverUrl, 2048) || null;
  const visibility = resolveShelfVisibility(sourceData);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const duplicateRef = db.collection("shelves").doc();
  const sourceCreatedAt = sourceData.createdAt ?? null;

  const duplicatePayload: Record<string, unknown> = {
    ownerId: uid,
    titleEn,
    titleAr,
    entries,
    visibility,
    createdAt: now,
    updatedAt: now,
    isSystem: false,
    copiedFrom: {
      shelfId: sourceShelfId,
      ownerId: sourceOwnerId,
      createdAt: sourceCreatedAt,
      copiedAt: now,
    },
  };

  if (orderedBookIds && orderedBookIds.length > 0) {
    duplicatePayload.orderedBookIds = orderedBookIds;
  }
  if (userCoverUrl) {
    duplicatePayload.userCoverUrl = userCoverUrl;
  }

  await duplicateRef.set(duplicatePayload);

  try {
    await db.collection("social_metrics").add({
      event: "shelf_duplicated",
      sourceShelfId,
      sourceOwnerId,
      newShelfId: duplicateRef.id,
      duplicatorUid: uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (analyticsError) {
    logger.warn("[SHELF][DUPLICATE_ANALYTICS_FAILED]", {
      uid,
      sourceShelfId,
      newShelfId: duplicateRef.id,
      error: String(analyticsError),
    });
  }

  logger.info("[SHELF][DUPLICATED]", {
    uid,
    sourceShelfId,
    sourceOwnerId,
    duplicateShelfId: duplicateRef.id,
    entriesCount: Object.keys(entries).length,
  });

  return {
    id: duplicateRef.id,
    ownerId: uid,
    titleEn,
    titleAr,
    entries,
    ...(orderedBookIds ? { orderedBookIds } : {}),
    ...(userCoverUrl ? { userCoverUrl } : {}),
    visibility,
    isSystem: false,
    copiedFrom: {
      shelfId: sourceShelfId,
      ownerId: sourceOwnerId,
      createdAt: sourceCreatedAt,
      copiedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
});
