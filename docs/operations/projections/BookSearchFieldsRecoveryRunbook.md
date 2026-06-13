---
id: BT-DOCS-OPERATIONS-PROJECTIONS-BOOKSEARCHFIELDSRECOVERYRUNBOOK
title: "Book Search Fields Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Book Search Fields Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `book_search_fields`

## Authority

`books` and `editions` remain authority.

## Projection

- `books.search`
- `editions.search`

## Dry Run Command

```json
{ "projectionName": "book_search_fields", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 book search field verification" }
```

## Write Command

```json
{ "projectionName": "book_search_fields", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair book search field drift after dry run" }
```

## Verification Query

Bounded pages of `books` verify materialized search fields.

## Failure Modes

- missing search fields
- stale search metadata
- write failure
- checkpoint failure

## Operator Steps

Run dry run, inspect search drift, repair bounded records, verify health.

## Escalation Criteria

Escalate if catalog search quality degrades after repair.
