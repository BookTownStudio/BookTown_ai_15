// functions/src/reader/getReaderProgress.ts

import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : null;
}

function sanitizeCanonicalAnchor(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = asNonEmptyString(record.kind);
  const manifestVersion = asPositiveInt(record.manifestVersion);

  if (!kind || manifestVersion === null) {
    return null;
  }

  switch (kind) {
  case "epub_point": {
    const locationId = asNonEmptyString(record.locationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const cfi = asNonEmptyString(record.cfi);
    if (!locationId || !spineItemId || !cfi) return null;
    return { kind, manifestVersion, locationId, spineItemId, cfi };
  }
  case "epub_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const startCfi = asNonEmptyString(record.startCfi);
    const endCfi = asNonEmptyString(record.endCfi);
    if (!startLocationId || !endLocationId || !spineItemId || !startCfi || !endCfi) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      spineItemId,
      startCfi,
      endCfi,
    };
  }
  case "pdf_point": {
    const locationId = asNonEmptyString(record.locationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const textOffset = asNonNegativeInt(record.textOffset);
    if (!locationId || pageIndex === null || textOffset === null) return null;
    return { kind, manifestVersion, locationId, pageIndex, textOffset };
  }
  case "pdf_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const startOffset = asNonNegativeInt(record.startOffset);
    const endOffset = asNonNegativeInt(record.endOffset);
    const quote = typeof record.quote === "string" ? record.quote : null;
    const prefix = typeof record.prefix === "string" ? record.prefix : null;
    const suffix = typeof record.suffix === "string" ? record.suffix : null;
    if (
      !startLocationId ||
      !endLocationId ||
      pageIndex === null ||
      startOffset === null ||
      endOffset === null ||
      quote === null ||
      prefix === null ||
      suffix === null
    ) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      pageIndex,
      startOffset,
      endOffset,
      quote,
      prefix,
      suffix,
    };
  }
  default:
    return null;
  }
}

/**
 * getReaderProgress
 *
 * 🔒 AUTHORITATIVE READER STATE FETCH
 *
 * Responsibilities:
 * - Return the caller’s reading progress for a given book
 * - Enforce user-only access
 * - Never expose other users’ data
 *
 * Firestore contract:
 * collection: reading_progress
 * docId: {uid}_{bookId}
 */
export const getReaderProgressHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to read progress."
    );
  }

  const uid = request.auth.uid;
  const { bookId } = request.data || {};

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "bookId is required and must be a string."
    );
  }

  const progressId = `${uid}_${bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);

  logger.info("[READER][GET_PROGRESS]", {
    uid,
    bookId,
    progressId,
  });

  const snap = await progressRef.get();

  // No progress yet → return deterministic empty state
  if (!snap.exists) {
    return {
      exists: false,
      bookId,
      progress: 0,
      lastPosition: null,
      lastAnchor: null,
      anchorManifestVersion: null,
    };
  }

  const data = snap.data();
  if (!data) {
    logger.error("[READER][GET_PROGRESS_CORRUPT_DOC]", {
      uid,
      bookId,
      progressId,
    });
    throw new HttpsError("internal", "Progress document is corrupted.");
  }

  // 🔒 Defensive validation (should never fail if rules are correct)
  if (data?.userId !== uid) {
    logger.error("[READER][SECURITY_VIOLATION]", {
      uid,
      bookId,
      storedUserId: data?.userId,
    });

    throw new HttpsError("permission-denied", "Access denied.");
  }

  const lastAnchor = sanitizeCanonicalAnchor(data.lastAnchor);
  const anchorManifestVersion =
    lastAnchor?.manifestVersion ??
    asPositiveInt(data.anchorManifestVersion) ??
    null;

  return {
    exists: true,
    bookId: data.bookId,
    progress: data.progress ?? 0,
    lastPosition: data.lastPosition ?? null,
    lastAnchor,
    anchorManifestVersion,
    updatedAt: data.updatedAt ?? null,
  };
};

export const getReaderProgress = onCall({ cors: true }, getReaderProgressHandler);
