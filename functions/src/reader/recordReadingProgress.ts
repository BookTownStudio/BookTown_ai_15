// functions/src/reader/recordReadingProgress.ts

import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  computeReadingProgressMutation,
  isPersistedReadingState,
  ReadingState,
} from "./readingProgressStateMachine";
import {
  resolveAuthoritativeRecommendationOrigin,
  sanitizeRecommendationOrigin,
} from "../attribution/recommendationOrigin";
import {
  provenanceFromManifest,
  writeSourceProvenance,
} from "./readerContinuityCompatibility";

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

export const recordReadingProgressHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const {
    bookId,
    progress,
    percentage,
    currentPage,
    totalPages,
    lastPosition,
    lastAnchor,
    status_state: requestedStateRaw,
    recommendationContext,
  } = request.data || {};
  const recommendationOriginInput = sanitizeRecommendationOrigin(
    recommendationContext
  );

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "Missing or invalid bookId.");
  }

  const normalizedProgress =
    typeof progress === "number" ? progress :
      (typeof percentage === "number" ? percentage : null);

  if (
    typeof normalizedProgress !== "number" ||
    !Number.isFinite(normalizedProgress) ||
    normalizedProgress < 0 ||
    normalizedProgress > 1
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Progress must be a number between 0 and 1."
    );
  }

  if (
    requestedStateRaw !== undefined &&
    requestedStateRaw !== null &&
    !isPersistedReadingState(requestedStateRaw)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid status_state intent."
    );
  }

  const normalizedLastPosition =
    sanitizeReaderLastPosition(lastPosition) ??
    (typeof currentPage === "number" && Number.isFinite(currentPage)
      ? {
        page: Math.max(1, Math.trunc(currentPage)),
        totalPages:
          typeof totalPages === "number" && Number.isFinite(totalPages)
            ? Math.max(1, Math.trunc(totalPages))
            : null,
      }
      : null);
  const normalizedLastAnchor = sanitizeCanonicalAnchor(lastAnchor);
  const sourceProvenance = normalizedLastAnchor
    ? provenanceFromManifest(
      await (await import("./readerManifestService")).getOrBuildReaderManifest({ uid, bookId })
    )
    : null;

  const progressId = `${uid}_${bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);
  const eventsRef = db.collection("reader_events");

  logger.info("[READER][PROGRESS_WRITE_REQUEST]", {
    uid,
    bookId,
    progress: normalizedProgress,
    requestedState: requestedStateRaw ?? "auto",
    hasRecommendationOrigin: Boolean(recommendationOriginInput),
  });

  let observedPreviousState: ReadingState | null = null;
  let observedNextState: ReadingState | null = null;
  let observedEvent: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);
      const now = Timestamp.now();

      const data = snap.exists ? snap.data()! : {};
      const existingRecommendationOrigin = sanitizeRecommendationOrigin(
        data.recommendationOrigin
      );
      const mutation = computeReadingProgressMutation({
        uid,
        bookId,
        normalizedProgress,
        normalizedLastPosition,
        requestedStateRaw: requestedStateRaw as ReadingState | undefined,
        now,
        previousData: data,
      });
      const recommendationOrigin =
        existingRecommendationOrigin ||
        (recommendationOriginInput
          ? await resolveAuthoritativeRecommendationOrigin({
            uid,
            bookId,
            input: recommendationOriginInput,
            tx,
          })
          : null);

      const payload: Record<string, any> = {
        ...mutation.payload,
        updatedAt: FieldValue.serverTimestamp(),
        ...(recommendationOrigin ? { recommendationOrigin } : {}),
      };

      if (normalizedLastAnchor) {
        payload.lastAnchor = normalizedLastAnchor;
        payload.anchorManifestVersion = normalizedLastAnchor.manifestVersion;
        if (sourceProvenance) {
          writeSourceProvenance(payload, sourceProvenance);
        }
      }

      tx.set(progressRef, payload, { merge: true });
      observedPreviousState = mutation.previousState;
      observedNextState = mutation.nextState;

      /* --------------------------------------------
       * Analytics-safe event emission
       * -------------------------------------------- */
      const event = mutation.event;

      if (event) {
        tx.set(eventsRef.doc(), {
          uid,
          bookId,
          event,
          fromState: mutation.previousState,
          toState: mutation.nextState,
          progress: normalizedProgress,
          occurredAt: now,
          ...(recommendationOrigin ? { recommendationOrigin } : {}),
        });

        observedEvent = event;
      }
    });

    logger.info("[READER][PROGRESS_WRITE_OK]", {
      uid,
      bookId,
      progress: normalizedProgress,
      fromState: observedPreviousState,
      toState: observedNextState,
      emittedEvent: observedEvent,
    });

    return { ok: true };
  } catch (err: any) {
    logger.error("[READER][PROGRESS_WRITE_FAILED]", {
      uid,
      bookId,
      error: err?.message || err,
    });

    if (err instanceof HttpsError) {
      throw err;
    }

    if (typeof err?.message === "string" && err.message.includes("Illegal reading state transition")) {
      throw new HttpsError("failed-precondition", err.message);
    }

    throw new HttpsError(
      "internal",
      "Failed to record reading progress."
    );
  }
};

export const recordReadingProgress = onCall(
  { cors: true },
  recordReadingProgressHandler
);
