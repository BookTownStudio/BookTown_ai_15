---
id: BT-DOCS-AUTHORITY-CHANGE-POLICY-001
title: "BookTown Authority Change Policy"
status: active
authority_level: governance
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Authority Change Policy

This policy defines when BookTown authority documents must be updated and how changes propagate through the Documentation Operating System.

## Documentation Layer Model

Authority is maintained across layers:

| Layer | Authority Maintenance Role |
|---|---|
| Canon | Maintains curated durable truths. |
| Vision | Maintains strategic product direction. |
| Master | Maintains routing, ownership, maturity, and first-read truth. |
| ADR | Maintains locked decision history. |
| Architecture | Maintains domain technical authority. |
| Product | Maintains user-facing behavior and surface expectations. |
| Governance | Maintains operating rules. |
| Operations | Maintains runbooks and recovery procedures. |
| Audits | Records evidence and findings. |
| Archive | Retains historical context only. |

## Authority Hierarchy

Authority changes must be evaluated against this hierarchy:

1. Canon and Vision for durable product truth.
2. Master for routing and system/product truth.
3. ADR and Architecture for technical decisions.
4. Product for surface behavior.
5. Governance for process rules.
6. Operations for runtime procedures.
7. Audits and completion reports as evidence.

Lower layers may not silently override higher layers.

## Document Lifecycle

Authority-bearing documents must be `active` or `locked`. A document with `status: draft`, `status: superseded`, or `status: archived` may not become current authority without an explicit lifecycle update.

## Authority Update Triggers

The following triggers require authority review:

| Trigger | Required Review |
|---|---|
| New first-class system | Evaluate dedicated Master document ownership and `MASTER_SYSTEM_MAP.md` entry. |
| New user-facing surface | Evaluate `MASTER_PRODUCT_MAP.md` and related product authority. |
| Architecture change | Evaluate `MASTER_AUTHORITY_MATRIX.md` and domain architecture authority. |
| Runtime write-owner change | Update runtime authority routing and affected architecture docs. |
| Runtime read-model/projection change | Evaluate projection/recovery authority and operations runbooks. |
| New API or contract boundary | Evaluate Contracts/API authority and relevant Master document. |
| New AI or recommendation behavior | Evaluate AI consumption, intelligence ownership, and product exposure. |
| Audit finding accepted as truth | Promote into an authority layer; audit remains evidence. |
| Completion report claims closure | Verify closure is represented in current authority, not only in the completion report. |
| Superseded document discovered | Add `superseded_by` and update routing. |

## AI Reading Order

For authority-change questions, AI systems must read:

1. `docs/master/MASTER_AUTHORITY_MATRIX.md`
2. `docs/master/MASTER_DOC_INDEX.md`
3. This policy.
4. The affected Master document.
5. The routed domain authority document.
6. Evidence documents only after current authority is known.

## Archive Rules

When authority moves from one document to another:

1. The old document must be marked `superseded` or `archived`.
2. The old document must declare `source_of_truth: false`.
3. The old document must declare `superseded_by` when a replacement exists.
4. The new document must declare `supersedes`.
5. Master routing must point to the new authority.

## Promotion Rules

Evidence becomes authority only through promotion. Promotion requires:

1. A target authority layer.
2. Owner acceptance.
3. Metadata correction.
4. Conflict review against existing authority.
5. Master routing update.
6. Explicit statement of whether the promoted document supersedes older authority.

Audits are evidence only unless promoted into authority. Completion reports are evidence only unless promoted into authority.

## Master Layer Responsibilities

The Master Layer must be updated when:

1. A system becomes first-class.
2. A first-class system loses or gains a dedicated Master document.
3. A product journey changes ownership.
4. A domain authority document changes.
5. Runtime authority and documentation authority diverge.
6. A major maturity or readiness classification changes.

## Canon Layer Responsibilities

Canon updates require stricter review than Master updates. Canon may only receive curated long-term truths that are stable across implementation changes.

Canon promotion and demotion are governed by `docs/canon/CANON_PROMOTION_POLICY.md`; Canon status is tracked in `docs/canon/CANON_REGISTRY.md`.

Canon must not be used for:

1. Runtime ownership tables.
2. Temporary maturity scores.
3. Implementation checklists.
4. Audit findings before distillation.
5. Feature plans likely to change.

## Maintenance Responsibilities

The author of any authority-changing documentation update must update all affected routing documents in the same change. If the correct route is unclear, the change must record the gap rather than inventing authority.

## Required Metadata Standard

Authority-changing documents must include:

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
