import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { buildAnchorsFromWindow, computeAggregationDelta } from "./aggregationWorker";
import {
  buildAnchorCatalogFromSessions,
  buildAuditAnomalyDocId,
  detectAuditAnomalies,
  deterministicSampleAnchors,
  deriveAuditRunId,
  type AggregateSnapshot,
  type AuditAnchor,
} from "./auditWorker";

function makeAggregateFixture(): AggregateSnapshot {
  return {
    modePerformance: {
      Reinforcement: { suggested: 10, accepted: 8, engaged: 6, completed: 4, positive: 3 },
      AdjacentExpansion: { suggested: 4, accepted: 2, engaged: 1, completed: 1, positive: 0 },
      Contrast: { suggested: 3, accepted: 1, engaged: 1, completed: 0, positive: 0 },
      HighConfidencePrecision: { suggested: 7, accepted: 5, engaged: 4, completed: 3, positive: 2 },
      ReReadingReflection: { suggested: 1, accepted: 1, engaged: 1, completed: 1, positive: 1 },
    },
    rankPerformance: {
      "1": { suggested: 8, accepted: 6 },
      "2": { suggested: 8, accepted: 4 },
      "3": { suggested: 9, accepted: 3 },
    },
    rawModes: {},
    rawRanks: {},
  };
}

describe("auditWorker", () => {
  it("anchor_replay_correctness", () => {
    const suggestionSessions = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        books: [
          { bookId: "book_a", suggestionId: "sg_1", rankPosition: 1, mode: "Reinforcement" },
        ],
      },
    ];
    const queueEvents = [
      {
        uid: "user_1",
        signalType: "reading_progress_written",
        payload: {
          bookId: "book_a",
          progress: 1,
          statusState: "completed",
          recommendationOrigin: {
            source: "librarian",
            suggestionSessionId: "session_1",
            suggestionId: "sg_1",
            rankPosition: 1,
            mode: "Reinforcement",
          },
        },
      },
      {
        uid: "user_1",
        signalType: "review_created",
        payload: {
          bookId: "book_a",
          afterRating: 5,
          recommendationOrigin: {
            source: "librarian",
            suggestionSessionId: "session_1",
            suggestionId: "sg_1",
            rankPosition: 1,
            mode: "Reinforcement",
          },
        },
      },
    ];

    const recomputed = buildAnchorsFromWindow({
      suggestionSessions,
      queueEvents,
    });
    expect(recomputed).toHaveLength(1);
    expect(recomputed[0]).toMatchObject({
      uid: "user_1",
      suggestionSessionId: "session_1",
      bookId: "book_a",
      suggested: true,
      accepted: true,
      engaged: true,
      completed: true,
      positive: true,
    });
  });

  it("signal_derivation_match", () => {
    const suggestionSessions = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        books: [
          { bookId: "book_a", suggestionId: "sg_1", rankPosition: 1, mode: "Reinforcement" },
          { bookId: "book_b", suggestionId: "sg_2", rankPosition: 2, mode: "StructuredContrast" },
        ],
      },
    ];
    const queueEvents = [
      {
        uid: "user_1",
        signalType: "shelf_entries_changed",
        payload: {
          addedRecommendationOrigins: [
            {
              bookId: "book_a",
              recommendationOrigin: {
                source: "librarian",
                suggestionSessionId: "session_1",
                suggestionId: "sg_1",
                rankPosition: 1,
                mode: "Reinforcement",
              },
            },
          ],
        },
      },
    ];

    const recomputed = buildAnchorsFromWindow({
      suggestionSessions,
      queueEvents,
    });
    const delta = computeAggregationDelta(recomputed);
    expect(delta.totals).toEqual({
      suggested: 2,
      accepted: 1,
      engaged: 0,
      completed: 0,
      positive: 0,
      ignored: 1,
    });
    expect(delta.rankPerformance["1"]).toEqual({ suggested: 1, accepted: 1 });
  });

  it("anomaly_detection", () => {
    const sampledAnchors: AuditAnchor[] = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        bookId: "book_a",
        suggestionId: "sg_1",
        rankPosition: 1,
        mode: "Reinforcement",
      },
    ];

    const recomputedAnchors = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        bookId: "book_a",
        mode: "Reinforcement",
        rankPosition: 1,
        suggested: true,
        accepted: true,
        engaged: true,
        completed: true,
        positive: true,
      },
    ];

    const aggregate: AggregateSnapshot = {
      ...makeAggregateFixture(),
      modePerformance: {
        Reinforcement: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
        AdjacentExpansion: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
        Contrast: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
        HighConfidencePrecision: { suggested: 0, accepted: 1, engaged: 0, completed: 0, positive: 0 },
        ReReadingReflection: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
      },
      rankPerformance: {
        "1": { suggested: 0, accepted: 3 },
        "2": { suggested: 0, accepted: 0 },
        "3": { suggested: 0, accepted: 0 },
      },
    };

    const anomalies = detectAuditAnomalies({
      sampledAnchors,
      recomputedAnchors,
      aggregate,
    });

    expect(anomalies.some((row) => row.type === "missing_signal")).toBe(true);
    expect(anomalies.some((row) => row.type === "ordering_violation")).toBe(true);
    expect(anomalies.some((row) => row.type === "extra_signal")).toBe(true);
  });

  it("idempotent_runs", () => {
    const sessions = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        books: [
          { bookId: "book_a", suggestionId: "sg_1", rankPosition: 1, mode: "Reinforcement" },
          { bookId: "book_b", suggestionId: "sg_2", rankPosition: 2, mode: "StructuredContrast" },
        ],
      },
      {
        uid: "user_2",
        suggestionSessionId: "session_2",
        books: [{ bookId: "book_c", suggestionId: "sg_3", rankPosition: 1, mode: "AdjacentExpansion" }],
      },
    ];

    const anchors = buildAnchorCatalogFromSessions(sessions);
    const sampleA = deterministicSampleAnchors({
      anchors,
      runSeed: "run_seed_1",
      maxAnchors: 2,
    });
    const sampleB = deterministicSampleAnchors({
      anchors,
      runSeed: "run_seed_1",
      maxAnchors: 2,
    });
    expect(sampleA).toEqual(sampleB);

    const runIdA = deriveAuditRunId(Timestamp.fromMillis(1_710_000_000_000));
    const runIdB = deriveAuditRunId(Timestamp.fromMillis(1_710_000_000_000 + 30 * 60 * 1000));
    const runIdC = deriveAuditRunId(Timestamp.fromMillis(1_710_000_000_000 + 7 * 60 * 60 * 1000));
    expect(runIdA).toBe(runIdB);
    expect(runIdA).not.toBe(runIdC);

    const anomalyIdA = buildAuditAnomalyDocId(runIdA, "missing_signal", "anchor_1");
    const anomalyIdB = buildAuditAnomalyDocId(runIdA, "missing_signal", "anchor_1");
    expect(anomalyIdA).toBe(anomalyIdB);
  });
});
