// functions/src/reader/recordReadingProgress.ts

import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();

/* -------------------------------------------------
 * Canonical Reading State Machine (LOCKED)
 * ------------------------------------------------- */

type ReadingState =
  | "not_started"
  | "reading"
  | "paused"
  | "completed";

const VALID_TRANSITIONS: Record<ReadingState, ReadingState[]> = {
  not_started: ["reading"],
  reading: ["paused", "completed"],
  paused: ["reading", "completed"],
  completed: [],
};

function assertValidTransition(from: ReadingState, to: ReadingState) {
  if (from === to) {
    return;
  }
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal reading state transition: ${from} → ${to}`);
  }
}

/* -------------------------------------------------
 * Analytics Event Resolver (LOCKED)
 * ------------------------------------------------- */

type ReaderEvent = "read_start" | "read_pause" | "read_complete";

function resolveReaderEvent(
  from: ReadingState,
  to: ReadingState
): ReaderEvent | null {
  if (from === "not_started" && to === "reading") return "read_start";
  if (from === "reading" && to === "paused") return "read_pause";
  if (
    (from === "reading" || from === "paused") &&
    to === "completed"
  )
    return "read_complete";
  return null;
}

export const recordReadingProgress = onCall({ cors: true }, async (request) => {
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

  logger.info("[READER][PROGRESS_WRITE]", {
    uid,
    bookId,
    progress: normalizedProgress,
    requestedState: requestedStateRaw ?? "auto",
  });

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);
      const now = Timestamp.now();

      const data = snap.exists ? snap.data()! : {};

      const previousState: ReadingState =
        data.status_state ?? "not_started";
      const nextState: ReadingState = requestedStateRaw
        ? (requestedStateRaw as ReadingState)
        : (previousState === "completed" ? "completed" : "reading");

      // 🔒 Enforce canonical state machine
      assertValidTransition(previousState, nextState);

      /* --------------------------------------------
       * Session aggregation (LOCKED)
       * -------------------------------------------- */

      let totalActiveSeconds: number =
        data.totalActiveSeconds ?? 0;
      let sessionStartedAt: Timestamp | null =
        data.sessionStartedAt ?? null;
      let sessionCount: number = data.sessionCount ?? 0;

      // entering reading → start / resume session
      if (
        (previousState === "not_started" ||
          previousState === "paused") &&
        nextState === "reading"
      ) {
        sessionStartedAt = now;
        sessionCount += 1;
      }

      // leaving reading → accumulate time
      if (
        previousState === "reading" &&
        sessionStartedAt
      ) {
        const deltaSeconds = Math.max(
          0,
          Math.floor(
            (now.toMillis() -
              sessionStartedAt.toMillis()) /
              1000
          )
        );

        totalActiveSeconds += deltaSeconds;
        sessionStartedAt = null;
      }

      /* --------------------------------------------
       * Lifecycle timestamps
       * -------------------------------------------- */

      const payload: Record<string, any> = {
        uid,
        userId: uid,
        bookId,
        progress: normalizedProgress,
        lastPosition: normalizedLastPosition ?? null,
        status_state: nextState,
        lastActiveAt: now,
        totalActiveSeconds,
        sessionCount,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (sessionStartedAt) {
        payload.sessionStartedAt = sessionStartedAt;
      }

      if (
        previousState === "not_started" &&
        nextState === "reading"
      ) {
        payload.startedAt = now;
      } else if (data.startedAt) {
        payload.startedAt = data.startedAt;
      }

      if (nextState === "completed") {
        payload.completedAt = now;
      } else if (data.completedAt) {
        payload.completedAt = data.completedAt;
      }

      tx.set(progressRef, payload, { merge: true });

      /* --------------------------------------------
       * Analytics-safe event emission
       * -------------------------------------------- */

      const event = resolveReaderEvent(previousState, nextState);

      if (event) {
        tx.set(eventsRef.doc(), {
          uid,
          bookId,
          event,
          fromState: previousState,
          toState: nextState,
          progress: normalizedProgress,
          occurredAt: now,
        });

        logger.info("[READER][EVENT_EMITTED]", {
          uid,
          bookId,
          event,
        });
      }
    });

    return { ok: true };
  } catch (err: any) {
    logger.error("[READER][PROGRESS_WRITE_FAILED]", {
      uid,
      bookId,
      error: err?.message || err,
    });

    throw new HttpsError(
      "internal",
      "Failed to record reading progress."
    );
  }
});
