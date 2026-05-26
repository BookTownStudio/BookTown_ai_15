import { describe, expect, it } from "vitest";
import {
  applyPublicRatingCounterDelta,
  applyPublicReviewCounterDelta,
  buildReviewAggregateOperationId,
} from "./aggregationTriggers";

describe("aggregationTriggers public review counters", () => {
  it("counts only public reviews", () => {
    expect(
      applyPublicReviewCounterDelta({
        currentReviews: 3,
        beforePublic: false,
        afterPublic: true,
      })
    ).toBe(4);

    expect(
      applyPublicReviewCounterDelta({
        currentReviews: 3,
        beforePublic: true,
        afterPublic: false,
      })
    ).toBe(2);

    expect(
      applyPublicReviewCounterDelta({
        currentReviews: 3,
        beforePublic: false,
        afterPublic: false,
      })
    ).toBe(3);
  });
});

describe("aggregationTriggers public rating counters", () => {
  it("adds a newly public rating", () => {
    expect(
      applyPublicRatingCounterDelta({
        currentRatingsCount: 2,
        currentRatingSum: 7,
        beforePublic: false,
        afterPublic: true,
        beforeRating: 0,
        afterRating: 5,
      })
    ).toEqual({
      ratingsCount: 3,
      ratingSum: 12,
      averageRating: 4,
    });
  });

  it("removes a rating when visibility becomes private", () => {
    expect(
      applyPublicRatingCounterDelta({
        currentRatingsCount: 3,
        currentRatingSum: 12,
        beforePublic: true,
        afterPublic: false,
        beforeRating: 5,
        afterRating: 5,
      })
    ).toEqual({
      ratingsCount: 2,
      ratingSum: 7,
      averageRating: 3.5,
    });
  });

  it("updates the sum without changing count for public rating edits", () => {
    expect(
      applyPublicRatingCounterDelta({
        currentRatingsCount: 3,
        currentRatingSum: 9,
        beforePublic: true,
        afterPublic: true,
        beforeRating: 2,
        afterRating: 4,
      })
    ).toEqual({
      ratingsCount: 3,
      ratingSum: 11,
      averageRating: 3.6667,
    });
  });
});

describe("aggregationTriggers review aggregate operation id", () => {
  it("uses the Firestore event id as the retry-safe operation id", () => {
    expect(
      buildReviewAggregateOperationId({
        eventId: "event-123",
        reviewId: "user-1_book-1",
        bookId: "book-1",
        beforeExists: false,
        afterExists: true,
        beforeActive: false,
        afterActive: true,
        beforeRating: 0,
        afterRating: 5,
      })
    ).toBe("review_aggregate:event-123");
  });

  it("falls back to a deterministic mutation fingerprint when event id is absent", () => {
    const input = {
      reviewId: "user-1_book-1",
      bookId: "book-1",
      beforeExists: true,
      afterExists: true,
      beforeActive: true,
      afterActive: true,
      beforeRating: 3,
      afterRating: 4,
    };

    expect(buildReviewAggregateOperationId(input)).toBe(buildReviewAggregateOperationId(input));
  });
});
