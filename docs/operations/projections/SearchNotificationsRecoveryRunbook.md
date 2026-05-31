# Projection Recovery Runbook: Search Notifications

## Projection Name

`search_notifications`

## Classification

`search_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
notifications/{notificationId}
```

No rebuild may use `search_notifications` as authority.

## Projection Collections

```text
search_notifications
```

## Maintainer

```text
Normal path: syncNotificationToSearchIndex
Recovery path: recoverSearchNotifications
```

## Current Consumers

```text
notification search
admin notification search
```

## Expected Indexes

```text
notifications ordered by __name__
notifications where uid == uid
search_notifications ordered by __name__
search_notifications(uid,read,createdAt)
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each notification authority document writes or deletes at most one search projection.

## Rebuild Commands

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "dry_run",
  "reason": "Inspect user search notification drift"
}
```

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Repair user search notification drift"
}
```

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed search notification audit"
}
```

## Reconciliation Modes

Use `report_only` with dry run to inspect drift. Use `repair` with write mode to rebuild or delete drifted projection documents.

## Verification Query

```text
Authority: notifications/{notificationId}
Projection: search_notifications/{notificationId}
Expected: buildSearchNotificationProjection(notification)
```

Verification ignores `indexedAt` and detects missing, stale, schema-drifted, and orphan projection documents.

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed`.
- Drift counters are `0`.
- Projection health is `healthy`.

## Rollback Strategy

Search notification recovery is idempotent and derived only from canonical notifications. Rollback is a re-run after correcting notification authority.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| missing projection | verification `missingProjectionCount > 0` | run write recovery |
| stale projection | verification `staleProjectionCount > 0` | run repair reconciliation |
| orphan projection | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable Firestore failure | deploy index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run for a user or checkpointed page.
2. Review drift and verification counts.
3. Run write repair.
4. Confirm verification passes.
5. Check `projection_health/search_notifications`.
6. Continue checkpointed recovery while `nextCursor` is present.
7. Resolve failure ledger entries.

## Escalation Criteria

Escalate before repair if drift is unexpectedly broad, indexes are missing, or failures repeat. Do not bypass canonical `notifications`.
