---
id: BT-DOCS-OPERATIONS-PROJECTIONS-SEARCHBOOKMARKSRECOVERYRUNBOOK
title: "Projection Recovery Runbook: Search Bookmarks"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Runbook: Search Bookmarks

## Projection Name

`search_bookmarks`

## Classification

`search_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
users/{uid}/bookmarks/{entityId}
users/{uid}/venue_bookmarks/{entityId}
users/{uid}/event_bookmarks/{entityId}
```

No rebuild may use `search_bookmarks` as authority.

## Projection Collections

```text
search_bookmarks
```

## Maintainer

```text
Normal path: bookmark search triggers
Recovery path: recoverSearchBookmarks
```

## Current Consumers

```text
search personalization
bookmark filters
```

## Expected Indexes

```text
collectionGroup(bookmarks)
collectionGroup(venue_bookmarks)
collectionGroup(event_bookmarks)
search_bookmarks ordered by __name__
search_bookmarks(uid,entityType,createdAt)
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each bookmark authority document writes or deletes at most one search projection.

## Rebuild Commands

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "dry_run",
  "reason": "Inspect user search bookmark drift"
}
```

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Repair user search bookmark drift"
}
```

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed search bookmark audit"
}
```

## Reconciliation Modes

Use `report_only` with dry run to inspect drift. Use `repair` with write mode to rebuild or delete drifted projection documents.

## Verification Query

```text
Authority: canonical user bookmark subcollections
Projection: search_bookmarks/{uid_entityId}
Expected: uid, entityId, entityType, createdAt from bookmark authority
```

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed`.
- Drift counters are `0`.
- Projection health is `healthy`.

## Rollback Strategy

Search bookmark recovery is idempotent and derived only from canonical bookmark subcollections. Rollback is a re-run after correcting bookmark authority.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| missing bookmark projection | verification `missingProjectionCount > 0` | run write recovery |
| stale bookmark projection | verification `staleProjectionCount > 0` | run repair reconciliation |
| orphan bookmark projection | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable Firestore failure | deploy index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run for a user or checkpointed page.
2. Review drift and verification counts.
3. Run write repair.
4. Confirm verification passes.
5. Check `projection_health/search_bookmarks`.
6. Continue checkpointed recovery while `nextCursor` is present.
7. Resolve failure ledger entries.

## Escalation Criteria

Escalate before repair if orphan counts are unexpectedly broad or failures repeat. Do not use `search_bookmarks` as authority.
