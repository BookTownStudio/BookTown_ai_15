---
id: BT-ARCHIVE-LAYER-README-001
title: "BookTown Archive Layer"
status: active
authority_level: archive
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

# BookTown Archive Layer

The Archive layer preserves historical documentation that is no longer active authority. Archive documents remain available for traceability, audits, migration review, and decision history, but they must not be treated as current product, architecture, governance, operations, or Canon truth.

## Authority Rule

Archived documents are non-authoritative by default. Current authority must be resolved through:

1. `docs/master/MASTER_DOC_INDEX.md`
2. `docs/master/MASTER_AUTHORITY_MATRIX.md`
3. The routed Canon, Vision, Master, Governance, Architecture, Product, or Operations document.

Use this layer only when the task explicitly requires historical context, migration provenance, supersession review, or legacy reference checks.

## Archive Structure

| Folder | Purpose |
|---|---|
| `root/` | Legacy root documents demoted from active project authority. |
| `superseded/root/` | Root authority documents superseded by the Documentation Operating System. |
| `superseded/ontology/` | Legacy ontology documents superseded by current ontology authority. |
| `duplicates/` | Duplicate authority documents retained for traceability after consolidation. |
| `placeholders/` | Empty or placeholder architecture files retained as historical records. |

## Migrated Records

| Category | Count | Authority Status |
|---|---:|---|
| Legacy root records | 3 | Archived historical reference. |
| Superseded root records | 2 | Superseded historical reference. |
| Superseded ontology records | 2 | Superseded historical reference. |
| Duplicate authority records | 1 | Archived duplicate, routed to active authority. |
| Placeholder records | 4 | Archived non-authoritative placeholders. |

## AI Consumption Rule

AI systems must ignore this layer by default. AI systems may read archived documents only when the user asks for historical context, migration history, supersession lineage, or audit reconstruction.

