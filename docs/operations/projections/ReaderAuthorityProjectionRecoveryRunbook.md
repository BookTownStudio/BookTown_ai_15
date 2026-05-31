# Reader Authority Projection Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `reader_authority_projection`

## Authority

Canonical authority remains book/edition attachment evidence and rights metadata. No reader UX or search behavior changes are part of recovery.

## Projection

- `books.readerAuthority`
- edition readability fields

## Dry Run Command

```json
{ "projectionName": "reader_authority_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 reader authority verification" }
```

## Write Command

```json
{ "projectionName": "reader_authority_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader authority projection drift after dry run" }
```

## Verification Query

Bounded pages of `books` are compared against materialized `books.readerAuthority`.

## Failure Modes

- missing readable attachment evidence
- missing `readerAuthority`
- write failure
- checkpoint failure

## Operator Steps

1. Run dry run.
2. Review verification report and failure ledger.
3. Run write repair only after bounded drift is confirmed.
4. Confirm projection health is healthy.

## Escalation Criteria

Escalate if reader entry drift affects readable books or repeated repair failures occur.
