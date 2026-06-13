---
id: BT-MASTER-CATALOG-LIBRARY-001
title: "BookTown Catalog and Library Master Document"
status: active
authority_level: master
owner: catalog-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Catalog and Library Master Document

## Purpose

This document is the Master Layer entry point for BookTown Catalog and Library. It consolidates existing catalog, book, author, edition, canonicalization, ingestion, and library authority without creating new architecture.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Works.
- Editions.
- Authors.
- Catalog ingestion.
- Canonicalization.
- Library authority.
- Book details ecosystem.
- Catalog relationships.
- Provider authority roles.
- User upload and external acquisition boundaries.

Out of scope:

- New catalog schemas.
- New provider authority rankings.
- New ingestion behavior.
- New library product behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/library.ts`
- `functions/src/library/ingestBook.ts`
- `functions/src/library/ingestAuthor.ts`
- `functions/src/library/materializeBookAuthority.ts`
- `functions/src/library/providerRoleRegistry.ts`
- `functions/src/library/authorityAuthorLock.ts`
- `functions/src/library/persistence/*`
- `functions/src/library/ontology/*`
- `services/firebaseDbService.ts`
- `app/book-details.tsx`
- `app/author-details.tsx`

The backend owns canonical ingestion, materialization, provider role enforcement, author identity, edition/readability evidence, and upload finalization. The client requests catalog actions and displays catalog views.

## Documentation Authority

Primary authority documents:

- [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [data-pipeline.md](../data-pipeline.md)
- [PHASE_1_CONTRACTS.md](../architecture/PHASE_1_CONTRACTS.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)

Audit evidence:

- [canonical_authority_audit.md](../audits/evidence/audit/canonical_authority_audit.md)
- [canonical_tradition_mapping_audit.md](../audits/evidence/audit/canonical_tradition_mapping_audit.md)
- [type_integrity_architecture_audit.md](../audits/evidence/audit/type_integrity_architecture_audit.md)

## System Architecture

Catalog and Library provide BookTown's canonical literary foundation. Catalog owns canonical work, edition, author, provider evidence, ingestion, and materialization workflows. Library-facing features consume catalog authority but must not redefine it.

The architecture separates:

- Work as canonical intellectual entity.
- Edition as concrete material manifestation.
- Author as canonical creator identity.
- Quote as canonical literary atom.
- Manifestations such as shelf items, reviews, bookmarks, posts, and DM attachments.
- Provider evidence from BookTown-accepted authority.

## Core Components

| Component | Role |
|---|---|
| Work authority | Determines canonical Work truth. |
| Edition layer | Holds material publishing evidence and readable manifestations. |
| Author authority | Establishes creator identity and author mappings. |
| Provider role registry | Declares provider authority role and allowed influence. |
| Canonicalization | Resolves and protects canonical identity. |
| Book ingestion | Converts external/user input into governed catalog records. |
| User uploads | Handles user-owned readable source files and metadata jobs. |
| Book details | Primary inspection surface for catalog entities. |
| Library membership | Consumes catalog records through shelf and reading systems. |

## Data Authority

| Data | Authority |
|---|---|
| Work identity | BookTown catalog authority under Work Authority Source Law. |
| Edition evidence | Edition/readability authority under catalog and reader boundaries. |
| Author identity | Author authority and provider identity mappings. |
| Provider data | Evidence only unless accepted through provider role rules. |
| Shelf membership | `shelf_books`, not catalog. |
| Reading progress | Reader system, not catalog. |
| Search ranking | Search system, not catalog. |
| Book details display | Catalog DTOs and client rendering. |

## User-Facing Surfaces

- `app/book-details.tsx`
- `app/author-details.tsx`
- `components/content/BookCard.tsx`
- `components/content/SearchResultCard.tsx`
- `components/books/OtherEditionsSheet.tsx`
- `components/modals/AddBookModal.tsx`
- Library and shelf surfaces consuming catalog records.

## Operational Dependencies

- Provider role registry.
- Firestore safety controls.
- Backfill and repair scripts.
- Search indexing.
- Reader authority projection.
- Cover processing.
- User upload processing jobs.
- Projection recovery for catalog identity and search fields.

## Projection Dependencies

Catalog and Library depend on:

- `catalog_identity_projection`
- `book_search_fields`
- `book_catalog_counter_projection`
- `reader_authority_projection`
- `cover_derivatives`
- `authored_author_link_projection`
- `user_library_books`
- `shelf_display_projection`

## Governance Rules

- BookTown is final authority for canonical Work truth.
- External providers propose or enrich; they do not silently overwrite canonical truth.
- Universal author lock must gate hard identity reuse or merge.
- Manifestations reference canonical entities; they do not redefine canonical truth.
- Search, Reader, Shelves, and Social consume catalog authority but do not own it.
- Broad catalog maintenance must follow Firestore safety and bounded execution rules.

## Current Maturity

Product maturity: Operational, with Books classified as First-Class.

Architecture maturity: Validated.

Documentation maturity: Good.

Readiness: Closed Beta Ready for constrained catalog/library flows.

## Known Gaps

- Catalog authority is distributed across ontology, work law, audits, and runtime evidence.
- Dedicated provider authority and canonical book field matrix should be consolidated in future docs.
- Some audit findings identify historical authority risks and type drift.
- Shelves and user library authority are adjacent but require separate master routing.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md)
- [data-pipeline.md](../data-pipeline.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future catalog evolution should update the appropriate authority document first, then route the change through this Master document. This document should remain an index and consolidation layer, not a source of new catalog behavior.
