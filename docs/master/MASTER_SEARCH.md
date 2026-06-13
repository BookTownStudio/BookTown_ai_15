---
id: BT-MASTER-SEARCH-001
title: "BookTown Search Master Document"
status: active
authority_level: master
owner: search-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Search Master Document

## Purpose

This document is the Master Layer entry point for BookTown Search. It consolidates existing search authority, runtime evidence, operations coverage, and known gaps without creating new architecture.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Search architecture.
- Search projections.
- Search ranking and normalization.
- Search authority model.
- Work-first search philosophy.
- Search UX surfaces.
- Search dependencies.

Out of scope:

- New ranking rules.
- New query classifiers.
- New search product behavior.
- New ADRs.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/library/search/*`
- `functions/src/search/normalization.ts`
- `functions/src/domains/library.ts`
- `functions/src/triggers/searchTriggers.ts`
- `contracts/bookSearch.ts`
- `contracts/apiContracts.ts`
- `lib/hooks/useUnifiedBookSearch.ts`
- `components/content/SearchResultCard.tsx`

The backend owns query handling, canonical result composition, search fields, search indexing, and projection repair. The client owns query input, UI state, filters, and result rendering.

## Documentation Authority

Primary authority documents:

- [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md)
- [BOOK_SEARCH_QUALITY_STANDARD.md](../architecture/BOOK_SEARCH_QUALITY_STANDARD.md)
- [search-quality-report.md](../search-quality-report.md)

Audit evidence:

- [search_audit.md](../audits/evidence/audit/search_audit.md)
- [T2_search_book_authority_stabilization_execution.md](../audits/evidence/audit/T2_search_book_authority_stabilization_execution.md)

Operational evidence:

- [SearchFeedRecoveryRunbook.md](../operations/projections/SearchFeedRecoveryRunbook.md)
- [SearchBookmarksRecoveryRunbook.md](../operations/projections/SearchBookmarksRecoveryRunbook.md)
- [SearchNotificationsRecoveryRunbook.md](../operations/projections/SearchNotificationsRecoveryRunbook.md)
- [BookSearchFieldsRecoveryRunbook.md](../operations/projections/BookSearchFieldsRecoveryRunbook.md)

## System Architecture

Search is a product and intelligence system. It is governed as a work-centric search architecture. Search results represent literary Works and expose availability summaries. Editions remain subordinate and are accessed through detail, reader, acquisition, and edition-specific flows.

Search architecture separates:

- Query input and UI filtering.
- Search request contracts.
- Backend normalization and tokenization.
- Canonical work identity and result composition.
- Search projections and search-optimized fields.
- Search UX rendering.
- Audit evidence and quality reports.

## Core Components

| Component | Role |
|---|---|
| Search contracts | Define request/response shapes and surface parity. |
| Normalization | Canonical query and field normalization. |
| Search engine | Produces ranked results from canonical and provider-backed evidence. |
| Search projections | Denormalized search fields and feed/search support. |
| Search result UI | Renders work-centric results and navigation affordances. |
| Search quality report | Records quality expectations and evaluated cases. |
| Search architecture register | Tracks discoveries, proposals, and locked ADRs. |

## Data Authority

| Data | Authority |
|---|---|
| Canonical Work identity | Catalog/book authority, not Search. |
| Search ranking and result composition | Search backend/contracts. |
| Search fields | Certified projection/recovery system. |
| Search UI state | Client search components and hooks. |
| External provider evidence | Non-authoritative input unless accepted by catalog authority. |

## User-Facing Surfaces

- Search bars and modal search.
- Home search.
- Discovery search.
- Book details navigation from search.
- Search result cards.
- Social/search-related surfaces where routed through search projections.

## Operational Dependencies

- Catalog authority and canonical book records.
- Author identity and provider mappings.
- Search fields and projections.
- Firestore indexes.
- Shared contracts.
- Search tests and quality reports.
- Projection recovery runbooks.

## Projection Dependencies

Search depends on these projection families:

- `book_search_fields`
- `search_feed`
- `search_bookmarks`
- `search_notifications`
- `catalog_identity_projection`
- `reader_authority_projection`
- `book_catalog_counter_projection`

## Governance Rules

- Search must not become canonical catalog authority.
- Search results are work-centric according to the search architecture register.
- Proposals under discussion in the search register are not locked authority.
- Search audit files are evidence, not operating authority.
- External provider records must not overwrite canonical truth through search.
- Search projections must be recoverable through Phase 8A recovery controls.

## Current Maturity

Product maturity: First-Class.

Architecture maturity: Locked.

Documentation maturity: Authority Complete.

Intelligence maturity: Operational.

Readiness: Public Beta Ready for search-specific surfaces, subject to whole-product beta posture.

## Known Gaps

- Search register still contains open questions and under-discussion proposals.
- A dedicated Search master document now exists, but future updates must continue routing to the register for authority.
- Search depends on catalog authority quality, author identity, and projection correctness.
- Public beta readiness for search does not imply public beta readiness for every downstream surface.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md)
- [BOOK_SEARCH_QUALITY_STANDARD.md](../architecture/BOOK_SEARCH_QUALITY_STANDARD.md)
- [search-quality-report.md](../search-quality-report.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future search changes should be recorded in the Search architecture register or an approved ADR, then reflected here as routing updates. This Master document must not introduce ranking or behavior changes directly.
