---
id: BT-DOCS-OPERATIONS-PROJECTIONS-POSTANALYTICSRECOVERYRUNBOOK
title: "Post Analytics Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Post Analytics Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `post_analytics`

## Authority Source

Primary authority:

- `activity_log`

Secondary authority:

- `post_analytics/{postId}/viewers`

`activity_log` rebuilds engagement fields:

- `likes`
- `comments_count`
- `reposts`
- `bookmarks`

`post_analytics/{postId}/viewers` rebuilds:

- `unique_viewers`

Non-unique `views` is preserved from the existing analytics document during repair because no replayable event authority exists for anonymous/repeated view count. Recovery must not invent view authority.

## Projection Target

- `post_analytics/{postId}`

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Phase 8A post analytics verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Repair post analytics drift after dry-run verification"
}
```

## Checkpointed Full Recovery

```json
{
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "checkpointId": "post_analytics:checkpointed_full:global",
  "batchSize": 100,
  "reason": "Checkpointed post analytics verification"
}
```

Resume with the same `checkpointId`.

## Verification Query

Verifier reads bounded post pages and recomputes analytics from:

- `activity_log.where("object.entity_type", "==", "post").where("object.entity_id", "==", postId).where("verb", "==", verb).count()`
- `post_analytics/{postId}/viewers.count()`

Detected drift:

- missing analytics docs
- activity-to-analytics drift
- engagement counter drift
- unique viewer drift

## Failure Modes

- required Firestore index missing
- activity event schema mismatch
- viewer subcollection count failure
- analytics write failure
- checkpoint cannot advance

## Operator Steps

1. Run dry-run recovery.
2. Review verification report and failure ledger.
3. If drift is bounded, rerun with `"mode": "write"` and `"reconciliationMode": "repair"`.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if:

- verification success rate is below `0.995`
- index errors recur
- non-unique view count is suspected corrupt
- recovery produces critical failure ledger records
