import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  computeReadingProgressMutation,
  isPersistedReadingState,
  ReadingState,
} from "./readingProgressStateMachine";
import {
  toReadingInteraction,
  writeUserEntityInteraction,
} from "../identityGraph/userEntityInteractionRuntime";

const db = admin.firestore();

type ManualSourceType =
  | "physical"
  | "external_ebook"
  | "kindle"
  | "apple_books"
  | "pdf_external"
  | "unknown";

const MANUAL_SOURCE_TYPES = new Set<ManualSourceType>([
  "physical",
  "external_ebook",
  "kindle",
  "apple_books",
  "pdf_external",
  "unknown",
]);

const FORBIDDEN_RUNTIME_FIELDS = [
  "lastAnchor",
  "anchor",
  "cfi",
  "epubCfi",
  "manifestVersion",
  "anchorManifestVersion",
  "readerSessionId",
  "sessionId",
  "resumeAnchor",
  "runtimeAnchor",
  "clientTimestamp",
  "clientTimestampMs",
  "lastActiveAt",
  "updatedAt",
  "createdAt",
];

function asNonEmptyString(value: unknown, maxLen = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function asProgress(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", "progress must be a number between 0 and 1.");
  }
  if (value < 0 || value > 1) {
    throw new HttpsError("invalid-argument", "progress must be between 0 and 1.");
  }
  return value;
}

function readSourceType(value: unknown): ManualSourceType {
  if (typeof value === "string" && MANUAL_SOURCE_TYPES.has(value as ManualSourceType)) {
    return value as ManualSourceType;
  }
  throw new HttpsError(
    "invalid-argument",
    "sourceType must be physical, external_ebook, kindle, apple_books, pdf_external, or unknown."
  );
}

function rejectRuntimeFields(data: Record<string, unknown>): void {
  const forbidden = FORBIDDEN_RUNTIME_FIELDS.find((field) => field in data);
  if (forbidden) {
    throw new HttpsError(
      "invalid-argument",
      `${forbidden} is runtime-owned and cannot be submitted for manual continuity.`
    );
  }
}

function resolveManualProgress(params: {
  progress: number | null;
  currentPage: number | null;
  totalPages: number | null;
  requestedState: ReadingState | undefined;
}): number {
  const { progress, currentPage, totalPages, requestedState } = params;
  if (requestedState === "completed") return 1;
  if (progress !== null) return progress;
  if (currentPage !== null && totalPages !== null) {
    return Math.max(0, Math.min(1, currentPage / totalPages));
  }
  return 0;
}

function buildManualLastPosition(params: {
  currentPage: number | null;
  totalPages: number | null;
  chapter: string | null;
  sourceType: ManualSourceType;
}): Record<string, unknown> | null {
  const { currentPage, totalPages, chapter, sourceType } = params;
  const hasPosition = currentPage !== null || totalPages !== null || chapter !== null;
  if (!hasPosition) return null;

  return {
    ...(currentPage !== null ? { page: currentPage } : {}),
    ...(totalPages !== null ? { totalPages } : {}),
    ...(chapter !== null ? { chapter } : {}),
    format: sourceType,
    mode: "manual",
  };
}

export const recordManualReadingProgressHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const data =
    request.data && typeof request.data === "object" && !Array.isArray(request.data)
      ? (request.data as Record<string, unknown>)
      : {};
  rejectRuntimeFields(data);

  const bookId = asNonEmptyString(data.bookId, 128);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "bookId is required.");
  }

  const sourceType = readSourceType(data.sourceType);
  const requestedStateRaw = data.status_state;
  if (requestedStateRaw !== undefined && requestedStateRaw !== null && !isPersistedReadingState(requestedStateRaw)) {
    throw new HttpsError("invalid-argument", "Invalid status_state intent.");
  }
  const requestedState = requestedStateRaw as ReadingState | undefined;

  const progress = asProgress(data.progress);
  const currentPage = asPositiveInt(data.currentPage);
  const totalPages = asPositiveInt(data.totalPages);
  if (currentPage !== null && totalPages !== null && currentPage > totalPages) {
    throw new HttpsError("invalid-argument", "currentPage must not exceed totalPages.");
  }

  const chapter = asNonEmptyString(data.chapter, 160);
  const normalizedProgress = resolveManualProgress({
    progress,
    currentPage,
    totalPages,
    requestedState,
  });
  const normalizedLastPosition = buildManualLastPosition({
    currentPage,
    totalPages,
    chapter,
    sourceType,
  });

  const progressId = `${uid}_${bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);
  const bookRef = db.collection("books").doc(bookId);
  const eventsRef = db.collection("reader_events");

  logger.info("[READER][MANUAL_PROGRESS_WRITE_REQUEST]", {
    uid,
    bookId,
    sourceType,
    requestedState: requestedState ?? "auto",
  });

  let observedPreviousState: ReadingState | null = null;
  let observedNextState: ReadingState | null = null;
  let observedTransitionEvent: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const [bookSnap, progressSnap] = await Promise.all([
        tx.get(bookRef),
        tx.get(progressRef),
      ]);

      if (!bookSnap.exists) {
        throw new HttpsError("not-found", "Book not found.");
      }

      const now = Timestamp.now();
      const nowIso = now.toDate().toISOString();
      const previousData = progressSnap.exists ? progressSnap.data() || {} : {};
      const mutation = computeReadingProgressMutation({
        uid,
        bookId,
        normalizedProgress,
        normalizedLastPosition,
        requestedStateRaw: requestedState,
        now,
        previousData,
      });

      const payload: Record<string, unknown> = {
        ...mutation.payload,
        continuityLevel:
          sourceType === "external_ebook" ||
          sourceType === "kindle" ||
          sourceType === "apple_books" ||
          sourceType === "pdf_external"
            ? "partial_runtime"
            : "manual",
        continuitySource: "manual",
        sourceType,
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(progressRef, payload, { merge: true });

      const baseEvent = {
        uid,
        bookId,
        fromState: mutation.previousState,
        toState: mutation.nextState,
        progress: normalizedProgress,
        continuityLevel: payload.continuityLevel,
        continuitySource: "manual",
        sourceType,
        occurredAt: now,
      };

      if (mutation.event) {
        tx.set(eventsRef.doc(), {
          ...baseEvent,
          event: mutation.event,
        });
        observedTransitionEvent = mutation.event;
      }

      tx.set(eventsRef.doc(), {
        ...baseEvent,
        event: "manual_progress_update",
      });

      writeUserEntityInteraction(
        tx,
        db,
        toReadingInteraction({
          uid,
          bookId,
          progress: normalizedProgress,
          occurredAt: nowIso,
          sourceId: `manual:${bookId}`,
        })
      );

      observedPreviousState = mutation.previousState;
      observedNextState = mutation.nextState;
    });

    logger.info("[READER][MANUAL_PROGRESS_WRITE_OK]", {
      uid,
      bookId,
      fromState: observedPreviousState,
      toState: observedNextState,
      transitionEvent: observedTransitionEvent,
    });

    return { ok: true };
  } catch (error: any) {
    logger.error("[READER][MANUAL_PROGRESS_WRITE_FAILED]", {
      uid,
      bookId,
      error: String(error?.message || error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    if (typeof error?.message === "string" && error.message.includes("Illegal reading state transition")) {
      throw new HttpsError("failed-precondition", error.message);
    }
    throw new HttpsError("internal", "Failed to record manual reading progress.");
  }
};

export const recordManualReadingProgress = onCall(
  { cors: true },
  recordManualReadingProgressHandler
);
