---
id: BT-DOCS-OPERATIONS-PROJECTIONS-READINGPROGRESSCOMPATIBILITYRECOVERYRUNBOOK
title: "Reading Progress Compatibility Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Reading Progress Compatibility Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `reading_progress_compatibility_fields`

## Authority

`reading_progress` canonical records remain authority.

## Projection

Normalized compatibility fields on `reading_progress`.

## Dry Run Command

```json
{ "projectionName": "reading_progress_compatibility_fields", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 reading progress compatibility verification" }
```

## Write Command

```json
{ "projectionName": "reading_progress_compatibility_fields", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reading progress compatibility drift after dry run" }
```

## Verification Query

Bounded pages of `reading_progress` verify canonical compatibility fields.

## Failure Modes

- missing `uid`
- missing `bookId`
- missing state field
- checkpoint failure

## Operator Steps

Run dry run, inspect reports, repair bounded drift, verify health.

## Escalation Criteria

Escalate if reader progress authority is malformed.
