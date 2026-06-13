---
id: BT-DOCS-OPERATIONS-PROJECTIONS-SYSTEMEVENTSRECOVERYRUNBOOK
title: "System Events Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# System Events Recovery Runbook

## Authority

`system_events` is the canonical operational event evidence collection. It is append-only operational evidence and must not be replaced by derived metrics or exports.

## Projection

`system_events` is registered as an operational projection family for verification, retention checks, health reporting, and recovery evidence. Analytics exports read this collection as authority.

## Dry Run Command

```json
{
  "projectionName": "system_events",
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "reason": "Phase 8A system events verification"
}
```

## Write Command

```json
{
  "projectionName": "system_events",
  "scope": "checkpointed_full",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Approved Phase 8A system events marker repair"
}
```

## Verification Query

Use `recoverTier1PublicBetaProjection` with bounded pages or checkpointed full mode. Admin event views and analytics export recovery provide consumer-level verification.

## Failure Modes

- Missing expected event record.
- Orphan or malformed event record.
- Retention window mismatch.
- Analytics export mismatch against event count.
- Failure ledger or checkpoint write failure.

## Operator Steps

1. Run dry-run verification with the smallest practical scope.
2. Confirm latest event timestamps and event count through admin event controls.
3. Review failure ledger entries for malformed or orphan events.
4. Use write mode only for certified metadata repair, never to synthesize business events.
5. Re-run export verification if an analytics export depended on the affected event window.

## Escalation Criteria

Escalate if events are missing from the retained authority window, if event counts conflict with exports, or if a producer appears to have stopped logging structured events.

## Event Replay Procedures

System events are replay evidence for downstream metrics and exports. This runbook does not re-emit runtime events. For downstream replay, run the certified date-targeted analytics export recovery after verifying the relevant `system_events` page.
