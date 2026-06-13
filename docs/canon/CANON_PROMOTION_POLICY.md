---
id: BT-CANON-PROMOTION-POLICY-001
title: "BookTown Canon Promotion Policy"
status: active
authority_level: canon
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Canon Promotion Policy

This policy defines how a document, doctrine, or distilled truth becomes Canon in BookTown.

## Purpose of Canon

Canon contains long-term platform truths that must remain stable across product phases, architecture migrations, and implementation details.

Canon promotion is intentionally strict because Canon documents become higher authority than Vision, Master, ADR, Architecture, Product, Governance, Operations, Audits, and Archive for durable product and platform truth.

## Canon vs Vision

Vision may describe desired future direction. Canon may contain only truths that should constrain future direction.

A Vision document can become a Canon candidate only after its content is distilled into stable principles that are independent of roadmap timing, launch sequence, and market strategy.

## Canon vs Architecture

Architecture may describe how BookTown is built. Canon may describe what BookTown must remain.

Architecture documents can provide candidate source material, but implementation details must be removed before Canon promotion.

## Canon vs Governance

Governance owns the promotion process. Canon owns the resulting durable truth.

Governance policy can define how Canon changes, but it cannot use process language to override active Canon product truth.

## Canon Promotion Rules

A Canon candidate may be promoted only when all conditions are true:

1. The candidate expresses long-term product or platform truth.
2. The candidate should remain valid for multiple years.
3. The candidate is independent of implementation details.
4. The candidate is independent of feature specifications.
5. The candidate is independent of audit findings and completion reports.
6. The candidate does not encode temporary architecture decisions.
7. The candidate does not duplicate an existing active Canon document.
8. The candidate has an owner.
9. The candidate has metadata using the required documentation standard.
10. The candidate is registered in [CANON_REGISTRY.md](CANON_REGISTRY.md).
11. Master routing is updated to point to the Canon document where relevant.

## Canon Demotion Rules

Canon demotion requires explicit documentation governance.

A Canon document must be demoted when:

1. It is no longer durable truth.
2. It conflicts with a newer active or locked Canon document.
3. It was promoted with implementation detail that belongs in Architecture.
4. It was promoted with product direction that belongs in Vision.
5. It was promoted with process rules that belong in Governance.
6. It was promoted with evidence that belongs in Audits.

Demotion must update metadata, registry status, and Master routing.

## Canon Authority Model

After promotion, a Canon document is authoritative above Vision, Master, ADR, Architecture, Product, Governance, Operations, Audits, and Archive for its declared scope.

Canon authority is scoped. A Canon document about product identity does not govern projection recovery procedure. A Canon document about canonical truth boundaries does not define API fields.

## Canon Lifecycle

Canon promotion follows this lifecycle:

1. Candidate source identified.
2. Candidate entered in [CANON_REGISTRY.md](CANON_REGISTRY.md).
3. Candidate reviewed for durability.
4. Candidate distilled into Canon-safe language.
5. Conflicts checked against active authority.
6. Canon document created as `draft`.
7. Governance approval changes status to `active` or `locked`.
8. Master routing updated.

## Canon Ownership

Canon ownership belongs to `documentation-governance`.

Candidate evidence may come from Architecture, Product, Master, Audits, Operations, or Vision, but approval and lifecycle ownership remain centralized.

## Canon Reading Order

Promotion reviewers must read:

1. [CANON_OVERVIEW.md](CANON_OVERVIEW.md)
2. [CANON_AUTHORITY_MODEL.md](CANON_AUTHORITY_MODEL.md)
3. This policy.
4. [CANON_REGISTRY.md](CANON_REGISTRY.md)
5. The candidate source document.
6. Relevant Master and Architecture routing documents.

## Canon Registry Structure

Every candidate must be tracked in [CANON_REGISTRY.md](CANON_REGISTRY.md) with:

1. Candidate name.
2. Source document.
3. Candidate type.
4. Current status.
5. Reason it may qualify.
6. Reasons it is not yet Canon.
7. Required distillation work.
8. Promotion decision.

## Candidate Evaluation Rule

No existing BookTown document is promoted by this policy. Existing documents listed in the registry are candidates only.
