import { Timestamp } from "firebase-admin/firestore";

export type ReadingState = "not_started" | "reading" | "paused" | "completed";
export type ReaderEvent = "read_start" | "read_pause" | "read_complete";

const VALID_TRANSITIONS: Record<ReadingState, ReadingState[]> = {
  not_started: ["reading"],
  reading: ["paused", "completed"],
  paused: ["reading", "completed"],
  completed: [],
};

export function assertValidTransition(from: ReadingState, to: ReadingState): void {
  if (from === to) return;

  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal reading state transition: ${from} -> ${to}`);
  }
}

export function resolveReaderEvent(from: ReadingState, to: ReadingState): ReaderEvent | null {
  if (from === "not_started" && to === "reading") return "read_start";
  if (from === "reading" && to === "paused") return "read_pause";
  if ((from === "reading" || from === "paused") && to === "completed") return "read_complete";
  return null;
}

export interface ReadingProgressComputationInput {
  uid: string;
  bookId: string;
  normalizedProgress: number;
  normalizedLastPosition: unknown;
  requestedStateRaw?: ReadingState | null;
  now: Timestamp;
  previousData: Record<string, unknown>;
}

export interface ReadingProgressComputationResult {
  previousState: ReadingState;
  nextState: ReadingState;
  event: ReaderEvent | null;
  payload: Record<string, unknown>;
}

export function computeReadingProgressMutation(
  input: ReadingProgressComputationInput
): ReadingProgressComputationResult {
  const {
    uid,
    bookId,
    normalizedProgress,
    normalizedLastPosition,
    requestedStateRaw,
    now,
    previousData,
  } = input;

  const previousState = (previousData.status_state as ReadingState | undefined) ?? "not_started";
  const nextState = requestedStateRaw
    ? requestedStateRaw
    : previousState === "completed"
      ? "completed"
      : "reading";

  assertValidTransition(previousState, nextState);

  let totalActiveSeconds =
    typeof previousData.totalActiveSeconds === "number"
      ? previousData.totalActiveSeconds
      : 0;
  let sessionStartedAt = (previousData.sessionStartedAt as Timestamp | null | undefined) ?? null;
  let sessionCount =
    typeof previousData.sessionCount === "number" ? previousData.sessionCount : 0;

  if (
    (previousState === "not_started" || previousState === "paused") &&
    nextState === "reading"
  ) {
    sessionStartedAt = now;
    sessionCount += 1;
  }

  if (previousState === "reading" && sessionStartedAt) {
    const deltaSeconds = Math.max(
      0,
      Math.floor((now.toMillis() - sessionStartedAt.toMillis()) / 1000)
    );
    totalActiveSeconds += deltaSeconds;
    sessionStartedAt = null;
  }

  const payload: Record<string, unknown> = {
    uid,
    userId: uid,
    bookId,
    progress: normalizedProgress,
    lastPosition: normalizedLastPosition ?? null,
    status_state: nextState,
    lastActiveAt: now,
    totalActiveSeconds,
    sessionCount,
  };

  if (sessionStartedAt) {
    payload.sessionStartedAt = sessionStartedAt;
  } else {
    payload.sessionStartedAt = null;
  }

  if (previousState === "not_started" && nextState === "reading") {
    payload.startedAt = now;
  } else if (previousData.startedAt) {
    payload.startedAt = previousData.startedAt;
  }

  if (nextState === "completed") {
    payload.completedAt = now;
  } else if (previousData.completedAt) {
    payload.completedAt = previousData.completedAt;
  }

  return {
    previousState,
    nextState,
    event: resolveReaderEvent(previousState, nextState),
    payload,
  };
}
