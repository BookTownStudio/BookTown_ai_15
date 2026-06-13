---
id: BT-DOCS-OPERATIONS-PROJECTIONS-COMPATIBILITYREADABILITYFIELDSDEPRECATIONRUNBOOK
title: "Compatibility Readability Fields Deprecation Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Compatibility Readability Fields Deprecation Runbook

Status: Phase 8A.19 deprecated compatibility runbook
Projection: `compatibility_readability_fields`

## Authority

`reader_authority_projection` is the certified authority-backed projection. `books.downloadable` and `books.isEbookAvailable` are deprecated compatibility fields.

## Projection

- `books.downloadable`
- `books.isEbookAvailable`

## Dry Run Command

```json
{ "projectionName": "reader_authority_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Verify reader authority before readability compatibility sunset" }
```

## Write Command

```json
{ "projectionName": "reader_authority_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader authority before readability compatibility sunset" }
```

## Verification Query

Verify `books.readerAuthority` and use compatibility fields only as legacy read surfaces.

## Failure Modes

- legacy client still depends on compatibility fields
- readerAuthority drift
- search DTO still reads legacy field

## Operator Steps

Keep fields readable, do not create new authority, and route certification through `reader_authority_projection`.

## Escalation Criteria

Escalate if a production reader/search path cannot use `readerAuthority`.
