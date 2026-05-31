# Projection Recovery Runbook: Search Feed

## Projection Name

`search_feed`

## Classification

`search_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
posts/{postId}
post_stats/{postId}
```

No rebuild may use `search_feed` as authority.

## Projection Collections

```text
search_feed
```

## Maintainer

```text
Normal path: syncPostToSearchIndex, initPostSearchIndex, syncPostStatsToSearchIndex
Recovery path: recoverSearchFeed
```

## Current Consumers

```text
social search
discovery feed search
```

## Expected Indexes

```text
posts ordered by __name__
posts where authorId == ownerId ordered by __name__
post_stats ordered by __name__
search_feed ordered by __name__
search_feed(status,visibility,createdAt)
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each source post writes or deletes at most one search projection document.

## Rebuild Commands

```json
{
  "scope": "single_post",
  "postId": "<postId>",
  "mode": "dry_run",
  "reason": "Inspect search feed drift"
}
```

```json
{
  "scope": "single_post",
  "postId": "<postId>",
  "mode": "write",
  "reason": "Repair search feed drift"
}
```

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect owner search feed drift"
}
```

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed search feed audit"
}
```

## Reconciliation Modes

Use `reconciliationMode: "report_only"` with `dry_run` to report drift. Use `reconciliationMode: "repair"` with `mode: "write"` to repair drift.

## Verification Query

```text
Authority: posts/{postId} plus post_stats/{postId}
Projection: search_feed/{postId}
Expected: buildSearchFeedProjectionFromAuthorities(post, post_stats)
```

Verification ignores operational timestamp fields `indexedAt` and `lastActivityAt` and detects missing, stale, and orphan projection documents.

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed`.
- `missingProjectionCount`, `staleProjectionCount`, `mismatchCount`, and `extraProjectionCount` are `0`.
- Projection health is `healthy`.

## Rollback Strategy

Search feed recovery is idempotent and derived only from `posts` and `post_stats`. Rollback is a re-run after correcting canonical authority or projection builder logic.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| missing projection | verification `missingProjectionCount > 0` | run write recovery |
| stale schema-owned field | verification `staleProjectionCount > 0` | run repair reconciliation |
| orphan projection | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable Firestore failure | deploy index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run targeted recovery.
2. Review drift and verification counts.
3. Run write repair for the same scope.
4. Confirm verification passes.
5. Check `projection_health/search_feed`.
6. Continue checkpointed recovery while `nextCursor` is present.
7. Resolve failure ledger entries.

## Escalation Criteria

Escalate before write mode if drift is unexpectedly broad, indexes are missing, or failures repeat. Do not bypass canonical `posts` and `post_stats`.
