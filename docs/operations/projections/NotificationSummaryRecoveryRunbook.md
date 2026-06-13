---
id: BT-DOCS-OPERATIONS-PROJECTIONS-NOTIFICATIONSUMMARYRECOVERYRUNBOOK
title: "Projection Recovery Runbook: Notification Summary"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Runbook: Notification Summary

## Projection Name

`notification_summary`

## Classification

`aggregate_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
notifications/{notificationId}
activity_log
```

Notification summary recovery computes final aggregate truth from canonical `notifications`. `activity_log` remains supporting authority for notification generation paths, but summary rebuilds must not read client state, cached state, or existing summary documents as authority.

## Projection Collections

```text
notification_summary
users/{uid}/meta/unread
```

## Maintainer

```text
Normal path: notification triggers
Recovery path: recoverNotificationSummary
```

## Current Consumers

```text
notification feed
unread badges
```

## Expected Indexes

```text
notifications ordered by __name__
notifications where uid == uid
notification_summary ordered by __name__
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each recovery unit recomputes one user's aggregate from canonical notifications and writes at most one summary document.

## Rebuild Commands

Dry run is the default and must be run first.

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "dry_run",
  "reason": "Inspect notification summary drift"
}
```

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "write",
  "reason": "Repair notification summary drift"
}
```

User-batch recovery:

```json
{
  "scope": "user_batch",
  "userIds": ["<uid-1>", "<uid-2>"],
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect notification summary drift for a bounded user batch"
}
```

Collection-page recovery:

```json
{
  "scope": "collection_page",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect a bounded notification summary page"
}
```

Checkpointed full recovery:

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed notification summary audit"
}
```

## Reconciliation Modes

Report-only reconciliation:

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "batchSize": 100,
  "reason": "Report notification summary drift"
}
```

Repair reconciliation:

```json
{
  "scope": "checkpointed_full",
  "mode": "write",
  "reconciliationMode": "repair",
  "batchSize": 100,
  "reason": "Repair notification summary drift"
}
```

## Verification Query

```text
Authority: notifications grouped by uid
Projection: notification_summary/{uid}
Expected unreadCount: count of notifications where uid == uid and read != true
Expected latestNotificationAt: max(lastUpdatedAt, createdAt) across notifications for uid
Expected lastReadAt: max(readAt) across read notifications for uid
```

Projection documents with no canonical notifications are orphan summaries and must be reported as `extraProjectionCount`.

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

Notification summary recovery is idempotent and derived only from canonical notifications. Rollback is a re-run after correcting notification authority records or aggregate logic. Do not restore `notification_summary` documents from backups unless the canonical notification source is also restored.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| incorrect unread count | verification `staleProjectionCount > 0` and `mismatchCount > 0` | run repair reconciliation for the user/scope |
| incorrect timestamp | verification `staleProjectionCount > 0` and `mismatchCount > 0` | run repair reconciliation |
| missing summary | verification `missingProjectionCount > 0` | run write recovery |
| orphan summary | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable failure from Firestore query | deploy required index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run targeted recovery for known `uid` or `userIds`.
2. Review `wouldWrite`, `failed`, and verification counts.
3. Run the same request with `mode: "write"` and `reconciliationMode: "repair"`.
4. Confirm the verification report passes.
5. Check `projection_health/notification_summary`.
6. If checkpointed full recovery returns `nextCursor`, repeat with the same checkpoint or cursor.
7. Resolve or dead-letter any failure ledger entries.

## Escalation Criteria

Escalate before repair mode if dry run reports unexpected high `extraProjectionCount`, repeated write failures, or missing indexes. Do not bypass canonical `notifications/{notificationId}` as the authority source.
