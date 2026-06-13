---
id: BT-DOCS-OPERATIONS-PROJECTIONS-PROJECTEDVIEWERSTATERECOVERYRUNBOOK
title: "Projected Viewer State Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projected Viewer State Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `projected_viewer_state`

## Authority Source

Canonical authority:

- `users/{uid}/likes`
- `users/{uid}/bookmarks` where `type == "post"`
- `users/{uid}/reposts`

`users/{uid}/post_interaction_state` is never authority. It is a feed optimization.

## Projection Target

- `users/{uid}/post_interaction_state/{postId}`

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "single_user",
  "uid": "USER_ID",
  "batchSize": 100,
  "reason": "Phase 8A viewer state verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "single_user",
  "uid": "USER_ID",
  "batchSize": 100,
  "reason": "Repair projected viewer state drift after dry-run verification"
}
```

## Verification Query

Verifier compares `post_interaction_state` to canonical user signal documents:

- `users/{uid}/likes/{postId}`
- `users/{uid}/bookmarks/{postId}` with `type == "post"`
- `users/{uid}/reposts/{postId}`

Detected drift:

- missing viewer state
- stale viewer state
- orphan viewer state

## Failure Modes

- required index missing
- signal document shape mismatch
- projection write failure
- checkpoint cannot advance

## Operator Steps

1. Run dry-run for `single_user`, `collection_page`, or `checkpointed_full`.
2. Review verification and failure ledger records.
3. Repair with explicit write mode if drift is bounded.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if verification success rate is below `0.995`, high-volume user state exceeds bounded page recovery, or repair produces critical failure ledger records.
