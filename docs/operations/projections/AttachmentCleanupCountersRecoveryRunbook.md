# Attachment Cleanup Counters Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `attachment_cleanup_counters`

## Authority Source

Canonical authority:

- `attachments`
- attachment metadata fields including `uploader.uid` and `size`

The scheduled cleanup job may still decrement counters during normal operation, but certified recovery does not trust increments. Recovery recomputes exact counters from canonical attachment authority.

## Projection Target

- `user_stats.storageUsageBytes`
- `user_stats.attachmentStorageFiles`
- `user_stats.counters.attachmentStorageBytes`
- `user_stats.counters.attachmentStorageFiles`

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Phase 8A attachment cleanup counter verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Repair attachment cleanup counter drift after dry-run verification"
}
```

## Checkpointed Full Recovery

```json
{
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "checkpointId": "attachment_cleanup_counters:checkpointed_full:global",
  "batchSize": 100,
  "reason": "Checkpointed attachment cleanup counter verification"
}
```

Resume with the same `checkpointId`.

## Verification Query

For each candidate user, verifier computes:

- `attachments.where("uploader.uid", "==", uid).count()`
- `attachments.where("uploader.uid", "==", uid).sum("size")`

Detected drift:

- missing counter docs
- orphan counter docs
- storage counter drift
- attachment size drift

## Failure Modes

- missing `attachments(uploader.uid)` index
- invalid or missing attachment `size`
- orphan `user_stats` counter document
- write failure
- checkpoint cannot advance

## Operator Steps

1. Run dry-run for `single_user`, `collection_page`, or `checkpointed_full`.
2. Review verification report and failure ledger entries.
3. If drift is bounded, rerun with `"mode": "write"` and `"reconciliationMode": "repair"`.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if:

- verification success rate is below `0.995`
- aggregate query index is missing in production
- a user has repeated attachment size drift after repair
- recovery produces critical failure ledger entries
