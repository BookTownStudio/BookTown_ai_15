# Reader Insights DTO Recovery Runbook

Status: Phase 8A.19 production recovery runbook
Projection: `reader_insights_dto`

## Authority

`reading_progress` and `reader_events` remain authority. The DTO is callable output only and is not persisted.

## Projection

- callable response from `getReaderInsights`

## Dry Run Command

```json
{ "projectionName": "reader_insights_dto", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Reader insights DTO query-health verification" }
```

## Write Command

```json
{ "projectionName": "reader_insights_dto", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader insights metadata drift after dry run" }
```

## Verification Query

Bounded `reading_progress` pages verify query health and required fields used by the DTO.

## Failure Modes

- missing progress metadata
- reader event query index issue
- checkpoint failure
- write failure

## Operator Steps

Run dry run, review query-health evidence, repair metadata only, confirm health.

## Escalation Criteria

Escalate if Home or Reader continue-reading DTOs cannot be produced from authority.
