# Catalog Identity Projection Recovery Runbook

Status: Phase 8A.21 production recovery runbook
Projection: `catalog_identity_projection`

## Authority

Canonical ingestion and materialization remain authority. Recovery does not change search UX or discovery algorithms.

## Projection

- `book_identity`
- `author_identity`
- canonical identity keys

## Dry Run Command

```json
{ "projectionName": "catalog_identity_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Catalog identity verification" }
```

## Write Command

```json
{ "projectionName": "catalog_identity_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair catalog identity metadata drift after dry run" }
```

## Verification Query

Bounded pages of `book_identity` verify identity materialization and required `bookId` mapping.

## Failure Modes

- missing identity projection
- stale identity key
- malformed book mapping
- checkpoint failure

## Operator Steps

Run dry run, inspect verification report and failure ledger, repair metadata-only drift, confirm health.

## Escalation Criteria

Escalate if ingestion dedupe or search identity resolution is inconsistent after repair.
