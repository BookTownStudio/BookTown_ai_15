---
id: BT-DOCS-OPERATIONS-PROJECTIONS-INTELLIGENCEAGGREGATESRECOVERYRUNBOOK
title: "Intelligence Aggregates Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Intelligence Aggregates Recovery Runbook

## Authority

Intelligence aggregates derive from existing intelligence signals and profile snapshots. The certified surfaces are `user_intelligence_profiles` and `intelligence_aggregates_global`.

## Projection

`intelligence_aggregates` is an aggregate projection maintained by scheduled profile builders, reconciliation, audit, drift monitor, and aggregation workers. It is never a new authority for AI, matchmaker, or recommendation logic.

## Dry Run Command

```json
{
  "projectionName": "intelligence_aggregates",
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "reason": "Phase 8A intelligence aggregate verification"
}
```

## Write Command

```json
{
  "projectionName": "intelligence_aggregates",
  "scope": "checkpointed_full",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Approved Phase 8A intelligence aggregate marker repair"
}
```

## Verification Query

Use `recoverTier1PublicBetaProjection` over `user_intelligence_profiles`. Required projection fields are `schemaVersion` and `privacyTier`. Use intelligence audit and drift monitor outputs for aggregate-level evidence.

## Failure Modes

- Missing profile aggregate.
- Stale schema version or privacy tier.
- Global aggregate drift from processed signals.
- Audit anomaly or drift metric threshold breach.
- Checkpoint or failure ledger write failure.

## Operator Steps

1. Run dry-run verification first.
2. Review intelligence audit and drift monitor summaries.
3. Confirm failure ledger entries are bounded to existing profile or aggregate records.
4. Run write mode only for approved marker or compatibility repair.
5. Re-run dry-run verification and confirm projection health returns to healthy.

## Escalation Criteria

Escalate if aggregate drift changes recommendation inputs, if profile rebuild throttling persists, or if global aggregate state cannot be explained by retained signals.

## Event Replay Procedures

Replay is limited to existing intelligence signals and scheduled worker boundaries. Do not change recommendation scoring, matchmaker scoring, prompt behavior, or AI behavior from this runbook. Use existing intelligence reconciliation workers for profile rebuilds when source signals are valid.
