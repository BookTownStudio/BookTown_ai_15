// functions/src/reader/recordReadingProgress.ts

import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  computeReadingProgressMutation,
  ReadingState,
} from "./readingProgressStateMachine";

const db = admin.firestore();

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
    status_state: requestedStateRaw,
  } = request.data || {};

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
    !["reading", "paused", "completed"].includes(requestedStateRaw)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid status_state intent."
    );
  }

  const normalizedLastPosition =
    lastPosition ??
    (typeof currentPage === "number" && Number.isFinite(currentPage)
      ? {
        page: Math.max(1, Math.trunc(currentPage)),
        totalPages:
          typeof totalPages === "number" && Number.isFinite(totalPages)
            ? Math.max(1, Math.trunc(totalPages))
            : null,
      }
      : null);

  const progressId = `${uid}_${bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);
  const eventsRef = db.collection("reader_events");

  logger.info("[READER][PROGRESS_WRITE_REQUEST]", {
    uid,
    bookId,
    progress: normalizedProgress,
    requestedState: requestedStateRaw ?? "auto",
  });

  let observedPreviousState: ReadingState | null = null;
  let observedNextState: ReadingState | null = null;
  let observedEvent: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);
      const now = Timestamp.now();

      const data = snap.exists ? snap.data()! : {};
      const mutation = computeReadingProgressMutation({
        uid,
        bookId,
        normalizedProgress,
        normalizedLastPosition,
        requestedStateRaw: requestedStateRaw as ReadingState | undefined,
        now,
        previousData: data,
      });

      const payload: Record<string, any> = {
        ...mutation.payload,
        updatedAt: FieldValue.serverTimestamp(),
      };

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
