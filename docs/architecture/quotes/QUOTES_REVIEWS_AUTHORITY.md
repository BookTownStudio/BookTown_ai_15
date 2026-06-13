---
id: BT-ARCH-QUOTES-REVIEWS-AUTHORITY-001
title: "Quotes and Reviews Architecture Authority"
status: active
authority_level: architecture
owner: quote-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Quotes and Reviews Architecture Authority

## Purpose

This document is the lower-level architecture authority for Quotes and Reviews. It routes Quote identity, Review identity, projection authority, moderation boundaries, Book/Author integration, public/private quote boundaries, and current known gaps without creating new product behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/quotes.ts`
- `functions/src/quotes/*`
- `functions/src/reviews/bookReviews.ts`
- `functions/src/projections/quoteProjections.ts`
- `functions/src/projections/reviewProjections.ts`
- Quote, review, and profile client surfaces.

## Documentation Authority

Primary routing starts at [MASTER_QUOTES_REVIEWS.md](../../master/MASTER_QUOTES_REVIEWS.md), then this document. Ontology and Work/Author truth route through Catalog and Entity Platform authority.

## Identity Authority

| Entity | Authority |
|---|---|
| Quote identity | Quote runtime plus ontology/catalog attribution authority. |
| Review identity | Review backend runtime and review projection/migration authority. |
| Work relationship | Catalog / Library. |
| Author relationship | Author System and Catalog / Entity Platform. |
| Saved quote state | Quote/user runtime. |
| Review aggregate state | Review projections. |

## Projection Authority

Quote and review projections are derived, recoverable records. Projection status and recovery route through [MASTER_PROJECTION_RECOVERY.md](../../master/MASTER_PROJECTION_RECOVERY.md), [QuoteProjectionRecoveryRunbook.md](../../operations/projections/QuoteProjectionRecoveryRunbook.md), and [ReviewProjectionRecoveryRunbook.md](../../operations/projections/ReviewProjectionRecoveryRunbook.md).

## Moderation Boundaries

Reviews and user-submitted quote context are user-generated content. Reporting and moderation route through [MASTER_FEEDBACK_REPORTING.md](../../master/MASTER_FEEDBACK_REPORTING.md), [MASTER_SOCIAL_MESSAGING.md](../../master/MASTER_SOCIAL_MESSAGING.md), and [MASTER_ADMIN_OPERATIONS.md](../../master/MASTER_ADMIN_OPERATIONS.md).

## Public And Private Boundaries

Private saved quote state belongs to the user/quote runtime. Public quote or review exposure must route through Quotes/Reviews, Public Web, and the owning Work/Author authority. Public exposure must not imply canonical truth beyond routed product authority.

## Governance Rules

- Quotes do not redefine Work or Author authority.
- Reviews are user-generated content and require reporting/moderation routing.
- Projections are derived and recoverable.
- Public exposure requires owning-domain authority.
- Audit evidence does not change quote/review behavior unless promoted through Master or Architecture routing.

## Known Gaps

- Quote attribution lifecycle needs continued consolidation.
- Review moderation policy remains cross-domain.
- Quote discovery/public exposure needs tighter Search/Public Web routing before broad launch.
