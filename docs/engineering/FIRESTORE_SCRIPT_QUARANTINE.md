---
id: BT-DOCS-ENGINEERING-FIRESTORE-SCRIPT-QUARANTINE
title: "Firestore Script Quarantine"
status: active
authority_level: governance
owner: engineering-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Firestore Script Quarantine

The following paths are quarantined for production execution until migrated to `functions/src/core/firestoreSafety`.

## Quarantined Directories

- `functions/scripts`
- `scripts`

## Quarantined High-Risk Files

- `functions/src/admin/backfillStats.ts`
- `functions/src/admin/literaryAuthority.ts`
- `functions/src/library/admin/backfillCanonicalKeys.ts`
- `functions/promoteSuperadmin.cjs`
- `functions/src/deleteWriteProject.ts`
- `functions/src/publishing/loadChunkedProjectManuscript.ts`

## Production Execution Requirements

A quarantined script may not run against production unless it has:

- dry-run default
- `--project-id`
- `--confirm-production`
- `--max-docs`
- `--page-size`
- structured logs
- checkpointing for multi-page operations
- explicit owner approval

## Migration Target

Each script must be migrated to a bounded runner using `readFirestoreCollectionPage()` or a stricter domain-specific wrapper.
