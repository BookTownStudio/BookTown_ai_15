---
id: BT-DOCS-GOVERNANCE-001
title: "BookTown Documentation Governance"
status: active
authority_level: governance
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Documentation Governance

This document defines the BookTown Documentation Operating System. It governs how documentation is organized, how authority flows between layers, how documents are maintained, and how humans and AI systems determine which document is authoritative.

This file is process authority. It does not replace domain architecture, runtime contracts, operations runbooks, or Master documents. It defines the rules that keep those documents coherent over time.

## Documentation Layer Model

| Layer | Purpose | Authority Role | AI Default |
|---|---|---|---|
| Canon | Curated long-term product truths that should remain stable across product phases. | Highest durable truth after explicit promotion. | Read only when populated and routed by Master. |
| Vision | Long-term product intent, strategic direction, and product identity. | Product intent authority. | Read for strategy and product direction. |
| Master | System maps, product maps, authority routing, document index, and first-class system summaries. | Primary operational source of truth. | Read first. |
| ADR | Locked architecture decisions and decision history. | Highest technical decision authority for scoped decisions. | Read when routed by Master or a register. |
| Architecture | Domain registers, contracts, authority files, and architecture plans. | Binding domain authority when routed by Master. | Read after Master routing. |
| Product | Product behavior, UX rules, surface maps, and feature expectations. | Product execution reference. | Read for user-facing behavior. |
| Governance | Process rules, documentation rules, engineering rules, and safety rules. | Operating policy authority. | Read for process, lifecycle, and maintenance rules. |
| Operations | Runbooks, recovery procedures, monitoring, certification, and incident handling. | Operational authority. | Read for operations tasks only. |
| Audits | Evidence, findings, readiness assessments, and risk records. | Evidence only unless promoted. | Do not read by default. |
| Archive | Superseded, historical, completion, and migration records. | Non-authoritative history. | Ignore by default. |

## Authority Hierarchy

When documents conflict, resolve authority in this order:

1. Canon documents with `status: active` or `status: locked`.
2. Vision documents with `status: active` or `status: locked`.
3. Master documents with `source_of_truth: true`.
4. Locked ADRs or locked register decisions.
5. Active architecture registers and authority documents.
6. Product documents for UX and surface behavior.
7. Governance policy documents.
8. Operations registries and runbooks for operational procedure.
9. Audits and completion files as evidence only.
10. Archived or superseded documents as history only.

Authority is never inferred from filename, recency, or document length. Authority is determined by metadata, layer, status, and routing through `docs/master/MASTER_AUTHORITY_MATRIX.md`.

## Document Lifecycle

All governed documents must use one of these lifecycle states:

| Status | Meaning | Authority |
|---|---|---|
| `draft` | Proposed or incomplete. | Not authoritative unless explicitly routed as working input. |
| `active` | Current maintained authority or reference. | Authoritative according to layer and routing. |
| `locked` | Stable decision or record that should not change except by explicit replacement. | Strong authority for its scope. |
| `superseded` | Replaced by a newer document. | Historical only; must declare `superseded_by`. |
| `archived` | Retained for history, auditability, or migration evidence. | Historical only. |

Lifecycle rules are defined in [DOCUMENT_LIFECYCLE_POLICY.md](DOCUMENT_LIFECYCLE_POLICY.md).

## Authority Update Triggers

The following changes require documentation authority review:

1. Every new first-class system must be evaluated for Master document ownership.
2. Every architecture change must evaluate `MASTER_AUTHORITY_MATRIX.md` impact.
3. Every new user-facing surface must evaluate `MASTER_PRODUCT_MAP.md` impact.
4. Every authority change must update authoritative routing.
5. Every superseded document must declare `superseded_by`.
6. Every promoted audit finding must be reflected in a Master, Architecture, Governance, Product, Operations, or ADR document.
7. Every runtime ownership change must evaluate whether documentation authority still points to the correct source.

Authority update rules are defined in [AUTHORITY_CHANGE_POLICY.md](AUTHORITY_CHANGE_POLICY.md).

## AI Reading Order

AI systems must use this default reading order:

1. `docs/README.md`
2. `docs/master/MASTER_DOC_INDEX.md`
3. `docs/master/MASTER_AUTHORITY_MATRIX.md`
4. `docs/master/MASTER_SYSTEM_MAP.md`
5. `docs/master/MASTER_PRODUCT_MAP.md`
6. Relevant P0 Master document.
7. Routed architecture, governance, product, or operations document.
8. Audit evidence only after authoritative documents are known.

AI systems must ignore archived and superseded documents by default. AI consumption rules are defined in [AI_CONSUMPTION_POLICY.md](AI_CONSUMPTION_POLICY.md).

## Archive Rules

Archived and superseded documents are retained for traceability, not authority. They may be read only when the task explicitly requires history, migration evidence, audit evidence, or superseded decision context.

Archive rules are defined in [ARCHIVE_POLICY.md](ARCHIVE_POLICY.md).

## Promotion Rules

Audits, completion reports, prompts, pasted source files, and exploratory plans are evidence only until promoted into an authority layer.

A document may be promoted only when:

1. Its target authority layer is identified.
2. Its owner accepts maintenance responsibility.
3. Its metadata is updated to the required standard.
4. Its routing is reflected in the Master Layer.
5. Any replaced authority declares `superseded_by`.

Canon promotion requires the process defined in `docs/canon/CANON_PROMOTION_POLICY.md`. Canon may contain only durable long-term truths, not implementation detail, temporary roadmap status, or audit evidence.

## Master Layer Responsibilities

The Master Layer is responsible for:

1. AI-safe entry and routing.
2. System inventory and maturity mapping.
3. Product journey and surface mapping.
4. Authority routing by domain.
5. Identification of missing or weak authority.
6. Ownership hints for future Master documents.

Every first-class system must have either a dedicated Master document or an explicit reason in `MASTER_SYSTEM_MAP.md` for why a shared Master document is sufficient.

## Canon Layer Responsibilities

The Canon Layer is responsible for:

1. Long-term invariant BookTown truths.
2. Stable product principles that should survive architecture migrations.
3. Curated terminology and domain ontology after explicit promotion.
4. Non-transient product identity and governance principles.

Canon must not contain implementation plans, completion reports, temporary maturity scores, migration checklists, or audit findings unless those findings have been distilled into durable truth.

Canon status is tracked in `docs/canon/CANON_REGISTRY.md`. Candidate entries are evidence only until explicitly promoted.

## Maintenance Responsibilities

Documentation governance is owned by `documentation-governance`.

Maintainers must:

1. Keep Master routing current after architecture or authority changes.
2. Keep document metadata valid.
3. Mark superseded documents explicitly.
4. Prevent audits and completion files from becoming implicit authority.
5. Keep AI reading order deterministic.
6. Review first-class system ownership after major product or platform changes.

## Required Metadata Standard

Every governed authority document must include:

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

Documents missing metadata may still be useful evidence, but they are not first-class authority until metadata and routing are corrected.
