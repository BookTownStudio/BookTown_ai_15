# Review Stack SLO and Load Gate (Tier-1)

## Scope
- `listProfileReviews` callable
- `listBookReviews` callable
- `upsertBookReview` callable
- `deleteBookReview` callable
- `onBookReviewWritten` trigger
- `scheduledReviewAggregateReconcile` job

## SLO Targets
- Availability: `>= 99.9%` monthly success rate for review callables.
- Latency (`listProfileReviews`): `p95 <= 450ms`, `p99 <= 900ms`.
- Latency (`listBookReviews`): `p95 <= 500ms`, `p99 <= 1000ms`.
- Write latency (`upsertBookReview`): `p95 <= 650ms`, `p99 <= 1200ms`.
- Aggregate drift: `< 0.1%` books repaired per reconcile run over trailing 7 days.
- Error budget burn alert: trigger if 4-hour burn rate exceeds `2x` monthly budget.

## Load-Test Gate (Required Before Scale Rollout)
- Dataset gate A: single book with `10,000` reviews.
- Dataset gate B: global dataset with `1,000,000` review documents.
- Concurrency gate:
  - `200` concurrent readers on `listBookReviews`.
  - `200` concurrent readers on `listProfileReviews`.
  - `50` concurrent writers on `upsertBookReview`.
- Pass criteria:
  - No `FAILED_PRECONDITION` from missing indexes.
  - No duplicate review docs per `{uid, bookId}`.
  - No aggregate drift beyond SLO threshold after 30-minute soak.
  - Error rate `< 0.5%` under sustained load.

## Release Gate Checklist
1. Deploy functions and indexes.
2. Run `npm --prefix functions run review:release-gate -- --uid=<REAL_UID> --expectedRevision=review_stack_v2`.
3. Confirm gate output includes `passed: true`.
4. Confirm smoke UID returns non-error owner/public profile review queries.
5. Confirm reconcile job reports no critical drift.
