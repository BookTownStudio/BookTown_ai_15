# Shelf Display Projection Recovery Runbook

Status: Phase 8A.21 production recovery runbook
Projection: `shelf_display_projection`

## Authority

`shelf_books` remains authority for shelf display DTO compatibility. Recovery does not change library UX.

## Projection

- generated shelf DTO book counts/covers
- legacy shelf display fields

## Dry Run Command

```json
{ "projectionName": "shelf_display_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Shelf display verification" }
```

## Write Command

```json
{ "projectionName": "shelf_display_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair shelf display metadata drift after dry run" }
```

## Verification Query

Bounded pages of `shelf_books` verify required shelf/book identity metadata used by display DTOs.

## Failure Modes

- missing shelf display metadata
- stale shelf membership projection
- malformed shelf/book mapping
- checkpoint failure

## Operator Steps

Run dry run, review verification report, repair bounded metadata drift, confirm health.

## Escalation Criteria

Escalate if shelf display drift suggests corrupted `shelf_books` authority.
