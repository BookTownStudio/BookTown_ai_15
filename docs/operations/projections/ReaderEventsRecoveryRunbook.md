# Reader Events Recovery Runbook

Status: Phase 8A.19 production recovery runbook
Projection: `reader_events`

## Authority

Reader operations remain the authority. Recovery does not change reader UX or reading progress logic.

## Projection

- `reader_events`

## Dry Run Command

```json
{ "projectionName": "reader_events", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Reader events verification" }
```

## Write Command

```json
{ "projectionName": "reader_events", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader event metadata drift after dry run" }
```

## Verification Query

Bounded pages of `reader_events` verify operational event visibility and required metadata.

## Failure Modes

- malformed reader event
- missing user/book metadata
- checkpoint failure
- write failure

## Operator Steps

Run dry run, inspect verification reports and failure ledger entries, repair bounded metadata drift, confirm health.

## Escalation Criteria

Escalate if reader events are missing for active reader operations or retention gaps affect analytics.
