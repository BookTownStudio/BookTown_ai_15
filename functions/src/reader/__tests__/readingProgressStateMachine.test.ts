import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { computeReadingProgressMutation } from "../readingProgressStateMachine";

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
    expect(resume.event).toBeNull();
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
  });
});
