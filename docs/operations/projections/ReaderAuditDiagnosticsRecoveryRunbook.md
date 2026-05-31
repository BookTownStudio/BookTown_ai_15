# Reader Audit Diagnostics Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `reader_audit_diagnostics`

## Authority Source

Canonical operational evidence:

- `reader_events`
- existing reader diagnostic records
- external reader operational logs emitted by `recordReaderDiagnostic`

The callable `recordReaderDiagnostic` is privacy-bounded and log-only. It is operational evidence, not a Firestore authority, and recovery does not change reader runtime behavior.

## Projection Target

- `reader_audit/{readerEventId}`

Certified recovery rebuilds diagnostic audit records from persisted `reader_events` where possible. Existing log-only diagnostics are not backfilled into Firestore because that would create a new authority path.

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Phase 8A reader audit diagnostics verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Repair reader audit diagnostic drift after dry-run verification"
}
```

## Checkpointed Full Recovery

```json
{
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "checkpointId": "reader_audit_diagnostics:checkpointed_full:global",
  "batchSize": 100,
  "reason": "Checkpointed reader audit diagnostics verification"
}
```

Resume with the same `checkpointId`.

## Verification Query

For each candidate reader event, verifier compares:

- authority: `reader_events/{eventId}`
- projection: `reader_audit/{eventId}`

Detected drift:

- missing diagnostic records
- stale diagnostic records
- orphan diagnostic records for `single_user` checks

## Failure Modes

- missing `reader_events(uid,__name__)` or `reader_audit(uid,__name__)` index
- reader event is missing `uid`
- write failure to `reader_audit`
- checkpoint cannot advance
- log-only diagnostics cannot be replayed into Firestore

## Operator Steps

1. Run dry-run for `single_user`, `collection_page`, or `checkpointed_full`.
2. Review verification report and failure ledger entries.
3. If drift is bounded, rerun with `"mode": "write"` and `"reconciliationMode": "repair"`.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if:

- verification success rate is below `0.995`
- orphan diagnostic records persist after authority review
- `reader_events` no longer contains sufficient metadata to rebuild audit records
- recovery produces critical failure ledger entries
