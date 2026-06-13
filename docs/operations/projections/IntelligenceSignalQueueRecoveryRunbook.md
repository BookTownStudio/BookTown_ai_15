---
id: BT-DOCS-OPERATIONS-PROJECTIONS-INTELLIGENCESIGNALQUEUERECOVERYRUNBOOK
title: "Intelligence Signal Queue Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Intelligence Signal Queue Recovery Runbook

## Authority

Canonical signal authority remains the existing `intelligence_signal_queue` documents emitted from user activity, reader, writing, social, and librarian signal producers.

## Projection

`intelligence_signal_queue` is the operational queue consumed by intelligence profile builders and audit workers. It is not replaced by a new authority and does not change AI, matchmaker, or recommendation behavior.

## Dry Run Command

```json
{
  "projectionName": "intelligence_signal_queue",
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "reason": "Phase 8A intelligence signal queue verification"
}
```

## Write Command

```json
{
  "projectionName": "intelligence_signal_queue",
  "scope": "checkpointed_full",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Approved Phase 8A intelligence signal marker repair"
}
```

## Verification Query

Use `recoverTier1PublicBetaProjection` to verify bounded queue pages. Required signal fields are `uid`, `signalType`, and `signalFamily`.

## Failure Modes

- Missing queue document.
- Stale or malformed signal envelope.
- Duplicate deterministic signal from retried producers.
- Failed signal exceeding retry policy.
- Checkpoint or failure ledger write failure.

## Operator Steps

1. Run dry-run verification before any repair.
2. Review verification report samples for malformed or stale signals.
3. Inspect intelligence audit output before deciding whether replay is needed.
4. Run write mode only for metadata repair on existing queue records.
5. Re-run dry-run verification and monitor profile builder health.

## Escalation Criteria

Escalate if signal producers emit malformed envelopes, if queue retry failure rates rise, or if replay would affect recommendation behavior.

## Event Replay Procedures

Replay is bounded to existing queued signals and certified worker behavior. Do not synthesize new AI signals from this runbook. For source activity replay, validate the source authority first and use the owning domain recovery path.
