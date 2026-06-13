---
id: BT-DOCS-OPERATIONS-PROJECTIONS-POSTENGAGEMENTRECOVERYRUNBOOK
title: "Projection Recovery Runbook: Post Engagement Stats"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Runbook: Post Engagement Stats

## Projection Name

```text
post_engagement_stats
```

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
users/{uid}/likes/{postId}
users/{uid}/reposts/{postId}
users/{uid}/bookmarks/{entityId} where type == "post"
posts/{postId}/comments/{commentId}
```

The following legacy paths are not authority and must not be used for recovery:

```text
posts/{postId}/likes
posts/{postId}/bookmarks
posts/{postId}/reposts
```

## Projection Collections

```text
post_stats/{postId}
posts/{postId}.counters
```

## Maintainer

```text
Normal path: social interaction triggers
Recovery path: recoverPostEngagementStats
```

## Expected Indexes

```text
posts ordered by __name__
posts where authorId == ownerId ordered by __name__
post_stats ordered by __name__
collectionGroup(likes) where postId == postId
collectionGroup(reposts) where originalPostId == postId
collectionGroup(bookmarks) where entityId == postId and type == post
posts/{postId}/comments count query
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`

## Dry Run Command

Dry run is the default and must run before write mode.

```json
{
  "scope": "single_post",
  "postId": "<postId>",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect post engagement counter drift"
}
```

## Write Command

```json
{
  "scope": "single_post",
  "postId": "<postId>",
  "mode": "write",
  "reconciliationMode": "repair",
  "batchSize": 100,
  "verify": true,
  "reason": "Repair post engagement counter drift after dry-run confirmation"
}
```

## Owner Recovery

```json
{
  "scope": "owner",
  "ownerId": "<authorUid>",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect post engagement drift for one author"
}
```

## Checkpointed Full Recovery

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed post engagement audit"
}
```

Repeat with the returned `nextCursor` or checkpoint until `nextCursor` is `null`. Use write mode only after dry-run scope and counts are understood.

## Verification Query

```text
Authority: user-centric likes, reposts, post bookmarks, and post comments
Projection: post_stats flat fields, post_stats.counters, posts.counters
Expected: exact count equality for likes, reposts, bookmarks, comments
```

Verification reports missing stats docs, stale flat/nested counters, `posts.counters` drift, orphan `post_stats`, mismatch counts, and success rate.

## Reconciliation Path

```text
report_only: dry-run/write summary and verification report without mutation
repair: write mode sets exact post_stats and posts.counters values from authority counts
```

Repairs are idempotent `set` writes. Increment-based repair is forbidden.

## Failure Modes

```text
missing post_stats doc
stale post_stats flat field
stale post_stats nested counter
stale posts.counters mirror
orphan post_stats for missing post
authority count query failure
missing collection group index
```

## Operator Steps

1. Run `single_post` dry-run for suspected incident examples.
2. Review verification report and `projection_failure_ledger`.
3. If drift is bounded, rerun with `mode: "write"` and `reconciliationMode: "repair"`.
4. For broad drift, run `checkpointed_full` dry-run until complete before any write pass.
5. Confirm `projection_health/post_engagement_stats` is healthy after repair.

## Escalation Criteria

Escalate before write mode if:

- collection-group indexes are missing;
- hot posts show repeated write failures;
- orphan `post_stats` documents are broad;
- verification success rate is below 99.9% outside a known incident window;
- drift also appears in `search_feed`, requiring search projection recovery after post engagement repair.
