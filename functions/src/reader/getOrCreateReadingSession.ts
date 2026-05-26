import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { getOrBuildReaderManifest } from "./readerManifestService";
import {
  attemptStableAnchorMigration,
  evaluateContinuityCompatibility,
  provenanceFromManifest,
  provenanceFromStoredRecord,
  writeSourceProvenance,
} from "./readerContinuityCompatibility";

const db = admin.firestore();
const storage = admin.storage();
const READER_URL_TTL_MS = 10 * 60 * 1000;

type ResumeContinuityMode = "anchor" | "approximate_position" | "start";
type ResumeAnchorSource = "reading_progress" | "reading_sessions";

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

function asProgressFraction(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function boundResumePage(page: number, estimatedPageCount: number | null): number {
  const normalized = Math.max(1, Math.trunc(page));
  if (!estimatedPageCount || estimatedPageCount <= 0) {
    return normalized;
  }
  return Math.min(normalized, Math.trunc(estimatedPageCount));
}

function resolveFallbackResumePage(params: {
  lastPosition: ReturnType<typeof sanitizeReaderLastPosition>;
  progress: number | null;
  estimatedPageCount: number | null;
}): { resumePage: number; usedApproximateFallback: boolean } {
  const { lastPosition, progress, estimatedPageCount } = params;
  if (lastPosition) {
    return {
      resumePage: boundResumePage(lastPosition.page, estimatedPageCount),
      usedApproximateFallback: true,
    };
  }

  if (progress !== null && estimatedPageCount && estimatedPageCount > 0) {
    return {
      resumePage: boundResumePage(
        Math.max(1, Math.round(progress * estimatedPageCount)),
        estimatedPageCount
      ),
      usedApproximateFallback: progress > 0,
    };
  }

  return { resumePage: 1, usedApproximateFallback: false };
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
      ? (progressSnap.data() as {
          progress?: unknown;
          lastPosition?: unknown;
          lastAnchor?: unknown;
          manifestVersion?: unknown;
          anchorManifestVersion?: unknown;
          sourceSignatureHash?: unknown;
          attachmentId?: unknown;
          sourceType?: unknown;
          editionId?: unknown;
        } | undefined)
      : null;
    const sessionData = sessionSnap.exists
      ? (sessionSnap.data() as {
          resumeAnchor?: unknown;
          narration?: unknown;
          manifestVersion?: unknown;
          anchorManifestVersion?: unknown;
          sourceSignatureHash?: unknown;
          attachmentId?: unknown;
          sourceType?: unknown;
          editionId?: unknown;
        } | undefined)
      : null;

    const lastPosition = sanitizeReaderLastPosition(progressData?.lastPosition);
    const progress = asProgressFraction(progressData?.progress);
    const fallback = resolveFallbackResumePage({
      lastPosition,
      progress,
      estimatedPageCount: manifest.estimatedPageCount,
    });
    const resumePage = fallback.resumePage;
    const progressResumeAnchor = sanitizeCanonicalAnchor(progressData?.lastAnchor);
    const storedResumeAnchor = sanitizeCanonicalAnchor(sessionData?.resumeAnchor);
    const sourceProvenance = provenanceFromManifest(manifest);
    const progressCompatibility = evaluateContinuityCompatibility({
      current: sourceProvenance,
      stored: provenanceFromStoredRecord(progressData, progressResumeAnchor),
    });
    const storedCompatibility = evaluateContinuityCompatibility({
      current: sourceProvenance,
      stored: provenanceFromStoredRecord(sessionData, storedResumeAnchor),
    });

    let resumeAnchor = progressCompatibility.compatible
      ? progressResumeAnchor
      : storedCompatibility.compatible
        ? storedResumeAnchor
        : null;
    let resumeAnchorSource: ResumeAnchorSource | null = progressCompatibility.compatible
      ? "reading_progress"
      : storedCompatibility.compatible
        ? "reading_sessions"
        : null;
    let compatibilityStatus =
      progressCompatibility.compatible
        ? progressCompatibility.status
        : storedCompatibility.compatible
          ? storedCompatibility.status
          : "incompatible";
    let continuityMigrationSuccess = 0;
    let continuityMigrationFailure = 0;

    if (!resumeAnchor && (progressResumeAnchor || storedResumeAnchor)) {
      const migrationCandidate =
        (await attemptStableAnchorMigration({
          uid,
          bookId,
          anchor: progressResumeAnchor,
          current: sourceProvenance,
        })) ||
        (await attemptStableAnchorMigration({
          uid,
          bookId,
          anchor: storedResumeAnchor,
          current: sourceProvenance,
        }));

      if (migrationCandidate) {
        resumeAnchor = migrationCandidate.anchor;
        resumeAnchorSource = progressResumeAnchor ? "reading_progress" : "reading_sessions";
        compatibilityStatus = "migrated";
        continuityMigrationSuccess = 1;
      } else {
        continuityMigrationFailure = 1;
      }
    }
    const continuityMode: ResumeContinuityMode = resumeAnchor
      ? "anchor"
      : fallback.usedApproximateFallback
        ? "approximate_position"
        : "start";
    const narration = sanitizeNarrationSessionState(sessionData?.narration);
    const now = FieldValue.serverTimestamp();

    // sessionSnap.exists guards createdAt so it is only written on first creation.
    // Subsequent calls (resume, device switch) update the mutable fields only,
    // preserving the original createdAt as an immutable first-open timestamp.
    const isNewSession = !sessionSnap.exists;

    const sessionPayload: Record<string, unknown> = {
      userId: uid,
      bookId,
      status: "reading",
      resumePage,
      format: manifest.format,
      manifestVersion: manifest.version,
      sourceSignatureHash: sourceProvenance.sourceSignatureHash,
      attachmentId: sourceProvenance.attachmentId,
      sourceType: sourceProvenance.sourceType,
      continuityMode,
      continuityIsApproximate: continuityMode === "approximate_position",
      continuitySource: resumeAnchorSource || "reading_progress",
      continuityCompatibilityStatus: compatibilityStatus,
      continuityMigrationSuccess,
      continuityMigrationFailure,
      approximateResumeCount: continuityMode === "approximate_position" ? 1 : 0,
      staleAnchorRejectedCount:
        (progressResumeAnchor && !progressCompatibility.compatible ? 1 : 0) +
        (storedResumeAnchor && !storedCompatibility.compatible ? 1 : 0),
      updatedAt: now,
      ...(isNewSession ? { createdAt: now } : {}),
    };

    if (resumeAnchor) {
      sessionPayload.resumeAnchor = resumeAnchor;
      writeSourceProvenance(sessionPayload, sourceProvenance);
    } else {
      sessionPayload.resumeAnchor = FieldValue.delete();
    }

    if (
      (progressResumeAnchor && !progressCompatibility.compatible) ||
      (storedResumeAnchor && !storedCompatibility.compatible)
    ) {
      logger.warn("[READER][STALE_RESUME_ANCHOR_IGNORED]", {
        uid,
        bookId,
        manifestVersion: manifest.version,
        progressAnchorVersion: progressResumeAnchor?.manifestVersion ?? null,
        sessionAnchorVersion: storedResumeAnchor?.manifestVersion ?? null,
        progressReasons: progressCompatibility.reasons,
        sessionReasons: storedCompatibility.reasons,
        fallbackResumePage: resumePage,
        continuityMode,
      });
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
      continuityMode,
      resumeAnchorSource,
      compatibilityStatus,
      continuityMigrationSuccess,
      continuityMigrationFailure,
    });

    return {
      signedUrl,
      resumePage,
      format: manifest.format,
      lastPosition,
      resumeAnchor,
      continuity: {
        mode: continuityMode,
        approximate: continuityMode === "approximate_position",
        manifestVersion: manifest.version,
        anchorSource: resumeAnchorSource,
        compatibilityStatus,
        sourceSignatureHash: sourceProvenance.sourceSignatureHash,
        attachmentId: sourceProvenance.attachmentId,
        sourceType: sourceProvenance.sourceType,
        continuityMigrationSuccess,
        continuityMigrationFailure,
        approximateResumeCount: continuityMode === "approximate_position" ? 1 : 0,
        staleAnchorRejectedCount:
          (progressResumeAnchor && !progressCompatibility.compatible ? 1 : 0) +
          (storedResumeAnchor && !storedCompatibility.compatible ? 1 : 0),
      },
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
