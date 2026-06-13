---
id: BT-CANON-OVERVIEW-001
title: "BookTown Canon Overview"
status: active
authority_level: canon
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Canon Overview

This document defines what Canon means inside BookTown. Canon is the highest authority layer in the Documentation Operating System and contains only durable platform truths that lower layers must not contradict.

Canon does not automatically absorb existing architecture, product, audit, or governance documents. Existing documents may become Canon candidates, but promotion requires explicit governance through [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md).

## Purpose of Canon

Canon exists to preserve BookTown's permanent product and platform truths across multiple years of product evolution, architecture migrations, team changes, investor review, onboarding, and AI-assisted development.

Canon answers questions such as:

1. What is BookTown at the highest durable level?
2. What product truths must remain stable across implementation phases?
3. Which distinctions must every future architecture respect?
4. What principles must future Vision, Master, Architecture, Product, Governance, and Operations documents not contradict?

## Canon vs Vision

Canon defines permanent truth. Vision defines direction.

Vision documents may evolve as strategy, market sequencing, roadmap emphasis, and product storytelling mature. Canon should change rarely and only through explicit governance.

If Canon and Vision conflict, Canon wins.

The Vision Layer is defined in `docs/vision/`. Vision translates Canon-safe truths into long-term direction without becoming implementation, architecture, delivery planning, or historical evidence.

## Canon vs Architecture

Canon defines durable truth and platform boundaries. Architecture defines technical structure, runtime ownership, registers, system design, and implementation constraints.

Architecture documents may evolve as systems mature. Canon must not include implementation details, technology choices, data shapes, technical interfaces, temporary technical decisions, or migration plans.

If Canon and Architecture conflict, Canon wins and Architecture must be revised or marked as a known conflict.

## Canon vs Governance

Canon defines permanent product/platform truth. Governance defines process rules for maintaining documentation, authority, lifecycle, archive handling, and AI consumption.

Governance controls how Canon is promoted, maintained, demoted, and consumed. Governance does not outrank Canon on product truth, but governance controls the process by which Canon changes.

## Canon Promotion Rules

Canon promotion requires:

1. A candidate document or distilled candidate truth.
2. Explicit review under [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md).
3. Confirmation that the truth is stable across multiple years.
4. Confirmation that it contains no implementation detail, feature specification, evidence finding, temporary architecture decision, or delivery status.
5. Owner acceptance by `documentation-governance`.
6. Registry entry in [CANON_REGISTRY.md](CANON_REGISTRY.md).
7. Routing update in `docs/master/MASTER_DOC_INDEX.md`.

## Canon Demotion Rules

Canon demotion requires explicit governance. A Canon document may be demoted only when:

1. It is no longer durable truth.
2. It has been replaced by a newer Canon document.
3. It was discovered to contain implementation detail or temporary decision material.
4. Its authority must move to Vision, Master, Architecture, Product, Governance, Operations, Audit, or Archive.

Demoted Canon must be marked `superseded` or `archived` and must declare `superseded_by` when a replacement exists.

## Canon Authority Model

Canon is higher authority than Vision, Master, ADR, Architecture, Product, Governance, Operations, Audits, and Archive for durable product and platform truth.

Canon does not replace lower layers. It constrains them.

| Lower Layer | Canon Relationship |
|---|---|
| Vision | Must express direction that respects Canon. |
| Master | Must route to Canon when Canon governs a question. |
| ADR | Must not lock decisions that contradict Canon. |
| Architecture | Must implement system boundaries consistent with Canon. |
| Product | Must express user-facing behavior consistent with Canon. |
| Governance | Must preserve Canon lifecycle and promotion controls. |
| Operations | Must not redefine product truth through runbooks. |
| Audits | May identify Canon candidates or conflicts but are not Canon. |
| Archive | May contain historical Canon evidence but not current Canon truth. |

## Canon Lifecycle

Canon documents use the standard lifecycle states:

| Status | Canon Meaning |
|---|---|
| `draft` | Candidate or working Canon text; not current authority. |
| `active` | Current Canon authority. |
| `locked` | Stable Canon authority that should change only by replacement. |
| `superseded` | Replaced by newer Canon or moved out of Canon authority. |
| `archived` | Historical Canon record only. |

## Canon Ownership

Canon is owned by `documentation-governance`. Domain teams may propose Canon candidates, but Canon ownership remains centralized because Canon binds all lower layers.

## Canon Reading Order

For Canon questions, read:

1. [CANON_OVERVIEW.md](CANON_OVERVIEW.md)
2. [CANON_AUTHORITY_MODEL.md](CANON_AUTHORITY_MODEL.md)
3. [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md)
4. [CANON_REGISTRY.md](CANON_REGISTRY.md)
5. Any active or locked Canon document listed in the registry.
6. Candidate source documents only as evidence.

## Canon Registry Structure

The Canon registry must separate:

1. Current Canon documents.
2. Draft Canon documents.
3. Candidate Canon sources.
4. Rejected Canon candidates.
5. Superseded Canon documents.

No candidate is Canon until it appears as an active or locked Canon document in the registry.

## What Can Never Become Canon

The following must not become Canon:

1. Implementation details.
2. Technical shapes, field lists, or data layouts.
3. Feature specifications.
4. Audit findings before distillation.
5. Completion reports.
6. Temporary architecture decisions.
7. Roadmap status.
8. Maturity scores.
9. Runbook procedures.
10. Uploaded prompt files or pasted task instructions.

## Current Boundary

This foundation creates Canon structure, governance, authority, and candidate tracking. It does not promote any existing document into Canon.
