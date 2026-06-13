---
id: BT-MASTER-ENTITY-PLATFORM-001
title: "BookTown Literary Entity Platform Master Document"
status: active
authority_level: master
owner: entity-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Literary Entity Platform Master Document

## Purpose

This document is the Master Layer entry point for the BookTown Literary Entity Platform. It consolidates existing entity architecture, lifecycle, authority, summaries, references, canonical entity types, and roadmap context without creating new architecture.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Entity architecture.
- Entity lifecycle.
- Entity authority.
- Entity summaries.
- Entity references.
- Canonical entity types.
- Entity relationship to graph and MatchMaker systems.
- Future entity roadmap routing.

Out of scope:

- New entity types.
- New entity lifecycle states.
- New graph or MatchMaker behavior.
- New contract fields.

## Runtime Authority

Runtime authority currently lives in:

- `contracts/entityPlatform/*`
- `functions/src/contracts/shared/entityPlatform/*`
- `lib/domain/entityPlatform/*`
- `types/entityPlatformCompatibility.ts`
- Entity adapters used by search, reader, author recommendations, graph, and MatchMaker.

Contracts define entity references, summaries, authority states, lifecycle states, graph references, user interactions, and MatchMaker-compatible entity inputs/outputs.

## Documentation Authority

Primary authority documents:

- [ENTITY_PLATFORM_VISION.md](../architecture/entity-platform/ENTITY_PLATFORM_VISION.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)
- [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [LITERARY_ENTITY_ROADMAP.md](../architecture/LITERARY_ENTITY_ROADMAP.md)

Related graph and intelligence documents:

- [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md)
- [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md)

## System Architecture

The Literary Entity Platform is BookTown's common identity and reference layer for literary objects. It defines what can be referenced across product systems and how authority state must travel with those references.

The platform separates:

- Entity identity.
- Entity authority state.
- Entity summaries for display.
- Graph participation.
- User interactions with entities.
- Derived intelligence outputs consuming entity refs.

## Core Components

| Component | Role |
|---|---|
| `LiteraryEntityType` | Closed vocabulary for entity categories. |
| `LiteraryEntityRef` | Cross-system reference to a literary entity. |
| `EntitySummary` | Display-safe summary for product surfaces. |
| Entity authority state | Candidate, resolved, canonical, enriched, deprecated, merged, archived, unresolved. |
| Entity lifecycle | Candidate to resolved to canonicalized and surfaced states. |
| User interaction contracts | User actions over literary entities. |
| Graph entity contracts | Graph-compatible entity references. |
| MatchMaker contracts | Derived intelligence inputs and outputs. |

## Data Authority

| Entity | Current Authority |
|---|---|
| Work | Catalog/books authority under Work Authority Source Law. |
| Edition | Edition/readability authority under catalog and reader boundaries. |
| Author | Author identity and provider identity mappings. |
| Quote | Quote authority and quote identity. |
| Publication | Publishing bridge and longform publication authority. |
| Theme | Target entity; not fully materialized as first-class authority. |
| Concept | Target entity; not fully materialized as first-class authority. |
| Movement | Emerging ontology-backed entity. |
| Period | Emerging ontology-backed entity. |
| Place | Product venue/space exists; literary-place authority remains unresolved. |

## User-Facing Surfaces

Entity Platform is consumed by:

- Search results.
- Book details.
- Author details.
- Quote details.
- Reader surfaces.
- Social/entity attachments.
- Messaging/entity attachments.
- Discovery and recommendation modules.
- MatchMaker and future literary intelligence surfaces.

## Operational Dependencies

- Shared contracts.
- Catalog authority.
- Search and reader adapters.
- Literary Graph architecture.
- MatchMaker contracts.
- Author recommendation adapters.
- Projection recovery for catalog, search, reader, and social surfaces.

## Projection Dependencies

Entity Platform is not itself a projection family, but it depends on projections that materialize entity-facing views:

- `catalog_identity_projection`
- `authored_author_link_projection`
- `book_search_fields`
- `reader_authority_projection`
- `social_post_render_projection`
- quote/review fanout projections where entity summaries appear.

## Governance Rules

- User identity is intentionally excluded from `LiteraryEntityRef`; user interaction connects users to literary entities.
- Entity refs must include entity type before entity ID interpretation.
- Derived intelligence must not mutate canonical entity truth.
- Manifestations must reference canonical entities and must not redefine them.
- Entity Platform contracts are shared boundary contracts and should not be bypassed by local duplicate shapes.

## Current Maturity

Product maturity: Emerging as a full product platform.

Architecture maturity: Implemented.

Documentation maturity: Authority Complete.

Readiness: Internal Ready.

## Known Gaps

- Theme, Concept, Movement, Period, and Place are not all equally mature.
- Literary Graph and MatchMaker product surfacing remain emerging.
- Entity Platform is implemented as contracts and architecture before becoming a fully visible product layer.
- A future canon or vision layer may promote durable entity principles, but that is not created here.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [ENTITY_PLATFORM_VISION.md](../architecture/entity-platform/ENTITY_PLATFORM_VISION.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)
- [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md)
- [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md)
- [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md)

## Future Evolution

Future entity evolution should update entity authority documents and contracts first, then update this Master document as an index. This file must not introduce new entity types, authority states, or lifecycle behavior directly.
