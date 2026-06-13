---
id: BT-DOCS-OPERATIONS-PROJECTIONS-ATTACHMENTMETADATARECOVERYRUNBOOK
title: "Attachment Metadata Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Attachment Metadata Recovery Runbook

Status: Phase 8A.20 production recovery runbook
Projection: `attachment_metadata`

## Authority

Upload intent and storage object metadata remain canonical authority. Recovery does not change upload flow or storage architecture.

## Projection

- `attachments`
- processing metadata including `storagePath` and `processingStatus`

## Dry Run Command

```json
{ "projectionName": "attachment_metadata", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Attachment metadata verification" }
```

## Write Command

```json
{ "projectionName": "attachment_metadata", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair attachment metadata drift after dry run" }
```

## Verification Query

Bounded pages of `attachments` verify required metadata and projection visibility.

## Failure Modes

- missing metadata
- stale processing state
- missing storage path
- checkpoint failure

## Operator Steps

Run dry run, review verification and failure ledger, repair metadata-only drift, confirm health.

## Escalation Criteria

Escalate if storage objects are missing or upload intent evidence is inconsistent.
