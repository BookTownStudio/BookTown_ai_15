---
id: BT-DOCS-OPERATIONS-PROJECTIONS-READEREPUBINDEXESRECOVERYRUNBOOK
title: "Reader EPUB Indexes Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Reader EPUB Indexes Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `reader_epub_indexes`

## Authority

EPUB storage object and generated reader manifest remain authority for index rebuild.

## Projection

- `reader_location_map`
- `reader_spine_map`
- `reader_section_graph`
- `reader_stable_anchor_map`
- `reader_navigation_index`
- `reader_pagination_hints`
- `reader_literary_coordinate_map`
- `reader_passage_index`
- `reader_annotation_identity_index`
- `reader_literary_memory_primitives`

## Dry Run Command

```json
{ "projectionName": "reader_epub_indexes", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 EPUB index verification" }
```

## Write Command

```json
{ "projectionName": "reader_epub_indexes", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair EPUB index drift after dry run" }
```

## Verification Query

Bounded pages of `reader_manifests` are checked against primary index records.

## Failure Modes

- missing index records
- stale index metadata
- storage read failure
- checkpoint failure

## Operator Steps

Run dry run, inspect drift, repair only bounded failures, verify health.

## Escalation Criteria

Escalate if quote/highlight anchoring drift persists.
