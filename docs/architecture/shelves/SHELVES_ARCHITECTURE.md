---
id: BT-ARCH-SHELVES-ARCHITECTURE-001
title: "Shelves Architecture Authority"
status: active
authority_level: architecture
owner: library-ux
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Shelves Architecture Authority

## Purpose

This document is the lower-level architecture authority for BookTown Shelves. It summarizes current shelf authority, reading continuity relationships, `shelf_books` authority, shelf lifecycle, and known gaps without changing runtime behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/shelves/*`
- `lib/actions/shelfActions.ts`
- `lib/shelves/systemShelves.ts`
- `lib/hooks/useShelfDetails.ts`
- `app/shelf-details.tsx`

## Documentation Authority

Primary routing starts at [MASTER_SHELVES.md](../../master/MASTER_SHELVES.md), then this document. Projection recovery routes through [ShelfDisplayProjectionRecoveryRunbook.md](../../operations/projections/ShelfDisplayProjectionRecoveryRunbook.md) and [UserLibraryRecoveryRunbook.md](../../operations/projections/UserLibraryRecoveryRunbook.md).

## Shelf Authority

Shelves organize a user's relationship to catalog items. They do not own book, edition, reader progress, or search truth.

| Data | Authority |
|---|---|
| Shelf metadata | Shelf backend runtime. |
| Shelf membership | `shelf_books` and shelf backend runtime. |
| System shelf invariants | Shelf backend runtime. |
| Book truth | Catalog / Library. |
| Reading progress | Reader. |
| Display projections | Projection system, derived from shelf authority. |

## Reading Continuity Relationship

Shelves can influence library organization and return-to-reading surfaces, but Reader authority owns progress, sessions, manifests, offline state, and access. Shelf state may help choose or display continuity entry points only as a consumer signal.

## Shelf Lifecycle

The current lifecycle is runtime-owned:

1. Create or identify shelf.
2. Add, remove, move, or duplicate membership.
3. Maintain system shelf invariants.
4. Project display/user-library state.
5. Recover derived records through projection runbooks.

## Governance Rules

- Client shelf state is never durable authority.
- `shelf_books` is the durable membership authority.
- Shelf projections are derived and recoverable.
- Catalog truth must be fetched from Catalog / Library.
- Public or shared shelf exposure must route through Social/Public Web authority.

## Known Gaps

- Shared/public shelf exposure boundaries need stronger documentation.
- User library projection relationships need continued consolidation as surfaces expand.
- Social shelf behavior remains downstream of social/public authority.
