# Legacy User Reviews Projection Deprecation Runbook

Status: Phase 8A.21 deprecated compatibility runbook
Projection: `legacy_user_reviews_projection`

## Authority

Canonical review authority is `reviews/{reviewId}`. Legacy `books/{bookId}/reviews/{reviewId}` is compatibility-only and must not be used for certification authority.

## Projection

- legacy writes to `user_reviews`

## Dry Run Command

```json
{ "projectionName": "user_reviews", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Verify canonical review projection before legacy sunset" }
```

## Write Command

```json
{ "projectionName": "user_reviews", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair canonical review projection before legacy sunset" }
```

## Verification Query

Use certified review fanout verification from `reviews/{reviewId}` to `user_reviews`.

## Failure Modes

- legacy import path still writes only book-scoped reviews
- canonical review missing
- profile read unexpectedly depends on legacy projection

## Operator Steps

Keep legacy collection readable where required, but run certification and repair only through canonical review recovery.

## Escalation Criteria

Escalate if runtime profile reads cannot be satisfied from canonical `user_reviews`.
