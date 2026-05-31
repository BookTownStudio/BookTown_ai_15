# Reader Manifests Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `reader_manifests`

## Authority

Readable book attachment and storage object metadata remain authority.

## Projection

- `reader_manifests/{bookId}`

## Dry Run Command

```json
{ "projectionName": "reader_manifests", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 reader manifest verification" }
```

## Write Command

```json
{ "projectionName": "reader_manifests", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader manifest drift after dry run" }
```

## Verification Query

Bounded pages of `books` are checked against `reader_manifests/{bookId}`.

## Failure Modes

- missing manifest
- stale manifest metadata
- inaccessible storage object
- checkpoint failure

## Operator Steps

Run dry run, inspect reports, run repair, then verify health.

## Escalation Criteria

Escalate if reader bootstrap failures persist after repair.
