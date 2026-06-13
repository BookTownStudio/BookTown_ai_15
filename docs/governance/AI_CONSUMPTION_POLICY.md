---
id: BT-DOCS-AI-CONSUMPTION-POLICY-001
title: "BookTown AI Consumption Policy"
status: active
authority_level: governance
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown AI Consumption Policy

This policy defines how AI systems must consume BookTown documentation for architecture work, product planning, onboarding, audits, and implementation support.

## Documentation Layer Model

AI systems must treat BookTown documentation as layered authority, not as a flat corpus.

| Layer | AI Use |
|---|---|
| Canon | Durable truth after explicit routing. |
| Vision | Long-term product intent. |
| Master | Required first-read source. |
| ADR | Locked decision authority. |
| Architecture | Domain authority after Master routing. |
| Product | User-facing behavior and journeys. |
| Governance | Process and lifecycle rules. |
| Operations | Recovery and operational procedure. |
| Audits | Evidence only. |
| Archive | Ignore by default. |

## Authority Hierarchy

AI systems must resolve authority through:

1. Metadata.
2. Layer.
3. Lifecycle status.
4. Master routing.
5. Domain-specific authority.
6. Evidence only after authority is known.

AI systems must not treat search results, filename similarity, uploaded prompt files, or recent edits as authority.

## Document Lifecycle

AI systems must apply lifecycle filtering:

| Status | AI Rule |
|---|---|
| `draft` | Use only for planning or when explicitly requested. |
| `active` | Use when routed. |
| `locked` | Use as stable decision or evidence according to layer. |
| `superseded` | Ignore by default; follow `superseded_by`. |
| `archived` | Ignore by default. |

## Authority Update Triggers

When an AI-assisted task changes documentation authority, the AI system must check:

1. Does a new first-class system require a Master document?
2. Does `MASTER_AUTHORITY_MATRIX.md` need a route update?
3. Does `MASTER_SYSTEM_MAP.md` need a system, maturity, owner, or dependency update?
4. Does `MASTER_PRODUCT_MAP.md` need a surface or journey update?
5. Does any old document require `superseded_by`?
6. Does the change affect AI reading order or default ingestion?

## AI Reading Order

Default reading order:

1. `docs/README.md`
2. `docs/master/MASTER_DOC_INDEX.md`
3. `docs/master/MASTER_AUTHORITY_MATRIX.md`
4. `docs/master/MASTER_SYSTEM_MAP.md`
5. `docs/master/MASTER_PRODUCT_MAP.md`
6. Relevant P0 Master document:
   - `MASTER_ENTITY_PLATFORM.md`
   - `MASTER_CATALOG_LIBRARY.md`
   - `MASTER_READER.md`
   - `MASTER_SEARCH.md`
   - `MASTER_PROJECTION_RECOVERY.md`
7. Canon documents when the task concerns permanent product/platform truth or Canon governance.
8. Vision documents when the task concerns long-term direction, Literary Intelligence, or user experience.
9. Relevant governance policy when process or maintenance is involved.
10. Routed architecture, product, or operations authority.
11. Audits, completion files, and uploaded source files only as evidence.

## Archive Rules

AI systems must ignore archived and superseded documents by default.

AI systems may read archived or superseded documents only when:

1. The user asks for history.
2. The task requires migration evidence.
3. The task requires audit traceability.
4. The current authority explicitly routes to a historical record.

If a superseded document is read, AI systems must follow `superseded_by` before answering.

## Promotion Rules

AI systems may recommend promotion but must not assume promotion has occurred. A source is promoted only when its metadata, owner, lifecycle state, and Master routing are updated.

Uploaded prompt files, ChatGPT project sources, pasted request files, audits, and completion reports remain evidence until promoted into an authority layer.

## Master Layer Responsibilities

For AI systems, the Master Layer is the primary entry point. AI systems must use it to:

1. Classify the task.
2. Identify the system.
3. Find the correct authority document.
4. Determine whether audit evidence is relevant.
5. Avoid treating obsolete or duplicate files as current truth.

## Canon Layer Responsibilities

AI systems must treat Canon as durable truth only when a document is listed as current Canon in `docs/canon/CANON_REGISTRY.md`. Canon candidate entries and source documents are evidence only.

## Maintenance Responsibilities

AI-assisted documentation updates must preserve:

1. Deterministic routing.
2. Explicit metadata.
3. No silent authority changes.
4. No unmarked supersession.
5. No default use of archived or superseded files.

## Required Metadata Standard

AI systems must prefer documents with:

```yaml
id: stable-document-id
title: Human-readable title
status: draft | active | locked | superseded | archived
authority_level: canon | vision | master | adr | architecture | product | governance | operations | audit | archive
owner: owning-team-or-role
last_audited: YYYY-MM-DD
source_of_truth: true | false
supersedes: []
superseded_by: null
ai_read: true | false
```

Documents without metadata require caution. AI systems must report uncertainty when a metadata-free document appears to conflict with routed authority.
