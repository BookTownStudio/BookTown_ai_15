---
id: BT-DOCS-OPERATIONS-PROJECTIONS-READERSYNCIDEMPOTENCYRECOVERYRUNBOOK
title: "Reader Sync Idempotency Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Reader Sync Idempotency Recovery Runbook

Status: Phase 8A Tier 1 production recovery runbook
Projection: `reader_sync_idempotency`

## Authority

Reader sync calls and existing idempotency records remain authority for replay safety.

## Projection

- `reader_sync_idempotency`

## Dry Run Command

```json
{ "projectionName": "reader_sync_idempotency", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Tier 1 reader idempotency verification" }
```

## Write Command

```json
{ "projectionName": "reader_sync_idempotency", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader idempotency metadata after dry run" }
```

## Verification Query

Bounded pages of `reader_sync_idempotency` verify record integrity and checkpointed visibility.

## Failure Modes

- malformed idempotency record
- stuck operation
- write failure
- checkpoint failure

## Operator Steps

Run dry run, inspect stuck operation evidence, repair only metadata drift, verify health.

## Escalation Criteria

Escalate if replay corruption or duplicate operation execution is suspected.
