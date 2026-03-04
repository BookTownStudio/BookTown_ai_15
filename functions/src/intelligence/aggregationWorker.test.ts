import { describe, expect, it } from "vitest";
import {
  buildAnchorsFromWindow,
  computeAggregationDelta,
} from "./aggregationWorker";

describe("aggregationWorker", () => {
  it("derives deterministic mode and rank deltas from window events", () => {
    const suggestionSessions = [
      {
        uid: "user_1",
        suggestionSessionId: "session_1",
        books: [
          {
            bookId: "book_a",
            suggestionId: "s_1",
            rankPosition: 1,
            mode: "Reinforcement",
          },
          {
            bookId: "book_b",
            suggestionId: "s_2",
            rankPosition: 2,
            mode: "StructuredContrast",
          },
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
                suggestionId: "s_1",
                rankPosition: 1,
                mode: "Reinforcement",
              },
            },
          ],
        },
      },
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
            suggestionId: "s_1",
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
            suggestionId: "s_1",
            rankPosition: 1,
            mode: "Reinforcement",
          },
        },
      },
    ];

    const anchors = buildAnchorsFromWindow({
      suggestionSessions,
      queueEvents,
    });
    const delta = computeAggregationDelta(anchors);

    expect(anchors).toHaveLength(2);
    expect(delta.totals).toEqual({
      suggested: 2,
      accepted: 1,
      engaged: 1,
      completed: 1,
      positive: 1,
      ignored: 1,
    });
    expect(delta.modePerformance.Reinforcement).toEqual({
      suggested: 1,
      accepted: 1,
      engaged: 1,
      completed: 1,
      positive: 1,
    });
    expect(delta.modePerformance.Contrast).toEqual({
      suggested: 1,
      accepted: 0,
      engaged: 0,
      completed: 0,
      positive: 0,
    });
    expect(delta.rankPerformance["1"]).toEqual({
      suggested: 1,
      accepted: 1,
    });
    expect(delta.rankPerformance["2"]).toEqual({
      suggested: 1,
      accepted: 0,
    });
  });

  it("applies monotonic closure for event-only anchors", () => {
    const suggestionSessions: Array<{
      uid: string;
      suggestionSessionId: string;
      books: Array<{
        bookId: string;
        suggestionId: string;
        rankPosition: number;
        mode: string;
      }>;
    }> = [];

    const queueEvents = [
      {
        uid: "user_2",
        signalType: "review_created",
        payload: {
          bookId: "book_x",
          afterRating: 4,
          recommendationOrigin: {
            source: "librarian",
            suggestionSessionId: "session_x",
            suggestionId: "sx_1",
            rankPosition: 3,
            mode: "AdjacentExpansion",
          },
        },
      },
    ];

    const anchors = buildAnchorsFromWindow({
      suggestionSessions,
      queueEvents,
    });
    const delta = computeAggregationDelta(anchors);

    expect(anchors).toHaveLength(1);
    expect(delta.totals).toEqual({
      suggested: 1,
      accepted: 1,
      engaged: 1,
      completed: 0,
      positive: 1,
      ignored: 0,
    });
    expect(delta.modePerformance.AdjacentExpansion).toEqual({
      suggested: 1,
      accepted: 1,
      engaged: 1,
      completed: 0,
      positive: 1,
    });
    expect(delta.rankPerformance["3"]).toEqual({
      suggested: 1,
      accepted: 1,
    });
  });
});
