---
id: BT-DOCS-OPERATIONS-PROJECTIONS-COVERDERIVATIVESRECOVERYRUNBOOK
title: "Cover Derivatives Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Cover Derivatives Recovery Runbook

Status: Phase 8A.20 production recovery runbook
Projection: `cover_derivatives`

## Authority

Books, external/user cover sources, and `cover_jobs` remain authority. Recovery does not change book cover UX.

## Projection

- `cover_jobs`
- book cover fields
- storage cover derivatives

## Dry Run Command

```json
{ "projectionName": "cover_derivatives", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Cover derivative verification" }
```

## Write Command

```json
{ "projectionName": "cover_derivatives", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair cover derivative metadata drift after dry run" }
```

## Verification Query

Bounded pages of `cover_jobs` verify cover derivative state and status metadata.

## Failure Modes

- missing cover job
- stale cover status
- missing derivative storage evidence
- checkpoint failure

## Operator Steps

Run dry run, review cover drift, repair metadata-only drift, confirm health.

## Escalation Criteria

Escalate if catalog/search cover display degrades or storage derivatives are missing.
