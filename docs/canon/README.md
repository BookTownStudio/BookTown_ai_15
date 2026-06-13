---
id: BT-CANON-README-001
title: "BookTown Canon Layer Definition"
status: active
authority_level: master
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

# BookTown Canon Layer

This directory defines the Canon layer. The Canon layer is now structurally governed, but no product or platform truth document has been promoted to Canon yet.

## Purpose

The Canon layer is reserved for BookTown's permanent product truth: durable, highest-level statements that should remain stable across architecture migrations, implementation phases, team growth, investor review, AI-assisted development, and multi-year product evolution.

Canon documents are not implementation plans, audits, feature specs, or temporary strategy notes. They are the highest-level product truth that other documentation layers must respect.

## Permanent Product Truth

Permanent Product Truth means:

- BookTown's durable identity.
- The non-negotiable product principles.
- The long-term meaning of BookTown as a literary intelligence platform.
- The highest-level separation between canonical truth, user truth, derived intelligence, and product surfaces.
- The truths that future Vision, Master, Architecture, ADR, Product, Governance, and Operations documents must not contradict.

## Canon Foundation Documents

| Document | Purpose |
|---|---|
| [CANON_OVERVIEW.md](CANON_OVERVIEW.md) | Defines what Canon means inside BookTown. |
| [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md) | Defines how a document or distilled truth becomes Canon. |
| [CANON_AUTHORITY_MODEL.md](CANON_AUTHORITY_MODEL.md) | Defines Canon authority over lower layers. |
| [CANON_REGISTRY.md](CANON_REGISTRY.md) | Tracks current Canon documents, draft Canon documents, candidates, rejected candidates, and superseded Canon. |

## Highest Authority Documents

Future Canon documents may include documents such as:

- Final product truth.
- Permanent product doctrine.
- Durable platform identity.
- Canonical product boundaries.

This foundation does not promote those documents.

## Relationship To Vision

Canon sits above Vision.

Vision documents describe long-term direction. Canon documents define permanent truth. A Vision document may evolve as strategy matures. A Canon document should change only through explicit, controlled governance.

## Relationship To Master

Master documents route humans and AI systems to the correct source of truth. Canon documents define the highest source of truth once created.

The Master layer must point to Canon documents when they exist. Until then, the Master layer remains the deterministic routing authority for current documentation.

## Current Boundary

This directory now contains Canon governance, authority, promotion, and registry documents. It must not be treated as containing promoted product or platform Canon until future Canon truth documents are explicitly created, approved, and listed as current in [CANON_REGISTRY.md](CANON_REGISTRY.md).
