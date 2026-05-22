import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  assertValidTransition,
  computeReadingProgressMutation,
  isPersistedReadingState,
  ReadingState,
  resolveReaderEvent,
} from "../readingProgressStateMachine";

describe("readingProgressStateMachine", () => {
  it("enforces canonical lifecycle transitions with deterministic aggregates", () => {
    const uid = "user_1";
    const bookId = "book_1";
    const t0 = Timestamp.fromMillis(1_000_000);
    const t1 = Timestamp.fromMillis(1_012_000);
    const t2 = Timestamp.fromMillis(1_020_000);
    const t3 = Timestamp.fromMillis(1_028_000);

    const start = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.1,
      normalizedLastPosition: { page: 10, totalPages: 100 },
      requestedStateRaw: undefined,
      now: t0,
      previousData: {},
    });

    expect(start.previousState).toBe("not_started");
    expect(start.nextState).toBe("reading");
    expect(start.event).toBe("read_start");
    expect(start.payload.status_state).toBe("reading");
    expect(start.payload.sessionCount).toBe(1);
    expect(start.payload.totalActiveSeconds).toBe(0);
    expect(start.payload.startedAt).toBe(t0);
    expect(start.payload.sessionStartedAt).toBe(t0);

    const pause = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.3,
      normalizedLastPosition: { page: 30, totalPages: 100 },
      requestedStateRaw: "paused",
      now: t1,
      previousData: start.payload,
    });

    expect(pause.previousState).toBe("reading");
    expect(pause.nextState).toBe("paused");
    expect(pause.event).toBe("read_pause");
    expect(pause.payload.status_state).toBe("paused");
    expect(pause.payload.sessionCount).toBe(1);
    expect(pause.payload.totalActiveSeconds).toBe(12);
    expect(pause.payload.startedAt).toBe(t0);
    expect(pause.payload.sessionStartedAt).toBeNull();

    const resume = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.35,
      normalizedLastPosition: { page: 35, totalPages: 100 },
      requestedStateRaw: "reading",
      now: t2,
      previousData: pause.payload,
    });

    expect(resume.previousState).toBe("paused");
    expect(resume.nextState).toBe("reading");
    expect(resume.event).toBe("read_resume");
    expect(resume.payload.status_state).toBe("reading");
    expect(resume.payload.sessionCount).toBe(2);
    expect(resume.payload.totalActiveSeconds).toBe(12);
    expect(resume.payload.startedAt).toBe(t0);
    expect(resume.payload.sessionStartedAt).toBe(t2);

    const complete = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 1,
      normalizedLastPosition: { page: 100, totalPages: 100 },
      requestedStateRaw: "completed",
      now: t3,
      previousData: resume.payload,
    });

    expect(complete.previousState).toBe("reading");
    expect(complete.nextState).toBe("completed");
    expect(complete.event).toBe("read_complete");
    expect(complete.payload.status_state).toBe("completed");
    expect(complete.payload.sessionCount).toBe(2);
    expect(complete.payload.totalActiveSeconds).toBe(20);
    expect(complete.payload.startedAt).toBe(t0);
    expect(complete.payload.completedAt).toBe(t3);
    expect(complete.payload.sessionStartedAt).toBeNull();
    expect(complete.payload.schemaVersion).toBe(2);
  });

  it("allows the canonical abandoned and reread transitions", () => {
    const uid = "user_1";
    const bookId = "book_1";
    const t0 = Timestamp.fromMillis(2_000_000);
    const t1 = Timestamp.fromMillis(2_010_000);
    const t2 = Timestamp.fromMillis(2_020_000);
    const t3 = Timestamp.fromMillis(2_030_000);
    const t4 = Timestamp.fromMillis(2_040_000);

    const start = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.1,
      normalizedLastPosition: { page: 10, totalPages: 100 },
      requestedStateRaw: undefined,
      now: t0,
      previousData: {},
    });

    const abandonFromReading = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.25,
      normalizedLastPosition: { page: 25, totalPages: 100 },
      requestedStateRaw: "abandoned",
      now: t1,
      previousData: start.payload,
    });

    expect(abandonFromReading.previousState).toBe("reading");
    expect(abandonFromReading.nextState).toBe("abandoned");
    expect(abandonFromReading.event).toBe("read_abandon");
    expect(abandonFromReading.payload.status_state).toBe("abandoned");
    expect(abandonFromReading.payload.abandonedAt).toBe(t1);
    expect(abandonFromReading.payload.totalActiveSeconds).toBe(10);
    expect(abandonFromReading.payload.sessionStartedAt).toBeNull();

    const resumeFromAbandoned = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.3,
      normalizedLastPosition: { page: 30, totalPages: 100 },
      requestedStateRaw: "reading",
      now: t2,
      previousData: abandonFromReading.payload,
    });

    expect(resumeFromAbandoned.previousState).toBe("abandoned");
    expect(resumeFromAbandoned.nextState).toBe("reading");
    expect(resumeFromAbandoned.event).toBe("read_resume");
    expect(resumeFromAbandoned.payload.sessionCount).toBe(2);
    expect(resumeFromAbandoned.payload.sessionStartedAt).toBe(t2);

    const completed = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 1,
      normalizedLastPosition: { page: 100, totalPages: 100 },
      requestedStateRaw: "completed",
      now: t3,
      previousData: resumeFromAbandoned.payload,
    });

    const reread = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.02,
      normalizedLastPosition: { page: 2, totalPages: 100 },
      requestedStateRaw: "rereading",
      now: t4,
      previousData: completed.payload,
    });

    expect(reread.previousState).toBe("completed");
    expect(reread.nextState).toBe("rereading");
    expect(reread.event).toBe("reread_start");
    expect(reread.payload.status_state).toBe("rereading");
    expect(reread.payload.sessionStartedAt).toBe(t4);
  });

  it("allows paused abandonment and completion", () => {
    const uid = "user_1";
    const bookId = "book_1";
    const t0 = Timestamp.fromMillis(3_000_000);
    const pausedData = {
      uid,
      userId: uid,
      bookId,
      status_state: "paused",
      progress: 0.5,
      totalActiveSeconds: 90,
      sessionCount: 1,
      startedAt: t0,
      sessionStartedAt: null,
    };

    const abandoned = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 0.5,
      normalizedLastPosition: { page: 50, totalPages: 100 },
      requestedStateRaw: "abandoned",
      now: Timestamp.fromMillis(3_010_000),
      previousData: pausedData,
    });

    expect(abandoned.previousState).toBe("paused");
    expect(abandoned.nextState).toBe("abandoned");
    expect(abandoned.event).toBe("read_abandon");

    const completed = computeReadingProgressMutation({
      uid,
      bookId,
      normalizedProgress: 1,
      normalizedLastPosition: { page: 100, totalPages: 100 },
      requestedStateRaw: "completed",
      now: Timestamp.fromMillis(3_020_000),
      previousData: pausedData,
    });

    expect(completed.previousState).toBe("paused");
    expect(completed.nextState).toBe("completed");
    expect(completed.event).toBe("read_complete");
  });

  it.each([
    ["not_started", "paused"],
    ["not_started", "abandoned"],
    ["not_started", "completed"],
    ["not_started", "rereading"],
    ["completed", "reading"],
    ["completed", "paused"],
    ["completed", "abandoned"],
  ] as Array<[ReadingState, ReadingState]>)("rejects %s -> %s", (from, to) => {
    expect(() => assertValidTransition(from, to)).toThrow(
      `Illegal reading state transition: ${from} -> ${to}`
    );
  });

  it("rejects explicit transitions to not_started", () => {
    expect(() =>
      computeReadingProgressMutation({
        uid: "user_1",
        bookId: "book_1",
        normalizedProgress: 0.1,
        normalizedLastPosition: { page: 1, totalPages: 10 },
        requestedStateRaw: "not_started",
        now: Timestamp.fromMillis(4_000_000),
        previousData: {},
      })
    ).toThrow("Illegal reading state transition: any -> not_started");
  });

  it("defines deterministic transition event semantics", () => {
    expect(resolveReaderEvent("not_started", "reading")).toBe("read_start");
    expect(resolveReaderEvent("reading", "paused")).toBe("read_pause");
    expect(resolveReaderEvent("paused", "reading")).toBe("read_resume");
    expect(resolveReaderEvent("reading", "abandoned")).toBe("read_abandon");
    expect(resolveReaderEvent("paused", "abandoned")).toBe("read_abandon");
    expect(resolveReaderEvent("reading", "completed")).toBe("read_complete");
    expect(resolveReaderEvent("paused", "completed")).toBe("read_complete");
    expect(resolveReaderEvent("completed", "rereading")).toBe("reread_start");
    expect(resolveReaderEvent("rereading", "paused")).toBe("read_pause");
    expect(resolveReaderEvent("rereading", "completed")).toBe("read_complete");
  });

  it("recognizes only persisted reading states as client intents", () => {
    expect(isPersistedReadingState("reading")).toBe(true);
    expect(isPersistedReadingState("paused")).toBe(true);
    expect(isPersistedReadingState("abandoned")).toBe(true);
    expect(isPersistedReadingState("completed")).toBe(true);
    expect(isPersistedReadingState("rereading")).toBe(true);
    expect(isPersistedReadingState("not_started")).toBe(false);
    expect(isPersistedReadingState("currently_reading")).toBe(false);
  });
});
