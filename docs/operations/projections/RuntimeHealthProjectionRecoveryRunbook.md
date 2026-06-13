---
id: BT-DOCS-OPERATIONS-PROJECTIONS-RUNTIMEHEALTHPROJECTIONRECOVERYRUNBOOK
title: "Runtime Health Projection Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Runtime Health Projection Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `runtime_health_projection`

## Authority

`operational_metrics` records from `recordOperationalMetric` remain authority.

## Projection

- `runtime_health_projection`
- `beta_observability_summary`

## Dry Run Command

```json
{ "projectionName": "runtime_health_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 runtime health verification" }
```

## Write Command

```json
{ "projectionName": "runtime_health_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair runtime health projection drift after dry run" }
```

## Verification Query

Bounded pages of `operational_metrics` verify runtime health materialization.

## Failure Modes

- missing health projection
- stale health projection
- metric retention gap
- checkpoint failure

## Operator Steps

Run dry run, inspect operational drift, repair bounded records, verify health.

## Escalation Criteria

Escalate if operators lose health visibility during beta.
