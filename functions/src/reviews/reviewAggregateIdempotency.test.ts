import { describe, expect, it } from "vitest";
import { buildReviewAggregateOperationId } from "../triggers/aggregationTriggers";

describe("review aggregate idempotency", () => {
  it("assigns a stable operation id from the Firestore trigger event id", () => {
    const operationId = buildReviewAggregateOperationId({
      eventId: "event-review-create-1",
      reviewId: "user-1_book-1",
      bookId: "book-1",
      beforeExists: false,
      afterExists: true,
      beforeActive: false,
      afterActive: true,
      beforeRating: 0,
      afterRating: 5,
    });

    expect(operationId).toBe("review_aggregate:event-review-create-1");
  });

  it("creates the same fallback operation id for the same canonical mutation", () => {
    const mutation = {
      reviewId: "user-1_book-1",
      bookId: "book-1",
      beforeExists: true,
      afterExists: true,
      beforeActive: true,
      afterActive: true,
      beforeRating: 2,
      afterRating: 4,
    };

    expect(buildReviewAggregateOperationId(mutation)).toBe(
      buildReviewAggregateOperationId(mutation)
    );
  });
});
