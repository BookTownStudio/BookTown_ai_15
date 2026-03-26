import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { getOrBuildReaderManifest } from "./readerManifestService";

const db = admin.firestore();
const storage = admin.storage();
const READER_URL_TTL_MS = 10 * 60 * 1000;

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

function sanitizeNarrationSessionState(
  value: unknown
): { provider: "browser_speech_synthesis"; playbackRate: number; paused: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const provider =
    record.provider === "browser_speech_synthesis" ? "browser_speech_synthesis" : null;
  const playbackRateRaw = record.playbackRate;
  const playbackRate =
    typeof playbackRateRaw === "number" &&
    Number.isFinite(playbackRateRaw) &&
    playbackRateRaw >= 0.5 &&
    playbackRateRaw <= 3
      ? Math.round(playbackRateRaw * 100) / 100
      : null;
  const paused = typeof record.paused === "boolean" ? record.paused : null;

  if (!provider || playbackRate === null || paused === null) {
    return null;
  }

  return {
    provider,
    playbackRate,
    paused,
  };
}

function sanitizeReaderLastPosition(
  value: unknown
): {
  page: number;
  totalPages?: number | null;
  format?: "pdf" | "epub" | "unknown" | null;
  mode?: "scroll" | "page" | null;
  paragraphIndex?: number | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const page = asPositiveInt(record.page);
  if (page === null) return null;

  const totalPages = record.totalPages === null ? null : asPositiveInt(record.totalPages);
  const format =
    record.format === "pdf" || record.format === "epub" || record.format === "unknown"
      ? record.format
      : null;
  const mode = record.mode === "scroll" || record.mode === "page" ? record.mode : null;
  const paragraphIndex =
    record.paragraphIndex === null ? null : asNonNegativeInt(record.paragraphIndex);

  return {
    page,
    ...(totalPages !== undefined ? { totalPages } : {}),
    ...(format !== null ? { format } : {}),
    ...(mode !== null ? { mode } : {}),
    ...(paragraphIndex !== null ? { paragraphIndex } : {}),
  };
}

function resolveResumePage(lastPosition: unknown): number {
  if (typeof lastPosition === "number" && Number.isFinite(lastPosition)) {
    return Math.max(1, Math.trunc(lastPosition));
  }

  if (lastPosition && typeof lastPosition === "object") {
    const page = (lastPosition as { page?: unknown }).page;
    if (typeof page === "number" && Number.isFinite(page)) {
      return Math.max(1, Math.trunc(page));
    }
  }

  return 1;
}

/**
 * Canonical Reader Session (V3)
 * - Resolves through server-built reader manifest
 * - Issues short-lived signed URL
 * - Returns deterministic resume page + format
 */
export const getOrCreateReadingSessionHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { bookId } = request.data || {};
  const uid = request.auth.uid;

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required");
  }

  logger.info("[READER][SESSION_INIT_REQUEST]", {
    uid,
    bookId,
  });

  const sessionId = `${uid}_${bookId}`;
  const sessionRef = db.collection("reading_sessions").doc(sessionId);
  const progressRef = db.collection("reading_progress").doc(`${uid}_${bookId}`);

  try {
    const [manifest, progressSnap, sessionSnap] = await Promise.all([
      getOrBuildReaderManifest({
        uid,
        bookId,
      }),
      progressRef.get(),
      sessionRef.get(),
    ]);

    const file = storage.bucket().file(manifest.storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      logger.error("[READER][MISSING_STORAGE_FILE]", {
        uid,
        bookId,
        storagePath: manifest.storagePath,
      });
      throw new HttpsError("not-found", "Ebook file missing from storage.");
    }

    let signedUrl: string;
    try {
      const [issuedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + READER_URL_TTL_MS,
      });
      signedUrl = issuedUrl;
    } catch (error) {
      logger.error("[READER][SIGNED_URL_ISSUE_FAILED]", {
        uid,
        bookId,
        storagePath: manifest.storagePath,
        error: String(error),
      });
      throw new HttpsError(
        "internal",
        "Reader URL signing is not configured for this environment."
      );
    }

    const progressData = progressSnap.exists
      ? (progressSnap.data() as { lastPosition?: unknown; lastAnchor?: unknown } | undefined)
      : null;
    const sessionData = sessionSnap.exists
      ? (sessionSnap.data() as { resumeAnchor?: unknown; narration?: unknown } | undefined)
      : null;

    const lastPosition = sanitizeReaderLastPosition(progressData?.lastPosition);
    const resumePage = resolveResumePage(lastPosition);
    const progressResumeAnchor = sanitizeCanonicalAnchor(progressData?.lastAnchor);
    const storedResumeAnchor = sanitizeCanonicalAnchor(sessionData?.resumeAnchor);
    const resumeAnchor = progressResumeAnchor ?? storedResumeAnchor ?? null;
    const narration = sanitizeNarrationSessionState(sessionData?.narration);
    const now = FieldValue.serverTimestamp();

    const sessionPayload: Record<string, unknown> = {
      userId: uid,
      bookId,
      status: "reading",
      resumePage,
      format: manifest.format,
      manifestVersion: manifest.version,
      updatedAt: now,
      createdAt: now,
    };

    if (progressResumeAnchor) {
      sessionPayload.resumeAnchor = progressResumeAnchor;
    }

    await sessionRef.set(
      sessionPayload,
      { merge: true }
    );

    logger.info("[READER][SESSION_READY]", {
      uid,
      bookId,
      sessionId,
      resumePage,
      format: manifest.format,
      manifestVersion: manifest.version,
    });

    return {
      signedUrl,
      resumePage,
      format: manifest.format,
      lastPosition,
      resumeAnchor,
      narration,
    };
  } catch (error: any) {
    logger.error("[READER][SESSION_INIT_FAILED]", {
      uid,
      bookId,
      error: String(error?.message || error),
      code: error instanceof HttpsError ? error.code : "internal",
    });
    throw error;
  }
};

export const getOrCreateReadingSession = onCall(
  { cors: true },
  getOrCreateReadingSessionHandler
);
