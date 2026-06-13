---
id: BT-DOCS-OPERATIONS-PROJECTIONS-AUTHOREDAUTHORLINKPROJECTIONRECOVERYRUNBOOK
title: "Authored Author Link Projection Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Authored Author Link Projection Recovery Runbook

Status: Phase 8A.21 production recovery runbook
Projection: `authored_author_link_projection`

## Authority

`users`, `public_profiles`, and `authors` remain authority. Recovery does not change author catalog or profile UX.

## Projection

- `author_user_links`
- authored author fields

## Dry Run Command

```json
{ "projectionName": "authored_author_link_projection", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Authored author link verification" }
```

## Write Command

```json
{ "projectionName": "authored_author_link_projection", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair authored author link metadata drift after dry run" }
```

## Verification Query

Bounded pages of `author_user_links` verify author/profile link materialization.

## Failure Modes

- missing author link
- stale author/profile metadata
- malformed ownership reference
- checkpoint failure

## Operator Steps

Run dry run, inspect drift, repair bounded metadata drift, confirm health.

## Escalation Criteria

Escalate if authors are linked to the wrong user or profile.
