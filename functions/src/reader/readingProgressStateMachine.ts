import { Timestamp } from "firebase-admin/firestore";

export type ReadingState =
  | "not_started"
  | "reading"
  | "paused"
  | "abandoned"
  | "completed"
  | "rereading";
export type PersistedReadingState = Exclude<ReadingState, "not_started">;
export type ReaderEvent =
  | "read_start"
  | "read_pause"
  | "read_resume"
  | "read_abandon"
  | "read_complete"
  | "reread_start";

const VALID_TRANSITIONS: Record<ReadingState, ReadingState[]> = {
  not_started: ["reading"],
  reading: ["paused", "abandoned", "completed"],
  paused: ["reading", "rereading", "abandoned", "completed"],
  abandoned: ["reading"],
  completed: ["rereading"],
  rereading: ["paused", "abandoned", "completed"],
};

const PERSISTED_READING_STATES = new Set<PersistedReadingState>([
  "reading",
  "paused",
  "abandoned",
  "completed",
  "rereading",
]);

export function assertValidTransition(from: ReadingState, to: ReadingState): void {
  if (from === to) return;

  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal reading state transition: ${from} -> ${to}`);
  }
}

export function resolveReaderEvent(from: ReadingState, to: ReadingState): ReaderEvent | null {
  if (from === "not_started" && to === "reading") return "read_start";
  if (from === "reading" && to === "paused") return "read_pause";
  if (from === "paused" && to === "reading") return "read_resume";
  if ((from === "reading" || from === "paused") && to === "abandoned") return "read_abandon";
  if ((from === "reading" || from === "paused") && to === "completed") return "read_complete";
  if (from === "abandoned" && to === "reading") return "read_resume";
  if (from === "completed" && to === "rereading") return "reread_start";
  if (from === "paused" && to === "rereading") return "read_resume";
  if (from === "rereading" && to === "paused") return "read_pause";
  if (from === "rereading" && to === "abandoned") return "read_abandon";
  if (from === "rereading" && to === "completed") return "read_complete";
  return null;
}

export function isPersistedReadingState(value: unknown): value is PersistedReadingState {
  return typeof value === "string" && PERSISTED_READING_STATES.has(value as PersistedReadingState);
}

function resolvePreviousState(previousData: Record<string, unknown>): ReadingState {
  const raw = previousData.status_state;
  if (isPersistedReadingState(raw)) {
    return raw;
  }
  return "not_started";
}

function isTimestampLike(value: unknown): value is Timestamp {
  return (
    value instanceof Timestamp ||
    (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { toMillis?: unknown }).toMillis === "function"
    )
  );
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

  const previousState = resolvePreviousState(previousData);
  if (requestedStateRaw === "not_started") {
    throw new Error("Illegal reading state transition: any -> not_started");
  }
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
  let sessionStartedAt = isTimestampLike(previousData.sessionStartedAt)
    ? previousData.sessionStartedAt
    : null;
  let sessionCount =
    typeof previousData.sessionCount === "number" ? previousData.sessionCount : 0;

  if (
    (
      previousState === "not_started" ||
      previousState === "paused" ||
      previousState === "abandoned" ||
      previousState === "completed"
    ) &&
    (nextState === "reading" || nextState === "rereading")
  ) {
    sessionStartedAt = now;
    sessionCount += 1;
  }

  if ((previousState === "reading" || previousState === "rereading") && sessionStartedAt) {
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
    schemaVersion: 2,
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

  if (nextState === "paused") {
    payload.pausedAt = now;
  } else if (previousData.pausedAt) {
    payload.pausedAt = previousData.pausedAt;
  }

  if (nextState === "abandoned") {
    payload.abandonedAt = now;
  } else if (previousData.abandonedAt) {
    payload.abandonedAt = previousData.abandonedAt;
  }

  return {
    previousState,
    nextState,
    event: resolveReaderEvent(previousState, nextState),
    payload,
  };
}
