---
id: BT-DOCS-OPERATIONS-PROJECTIONS-ACTIVITYLOGNOTIFICATIONSRECOVERYRUNBOOK
title: "Activity Log Notifications Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Activity Log Notifications Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `activity_log_notifications`
Authority source: `activity_log`
Projection target: `notifications`

## Authority Source

`activity_log` is the canonical authority for activity-derived notifications.

Eligible verbs:

- `post_liked`
- `post_commented`
- `post_reposted`
- `user_followed`

`notifications` is a projection. It must not be used as authority for recovery.

## Projection Target

Recovery writes deterministic notification documents using:

`{recipientUid}_{type}_{actorUid}_{entityId}`

The recovery path preserves existing `read` and `readAt` values because user read state is not derivable from `activity_log`.

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Phase 8A activity notification verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Repair activity_log_notifications drift after dry-run verification"
}
```

## Checkpointed Full Recovery

```json
{
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "checkpointId": "activity_log_notifications:checkpointed_full:global",
  "batchSize": 100,
  "reason": "Checkpointed activity notification verification"
}
```

Resume with the same `checkpointId`. Write mode requires `"reconciliationMode": "repair"`.

## Verification Query

Verifier reads bounded pages from `activity_log` and checks deterministic projection documents in `notifications`.

Detected drift:

- missing notification
- stale activity-to-notification fields
- collapse/count drift
- duplicate notification records by `dedupeId`
- projection mismatch against current notification preferences

## Failure Modes

- activity event missing required actor, target, or object fields
- notification preference suppression mismatch
- duplicate notification documents for the same `dedupeId`
- missing projection document
- stale projection fields
- Firestore write or index failure

## Operator Steps

1. Run dry-run recovery for the affected scope.
2. Review the verification report and failure ledger entries.
3. If drift is expected and bounded, rerun with `"mode": "write"` and `"reconciliationMode": "repair"`.
4. Confirm projection health returns to `healthy`.
5. Escalate if duplicate records, index errors, or repeated write failures remain.

## Escalation Criteria

Escalate to engineering when:

- verification success rate is below `0.995`
- duplicate notifications are detected
- recovery produces any `projection_failure_ledger` critical entry
- checkpointed recovery cannot advance
- required composite indexes are missing in production
