---
id: BT-DOCS-LIFECYCLE-POLICY-001
title: "BookTown Document Lifecycle Policy"
status: active
authority_level: governance
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Document Lifecycle Policy

This policy defines the lifecycle states, transitions, metadata requirements, and maintenance rules for governed BookTown documentation.

## Documentation Layer Model

Lifecycle state is independent of layer. A Master, Architecture, Governance, Product, Operations, Audit, or Archive document must still declare an explicit lifecycle status.

| Layer | Lifecycle Requirement |
|---|---|
| Canon | Must be `active` or `locked` after promotion. |
| Vision | May be `draft`, `active`, `locked`, or `superseded`. |
| Master | Must be `active` unless being replaced. |
| ADR | Must be `draft`, `locked`, or `superseded`. |
| Architecture | May be `draft`, `active`, `locked`, or `superseded`. |
| Governance | Must be `active` or `locked` after approval. |
| Operations | Must be `active` unless retired. |
| Audits | Should be `locked` after completion. |
| Archive | Must be `archived` or `superseded`. |

## Document Lifecycle

| Status | Required Metadata | Allowed Use | AI Behavior |
|---|---|---|---|
| `draft` | `source_of_truth: false` unless explicitly approved. | Proposal, working plan, review input. | Do not treat as authority. |
| `active` | `last_audited` and owner required. | Current authority or maintained reference. | Read when routed. |
| `locked` | Stable owner and date required. | Closed decision, completed audit, immutable record. | Read when routed or evidence is requested. |
| `superseded` | `superseded_by` required. | Historical reference only. | Ignore by default. |
| `archived` | `ai_read: false` by default. | Historical retention only. | Ignore by default. |

## Authority Hierarchy

Lifecycle status modifies authority:

1. `locked` and `active` documents may be authoritative according to layer.
2. `draft` documents may not override active or locked authority.
3. `superseded` documents may not override the document listed in `superseded_by`.
4. `archived` documents may not be used as current authority.
5. Audits and completion reports remain evidence even when `locked`.

## Authority Update Triggers

A lifecycle review is required when:

1. A document changes ownership.
2. A document is replaced or merged.
3. A document becomes first-class authority.
4. A runtime system changes write ownership, read ownership, or data authority.
5. A new first-class product surface is introduced.
6. A system moves from emerging to operational or first-class maturity.
7. An audit finding is accepted as current product, architecture, governance, or operations truth.

## AI Reading Order

AI systems must apply lifecycle filtering before reading content:

1. Prefer `active` and `locked` documents.
2. Read `draft` documents only for planning tasks.
3. Ignore `superseded` and `archived` documents unless history is requested.
4. Report unresolved conflicts if active documents disagree.

## Archive Rules

A document must move to `superseded` when another document replaces its authority. A document must move to `archived` when it has no current authority and is retained only for history.

No document may be silently retired. The retiring document must declare either:

```yaml
superseded_by: replacement-document-path
```

or:

```yaml
status: archived
source_of_truth: false
ai_read: false
```

## Promotion Rules

A document may move from `draft` to `active` only when:

1. Its owner is declared.
2. Its authority level is declared.
3. Its source-of-truth status is correct.
4. Its impact on Master routing has been evaluated.
5. It does not conflict with an existing higher-authority document.

A document may move to `locked` only when its scope is complete and future changes should occur through replacement, not in-place reinterpretation.

## Master Layer Responsibilities

The Master Layer must record or route every first-class system. When lifecycle changes affect system ownership, product journey ownership, or authority routing, the relevant Master document must be updated in the same documentation change.

## Canon Layer Responsibilities

Canon documents must not be created directly from drafts. A Canon candidate must first pass through active Master, Architecture, Vision, or Governance authority and then be curated into stable long-term truth.

## Maintenance Responsibilities

Owners must audit active authority documents at least when relevant product, architecture, or runtime changes occur. Stale documents must be updated, superseded, or archived rather than left ambiguous.

## Required Metadata Standard

All governed documents must use:

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
