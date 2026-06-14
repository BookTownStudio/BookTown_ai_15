---
id: BT-PROJECT-SOURCES-PERMANENT-CONTEXT-V2
title: "BookTown Permanent Context v2"
status: active
authority_level: project_sources
owner: documentation-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Permanent Context v2

## Authority Scope

This document is the long-term context authority for future BookTown conversations. It contains stable project truths and non-volatile doctrine. It should be preferred over legacy permanent context files.

## Stable Product Truths

- BookTown is a Literary Intelligence Platform.
- BookTown is not a bookstore, reading tracker, generic social app, search-only app, or recommendation wrapper.
- Literature, readers, writers, ideas, and relationships are first-class product concerns.
- Product systems must preserve authority boundaries.
- Meaningful discovery is more important than engagement maximization.

## Stable Architecture Truths

- WEM is foundational: Work, Edition, and Manifestation are separate authority concepts.
- Author Authority is foundational: Author identity is not a user profile, provider row, display name, or search result.
- Entity Platform is foundational: entity refs and lifecycle routing are shared doctrine, not domain truth replacement.
- Meaning Unit Authority is foundational: Theme and Concept are canonical meaning types after acceptance.
- Literary Graph is foundational: Graph owns relationships, not node identity.
- Search consumes authority and owns projections, ranking, and retrieval behavior.
- MatchMaker consumes authority and produces derived intelligence.
- Public Web exposes approved projections.
- Provider, AI, user, search, and product signals are evidence unless accepted by the owning authority.

## Stable Data Truths

- Authority and projection must be separated.
- `books` may remain operational, but Work authority is the doctrine.
- Editions are not Manifestations.
- Manifestations own access, rendering, readability, and acquisition truth.
- Quotes are not Meaning Units.
- Reviews, shelves, clicks, searches, and recommendation outputs do not create literary truth.
- Search documents, DTOs, cards, feeds, public pages, and summaries are projections.

## Stable Entity Truths

Canonical or authority-backed entity classes include Work, Edition, Author, Quote, Publication, Theme, and Concept. Manifestation is a WEM authority object. Movement and Period are emerging context entities. Place, Character, Archetype, and similar objects are deferred unless later promoted by doctrine.

User, Shelf, Search Query, Recommendation Result, UI Card, Public Page, DTO, Provider Row, AI Label, Topic, and Keyword are not canonical literary entities.

Shelves may appear as search/product result entities or user-library product objects where governed by Search and product doctrine. Under Entity Platform v1, shelves are not canonical literary entities, are not `LiteraryEntityRef` canonical targets, and are not Literary Graph nodes. Shelf membership may provide user/product evidence, but it does not create canonical literary relationship truth.

## Stable Graph Truths

Eligible graph nodes must resolve through Entity Platform or governed ontology context. Canonical graph edges require evidence and Graph authority acceptance.

Influence, response, lineage, accepted memberships, accepted theme/concept relationships, and accepted historical relationships may become canonical graph edges. Same-form, similarity, search co-click, shelf co-membership, recommendation adjacency, user preference, provider tags, and AI suggestions are derived or evidence only.

## Stable Execution Truths

- Doctrine precedes schema.
- Schema authority precedes implementation.
- Runtime conformance must be audited separately.
- UX exposure follows authority and projection readiness.
- Broad public exposure requires stricter public web, moderation, privacy, and projection safety.

## Retrieval Rules For Future Conversations

1. Start with [Authority Index](AUTHORITY_INDEX.md).
2. Use Product Constitution for product identity questions.
3. Use Architecture Canon for ownership and foundational doctrine.
4. Use Schema Canon for authority/projection data questions.
5. Use Product Experience Canon for UX surface boundaries.
6. Use Execution Canon for sequencing and readiness.
7. Use locked foundation docs when a source-level decision is needed.

## Cross-References

- [Authority Index](AUTHORITY_INDEX.md)
- [Product Constitution](01_BOOKTOWN_PRODUCT_CONSTITUTION_V2.md)
- [Architecture Canon](02_BOOKTOWN_ARCHITECTURE_CANON_V2.md)
- [Schema Canon](03_BOOKTOWN_SCHEMA_CANON_V2.md)
- [Execution Canon](05_BOOKTOWN_EXECUTION_CANON_V2.md)
