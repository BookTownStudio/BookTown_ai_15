---
id: BT-CANON-AUTHORITY-MODEL-001
title: "BookTown Canon Authority Model"
status: active
authority_level: canon
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Canon Authority Model

This document defines Canon authority over all lower layers in the BookTown Documentation Operating System.

## Purpose of Canon

Canon protects durable product and platform truth from drift. It provides the top-level constraints that all lower authority layers must respect.

## Canon vs Vision

Vision is directional. Canon is constitutional.

Vision may say where BookTown is going. Canon says what BookTown must remain while getting there.

## Canon vs Architecture

Architecture turns product truth into system structure. Canon constrains architecture but does not specify implementation.

Architecture registers, ADRs, contracts, data models, runtime ownership, runbooks, and implementation plans must conform to Canon but remain responsible for technical detail.

## Canon vs Governance

Governance defines how Canon is managed. Canon defines what lower layers must preserve.

If governance process and Canon product truth appear to conflict, maintainers must resolve the process without weakening active Canon truth.

## Canon Promotion Rules

Promotion is governed by [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md). A source is not Canon until it is explicitly promoted, has Canon metadata, and is listed as active or locked in [CANON_REGISTRY.md](CANON_REGISTRY.md).

## Canon Demotion Rules

Canon demotion must preserve traceability. A demoted Canon document must:

1. Move to `superseded` or `archived`.
2. Set `source_of_truth: false` unless replaced by another Canon document that carries the truth forward.
3. Set `ai_read: false` unless historical Canon context remains important.
4. Declare `superseded_by` when replaced.
5. Update [CANON_REGISTRY.md](CANON_REGISTRY.md).
6. Update Master routing when affected.

## Canon Authority Model

Authority order:

```text
Canon -> Vision -> Master -> ADR -> Architecture -> Product -> Governance -> Operations -> Audits -> Archive
```

Canon governs only durable product and platform truth. Lower layers retain authority over their own scoped concerns:

| Layer | Lower-Layer Authority That Remains Outside Canon |
|---|---|
| Vision | Roadmap direction, strategic sequencing, market narrative. |
| Master | Routing, system map, maturity map, authority matrix. |
| ADR | Scoped technical decisions and decision history. |
| Architecture | Runtime design, contracts, registers, platform boundaries. |
| Product | UX behavior, surfaces, journeys, feature expectations. |
| Governance | Documentation and engineering process. |
| Operations | Runbooks, recovery, certification, monitoring. |
| Audits | Findings, evidence, risk assessment. |
| Archive | Historical retention. |

Canon constrains these layers but does not replace their operating detail.

## Canon Lifecycle

Canon authority requires:

1. `authority_level: canon`
2. `status: active` or `status: locked`
3. `source_of_truth: true`
4. `owner: documentation-governance`
5. Registry entry as current Canon
6. Master routing where applicable

Candidate documents without these properties are evidence, not Canon.

## Canon Ownership

Canon ownership is centralized under `documentation-governance` because Canon decisions affect every layer.

Domain owners may propose changes, but no domain owner may unilaterally promote, demote, or reinterpret Canon.

## Canon Reading Order

When resolving Canon authority:

1. Read [CANON_OVERVIEW.md](CANON_OVERVIEW.md).
2. Read this authority model.
3. Read [CANON_REGISTRY.md](CANON_REGISTRY.md).
4. Read active or locked Canon documents listed in the registry.
5. Read Master routing to understand lower-layer implications.
6. Read lower-layer source documents only when evaluating conflicts or candidates.

## Canon Registry Structure

The registry is the only place where Canon status is enumerated. A document is not current Canon unless [CANON_REGISTRY.md](CANON_REGISTRY.md) lists it as active or locked Canon.

## Conflict Handling

If a lower-layer document conflicts with Canon:

1. Do not reinterpret Canon silently.
2. Report the conflict.
3. Treat Canon as controlling for durable product/platform truth.
4. Update or supersede the lower-layer document through normal governance.
5. If Canon itself is wrong, initiate Canon demotion or replacement.
