---
id: BT-DOCS-OPERATIONS-PROJECTIONS-ATTACHMENTIMAGEDERIVATIVESRECOVERYRUNBOOK
title: "Attachment Image Derivatives Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Attachment Image Derivatives Recovery Runbook

Status: Phase 8A.20 production recovery runbook
Projection: `attachment_image_derivatives`

## Authority

Original image storage object and attachment metadata remain authority. Recovery does not change derivative processing behavior.

## Projection

- storage derivative files
- `attachments.renditions`

## Dry Run Command

```json
{ "projectionName": "attachment_image_derivatives", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Attachment derivative verification" }
```

## Write Command

```json
{ "projectionName": "attachment_image_derivatives", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair attachment derivative metadata drift after dry run" }
```

## Verification Query

Bounded pages of `attachments` verify `storagePath` and `renditions`.

## Failure Modes

- missing derivative metadata
- stale derivative metadata
- missing original storage object evidence
- checkpoint failure

## Operator Steps

Run dry run, inspect missing/stale derivative reports, repair metadata-only drift, confirm health.

## Escalation Criteria

Escalate if derivative files are absent or media rendering breaks after metadata repair.
