---
id: BT-DOCS-OPERATIONS-PROJECTIONS-RUNTIMEANOMALYPROJECTIONRECOVERYRUNBOOK
title: "Runtime Anomaly Projection Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Runtime Anomaly Projection Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `runtime_anomaly_projection`

## Authority

`operational_metrics` remain authority.

## Projection

- `runtime_anomaly_projection`
- `runtime_anomaly_events`

## Dry Run Command

```json
{ "projectionName": "runtime_anomaly_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 runtime anomaly verification" }
```

## Write Command

```json
{ "projectionName": "runtime_anomaly_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair runtime anomaly drift after dry run" }
```

## Verification Query

Bounded pages of `operational_metrics` verify anomaly projection records.

## Failure Modes

- missing anomaly projection
- stale anomaly event
- metric retention gap
- checkpoint failure

## Operator Steps

Run dry run, review reports, repair bounded drift, verify health.

## Escalation Criteria

Escalate if critical anomalies are not visible.
