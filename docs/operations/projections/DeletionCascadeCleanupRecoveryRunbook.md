---
id: BT-DOCS-OPERATIONS-PROJECTIONS-DELETIONCASCADECLEANUPRECOVERYRUNBOOK
title: "Deletion Cascade Cleanup Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Deletion Cascade Cleanup Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `deletion_cascade_cleanup_projection`

## Authority

`deletion_requests` and deleted authority documents remain the evidence source.

## Projection

Cascade-deleted projection records and deletion request evidence.

## Dry Run Command

```json
{ "projectionName": "deletion_cascade_cleanup_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 deletion cascade verification" }
```

## Write Command

```json
{ "projectionName": "deletion_cascade_cleanup_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair deletion cleanup evidence drift after dry run" }
```

## Verification Query

Bounded pages of `deletion_requests` verify cleanup evidence and projection status.

## Failure Modes

- missing cleanup evidence
- stale deletion status
- write failure
- checkpoint failure

## Operator Steps

Run dry run, inspect privacy/compliance evidence, repair only after review, verify health.

## Escalation Criteria

Escalate immediately for privacy-impacting drift or repeated repair failures.
