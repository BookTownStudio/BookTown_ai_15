---
id: BT-MASTER-SHELVES-001
title: "BookTown Shelves Master Document"
status: active
authority_level: master
owner: library-ux
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Shelves Master Document

## Purpose

This document is the Master Layer entry point for shelf architecture, shelf authority, reading organization, and shelf lifecycle. It summarizes authority and routes to lower-level runtime and operational sources without creating new shelf behavior.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Shelf membership.
- User library organization.
- System shelves.
- Shelf details.
- Shelf display projections.
- Reading organization surfaces.
- Shelf lifecycle and movement operations.

Out of scope:

- New shelf taxonomy.
- New social shelf behavior.
- New library product commitments.
- New projection procedures.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/shelves/*`
- `lib/actions/shelfActions.ts`
- `lib/shelves/systemShelves.ts`
- `lib/hooks/useShelfDetails.ts`
- `app/shelf-details.tsx`
- `components/shelf/ShelfChip.tsx`

Backend shelf runtime owns shelf creation, mutation, membership, move, duplicate, removal, and membership lookup authority. Client surfaces request shelf actions and render shelf state.

## Documentation Authority

Primary authority currently comes from runtime and operations routing:

- [ShelfDisplayProjectionRecoveryRunbook.md](../operations/projections/ShelfDisplayProjectionRecoveryRunbook.md)
- [UserLibraryRecoveryRunbook.md](../operations/projections/UserLibraryRecoveryRunbook.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_READER.md](MASTER_READER.md)

Related evidence:

- [T5_shelf_profile_authority_stabilization_execution.md](../audits/evidence/audit/T5_shelf_profile_authority_stabilization_execution.md)

## System Architecture

Shelves are BookTown's user-controlled reading organization system. They connect user intent to catalog items without becoming catalog authority or reader progress authority.

The architecture separates:

- Shelf metadata.
- Shelf membership.
- System shelf invariants.
- Book membership lookup.
- Shelf display projections.
- User library projections.
- Reader and catalog consumption.

## Core Components

| Component | Role |
|---|---|
| Shelf management | Creates and updates shelf containers. |
| Shelf membership | Adds, removes, moves, and lists books in shelves. |
| System shelves | Maintains governed built-in shelf behavior. |
| Book shelf membership | Determines whether a book belongs to shelves. |
| Shelf details | Displays shelf metadata and entries. |
| Shelf display projection | Supports display-ready shelf state. |
| User library projection | Supports library and reading organization views. |

## Data Authority

| Data | Authority |
|---|---|
| Shelf metadata | Shelf backend runtime. |
| Shelf membership | `shelf_books` and shelf backend runtime. |
| System shelf invariants | Shelf backend runtime. |
| Book catalog truth | Catalog / Library, not shelves. |
| Reading progress | Reader, not shelves. |
| Shelf display state | Projection system, derived from shelf authority. |
| Client shelf UI state | Client only. |

## User-Facing Surfaces

- Shelf details.
- Shelf chips.
- Book shelf actions.
- Library organization surfaces.
- Reader/library continuity surfaces.
- Profile or social shelf displays where routed.

## Operational Dependencies

- Catalog / Library.
- Reader.
- User/profile authority.
- Projection / Recovery.
- Search/discovery consumers.
- Social or public display surfaces where shelves are shared.

## Projection Dependencies

Shelves depend on:

- `shelf_display_projection`
- `user_library_books`
- `reader_authority_projection`
- `projected_viewer_state`
- `user_stats_domain`

## Governance Rules

- Shelf membership is user/library authority, not catalog authority.
- Client shelf state is not durable authority.
- System shelves must preserve governed invariants.
- Shelf projections must remain derived and recoverable.
- Shelf audit files are evidence only.
- Shared/public shelf behavior must route through social/public authority where applicable.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented, with dedicated architecture authority still missing.

Documentation maturity: Partial to Good after this Master document.

Readiness: Closed Beta Ready.

## Known Gaps

- Dedicated shelf architecture authority is still needed.
- Shared/public shelf boundaries require clearer routing.
- Shelf lifecycle rules should be consolidated outside runbooks.
- Shelf relationships to user library, profile, and discovery need stronger documentation.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_READER.md](MASTER_READER.md)
- [ShelfDisplayProjectionRecoveryRunbook.md](../operations/projections/ShelfDisplayProjectionRecoveryRunbook.md)
- [UserLibraryRecoveryRunbook.md](../operations/projections/UserLibraryRecoveryRunbook.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Shelves | Library UX | Shelf backend runtime | This Master doc and shelf runbooks. |
| Shelf membership | Library UX | `shelf_books` and shelf operations | Runtime authority and projection runbooks. |
| User library | Library UX; Reader Platform | User library projections and reader/catalog inputs | User library runbook and Reader/Catalog masters. |
| System shelves | Library UX | System shelf runtime | Runtime authority until dedicated architecture exists. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Catalog / Library | Upstream | Shelves organize catalog items. |
| Reader | Upstream and downstream | Shelves interact with reading continuity. |
| Projection / Recovery | Downstream | Shelf display and user library projections must recover. |
| Social/Public Web | Downstream | Shared shelf surfaces depend on public/social routing. |

## Authority Routing

| Question | Route |
|---|---|
| Shelf membership authority | This document and shelf runtime. |
| Shelf display recovery | [ShelfDisplayProjectionRecoveryRunbook.md](../operations/projections/ShelfDisplayProjectionRecoveryRunbook.md). |
| User library recovery | [UserLibraryRecoveryRunbook.md](../operations/projections/UserLibraryRecoveryRunbook.md). |
| Book truth on shelves | [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md). |
| Reading continuity | [MASTER_READER.md](MASTER_READER.md). |

## Future Evolution

Future shelf changes should be documented in dedicated shelf architecture authority and reflected here as routing updates. This Master document must not introduce new shelf behavior directly.
