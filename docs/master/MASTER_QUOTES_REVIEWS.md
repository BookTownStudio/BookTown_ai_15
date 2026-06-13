---
id: BT-MASTER-QUOTES-REVIEWS-001
title: "BookTown Quotes and Reviews Master Document"
status: active
authority_level: master
owner: quote-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Quotes and Reviews Master Document

## Purpose

This document is the Master Layer entry point for Quotes, Reviews, literary atoms, moderation, discovery, and attribution. It summarizes authority and routes to lower-level sources without replacing ontology, catalog, social, or operations authority.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Quotes.
- Saved quote surfaces.
- Quote details.
- Book reviews.
- Review aggregates.
- Quote and review projections.
- Attribution and literary atom boundaries.
- Moderation and reporting routing for user-generated quote/review content.

Out of scope:

- New quote ontology.
- New review policy.
- New moderation policy.
- New discovery ranking behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/quotes.ts`
- `functions/src/quotes/*`
- `functions/src/projections/quoteProjections.ts`
- `functions/src/projections/reviewProjections.ts`
- `functions/src/reviews/bookReviews.ts`
- `functions/src/admin/processQuotesDaily.ts`
- `functions/src/admin/recoverReviewProjections.ts`
- `functions/src/admin/recoverQuoteProjections.ts`
- `app/quote-details.tsx`
- `components/quote/QuoteCard.tsx`
- `components/features/quotes/*`
- `lib/hooks/useQuoteDetails.ts`
- `app/drawer/quotes.tsx`

Backend runtime owns quote persistence, import processing, review writes, projection fanout, aggregate repair, and moderation/reporting handoff. Client surfaces render quote/review state and request approved actions.

## Documentation Authority

Primary authority documents:

- [QUOTES_REVIEWS_AUTHORITY.md](../architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [BookReviewAuthorityMigration.md](../architecture/BookReviewAuthorityMigration.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)

Operational evidence:

- [QuoteProjectionRecoveryRunbook.md](../operations/projections/QuoteProjectionRecoveryRunbook.md)
- [ReviewProjectionRecoveryRunbook.md](../operations/projections/ReviewProjectionRecoveryRunbook.md)
- [LegacyUserReviewsProjectionDeprecationRunbook.md](../operations/projections/LegacyUserReviewsProjectionDeprecationRunbook.md)
- [REVIEW_STACK_SLO.md](../operations/REVIEW_STACK_SLO.md)

## System Architecture

Quotes and Reviews are literary expression systems. Quotes represent literary atoms tied to works, authors, context, attribution, and reader/social use. Reviews represent user-authored evaluative content tied to books and user identity.

The architecture separates:

- Canonical quote identity and attribution.
- Quote save/display surfaces.
- Review writes and aggregates.
- Projection fanout.
- Discovery/search consumption.
- Moderation and reporting handoff.

## Core Components

| Component | Role |
|---|---|
| Quote domain | Owns quote persistence and quote operations. |
| Quote projection | Produces display and fanout records. |
| Quote details | User-facing quote inspection surface. |
| Saved quotes | User quote collection surfaces. |
| Book reviews | User-authored book review authority. |
| Review projections | Aggregates and display-ready review data. |
| Review migration | Governs legacy review authority transitions. |
| Moderation/reporting | Routes user-generated content safety handling. |

## Data Authority

| Data | Authority |
|---|---|
| Quote text/attribution | Quote runtime plus ontology/catalog authority. |
| Work/author relation | Catalog / Library and Entity Platform. |
| Saved quote state | Quote/user runtime. |
| Review content | Review backend runtime. |
| Review aggregates | Review projection runtime. |
| Legacy user reviews | Deprecation/migration runbook. |
| Moderation/reporting state | Social/Feedback/Admin authority. |

## User-Facing Surfaces

- Quote details.
- Quote cards.
- Saved quote lists.
- Quote drawer.
- Book review surfaces.
- Profile review surfaces.
- Discovery/search quote surfaces where routed.
- Social/reporting surfaces for user-generated content.

## Operational Dependencies

- Catalog / Library.
- Entity Platform.
- Social / Messaging for reporting and moderation handoff.
- Projection / Recovery.
- Search/Discovery.
- Admin / Control Plane.

## Projection Dependencies

Quotes and Reviews depend on:

- `quote_projection`
- `review_projection`
- `legacy_user_reviews_projection_deprecation`
- `book_stats`
- `user_stats_domain`
- `search_feed`

## Governance Rules

- Quotes must not redefine canonical Work or Author truth.
- Reviews are user-generated content and require moderation/reporting routing.
- Legacy review data must remain governed by migration/deprecation authority.
- Quote and review projections are derived data.
- Attribution and literary atom semantics route through ontology and catalog authority.
- Audit evidence must not redefine quote/review authority without promotion.

## Current Maturity

Product maturity: Functional.

Architecture maturity: Implemented, with lower-level quote/review authority now routed.

Documentation maturity: Partial to Good after this Master document.

Readiness: Closed Beta Ready for constrained quote/review workflows.

## Known Gaps

- Review moderation policy requires clearer documentation.
- Legacy review migration should be explicitly superseded after completion.
- Quote discovery boundaries need stronger routing through Search/Discovery.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [QUOTES_REVIEWS_AUTHORITY.md](../architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md)
- [BookReviewAuthorityMigration.md](../architecture/BookReviewAuthorityMigration.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Quotes | Quote Platform | Quote domain and quote modules | Quote/review authority, ontology, Catalog, this Master doc. |
| Reviews | Review Platform | Review runtime and projections | Review migration and runbooks. |
| Attribution | Catalog Platform; Quote Platform | Quote/catalog runtime | Ontology and Work authority. |
| Moderation | Social/Feedback/Admin | Reporting and moderation runtime | Social/Admin masters. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Catalog / Library | Upstream | Quotes and reviews reference works/authors. |
| Entity Platform | Upstream | Quotes and reviews need entity references. |
| Social / Admin | Downstream | User content requires reporting and moderation. |
| Search / Discovery | Downstream | Quotes/reviews can appear in discovery. |
| Projection / Recovery | Downstream | Quote/review fanout and aggregates must recover. |

## Authority Routing

| Question | Route |
|---|---|
| Quote ontology | [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md). |
| Quote runtime behavior | [QUOTES_REVIEWS_AUTHORITY.md](../architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md), quote runtime, and quote runbook. |
| Review migration | [BookReviewAuthorityMigration.md](../architecture/BookReviewAuthorityMigration.md). |
| Review SLO and load gate | [REVIEW_STACK_SLO.md](../operations/REVIEW_STACK_SLO.md). |
| Moderation/reporting | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md). |
| Quote/review recovery | Quote/review runbooks and [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md). |

## Future Evolution

Future quote and review changes should be documented in quote/review architecture authority or dedicated attribution/moderation authority documents and then reflected here as routing updates. This Master document must not introduce new quote or review behavior directly.
