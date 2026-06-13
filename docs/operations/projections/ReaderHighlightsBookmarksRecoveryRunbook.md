---
id: BT-DOCS-OPERATIONS-PROJECTIONS-READERHIGHLIGHTSBOOKMARKSRECOVERYRUNBOOK
title: "Reader Highlights Bookmarks Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Reader Highlights Bookmarks Recovery Runbook

Status: Phase 8A.19 production recovery runbook
Projection: `reader_highlights_bookmarks`

## Authority

Reader sync operations and existing `reader_highlights` / `reader_bookmarks` records remain authority-adjacent user data. Recovery does not alter reader UX.

## Projection

- `reader_highlights`
- `reader_bookmarks`

## Dry Run Command

```json
{ "projectionName": "reader_highlights_bookmarks", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Reader highlights/bookmarks verification" }
```

## Write Command

```json
{ "projectionName": "reader_highlights_bookmarks", "mode": "write", "reconciliationMode": "repair", "scope": "collection_page", "batchSize": 100, "reason": "Repair reader highlight/bookmark metadata drift after dry run" }
```

## Verification Query

Bounded pages verify required `uid` and `bookId` metadata for reader artifacts.

## Failure Modes

- malformed highlight/bookmark record
- missing `uid`
- missing `bookId`
- checkpoint failure

## Operator Steps

Run dry run, inspect drift, repair metadata only, confirm health.

## Escalation Criteria

Escalate before repair if user-owned reader artifacts appear corrupted or deleted.
