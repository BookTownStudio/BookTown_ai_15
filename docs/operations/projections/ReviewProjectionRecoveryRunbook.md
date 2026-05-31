# Projection Recovery Runbook: Review Projections

## Projection Name

`user_reviews`, `book_review_projection`, `social_review_projection`

## Classification

`fanout_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
reviews/{reviewId}
```

No review projection rebuild may use existing review projection documents as authority.

## Projection Collections

```text
user_reviews
book_review_projection
social_review_projection
```

## Maintainer

```text
Normal path: onBookReviewWritten
Recovery path: recoverReviewProjections
```

## Current Consumers

```text
listBookReviews
profile review hydration
social review surfaces
```

## Expected Indexes

```text
reviews ordered by __name__
reviews where uid == ownerId ordered by __name__
reviews where userId == ownerId ordered by __name__
reviews where bookId == bookId ordered by __name__
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each source review can write or delete up to three projection documents, keeping one batch below Firestore write limits.

## Rebuild Commands

Dry run is the default and must be run first.

```json
{
  "scope": "single_review",
  "reviewId": "<reviewId>",
  "mode": "dry_run",
  "reason": "Inspect review projection drift"
}
```

```json
{
  "scope": "single_review",
  "reviewId": "<reviewId>",
  "mode": "write",
  "reason": "Repair review projection drift"
}
```

Owner-scoped recovery:

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect owner review projection drift"
}
```

Book-scoped recovery:

```json
{
  "scope": "book",
  "bookId": "<bookId>",
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect book review projection drift"
}
```

Checkpointed full recovery:

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed review projection audit"
}
```

## Verification Query

```text
Authority: reviews/{reviewId}
Projection: user_reviews/{uid_bookId}
Projection: book_review_projection/{uid_bookId}
Projection: social_review_projection/{uid_bookId}
Expected: projection payload equals buildReviewProjectionPayload(source review) plus projectionSurface
```

Deleted or invalid review authority records must not have user, book, or social review projections.

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed`.
- `missingProjectionCount` is `0`.
- `staleProjectionCount` is `0`.
- `mismatchCount` is `0`.
- `extraProjectionCount` is `0`.
- Projection health is `healthy`.

## Rollback Strategy

Review projection recovery is idempotent and derived only from `reviews/{reviewId}`. Rollback is a re-run after correcting the source review or projection builder. Do not restore projection documents from backups unless the canonical review source is also restored.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| invalid source review | projection omitted from expected surfaces | inspect `reviews/{reviewId}` |
| missing projection | verification `missingProjectionCount > 0` | run write recovery for the review/scope |
| stale projection | verification `staleProjectionCount > 0` | run write recovery |
| extra projection | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable failure from Firestore query | deploy required index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run targeted recovery for known `reviewId`, `ownerId`, or `bookId`.
2. Review `wouldWrite`, `failed`, and verification counts.
3. Run the same request with `mode: "write"`.
4. Confirm the verification report passes.
5. Check `projection_health/user_reviews`.
6. If checkpointed full recovery returns `nextCursor`, repeat with the same checkpoint or cursor.
7. Resolve or dead-letter any failure ledger entries.

## Escalation Criteria

Escalate before write mode if dry run reports unexpected high `extraProjectionCount`, repeated write failures, or missing indexes. Do not bypass canonical `reviews/{reviewId}` as the authority source.
