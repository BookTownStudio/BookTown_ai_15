# Entity Graph

Status: Architecture Definition  
Mode: Read Only  
Governing Roadmap: `docs/architecture/LITERARY_ENTITY_ROADMAP.md`

## Purpose

The Entity Graph defines how literary entities relate to one another across BookTown.

This document separates:

- implemented relationships
- partially implemented relationships
- future architecture

It does not implement graph storage, traversal, indexes, or product UI.

## Current Graph Foundation

Current implementation evidence supports these graph foundations:

- Work ontology on canonical book records.
- Semantic references from books to tradition, movement, philosophy, civilization, and historical period.
- Literary relationship types with supported entity types including book, author, movement, tradition, philosophy, and historical period.
- A surfaced book semantic graph that currently hydrates related works.

Current product graph behavior remains primarily Work-centered.

## Supported Entity Relationship Types

### Implemented Or Partially Implemented

| Relationship | Status | Notes |
|---|---|---|
| Work -> Author | Implemented | Work/book records carry author identity fields. Bibliography is still not a full author-work projection. |
| Work -> Edition | Implemented | Editions belong to works through `bookId` and `workId` where available. |
| Work -> Quote | Implemented | Quotes can carry `bookId`. |
| Author -> Quote | Implemented | Quotes can carry `authorId`. |
| Work -> Work | Partially implemented | Explicit literary relationships and derived same tradition/form/subform/movement related works exist. |
| Work -> Movement | Partially implemented | Semantic refs support movement IDs. Product traversal is work-related. |
| Work -> Period | Partially implemented | Historical period refs exist; product traversal is limited. |
| Work -> Tradition | Partially implemented | Ontology and semantic collection behavior exist. |
| Place -> Work / Author | Partially implemented | Spaces/venues can maintain relationship refs to books/authors. This is product-space architecture, not a unified literary place graph. |
| Publication -> Work | Partially implemented | Publishing bridge can connect published outputs to canonical books. |
| Publication -> Author | Partially implemented | Native author materialization exists, but publication reader navigation still commonly uses user profile ownership. |

### Future Architecture

| Relationship | Target Semantics |
|---|---|
| Author -> Author | Influence, contemporaneity, response, lineage, shared movement. |
| Author -> Theme | Recurring author-level concerns. |
| Author -> Concept | Intellectual concepts associated with an author. |
| Author -> Movement | Authorship membership or affiliation. |
| Author -> Period | Historical and literary period context. |
| Author -> Place | Birth, residence, exile, setting, cultural origin, institutional relation. |
| Quote -> Theme | Semantic theme expressed by a quote. |
| Quote -> Concept | Concept expressed or invoked by a quote. |
| Theme -> Concept | Conceptual decomposition and semantic adjacency. |
| Movement -> Period | Temporal and historical contextualization. |
| Place -> Period | Spatial-historical contextualization. |
| User -> Entity | Canonical interaction edge in the Literary Identity Graph. |

## Relationship Ownership

Entity identity and relationship truth must be separate.

### Entity Authority Owns

- canonical ID
- stable identity fields
- aliases and multilingual labels where governed
- provider identity evidence

### Relationship Authority Owns

- source entity reference
- target entity reference
- relationship type
- direction
- confidence
- source/provenance
- lifecycle status

No relationship may rewrite entity identity.

## Graph Participation Rules

1. An entity may participate in the graph only through a canonical or governed entity reference.
2. Display strings are not graph edges.
3. Embedded metadata may suggest relationships but cannot be graph authority by itself.
4. Derived relationships must be distinguishable from explicit editorial or seeded relationships.
5. User interactions belong to the Literary Identity Graph, not the Literary Knowledge Graph.
6. MatchMaker may consume graph relationships but must not author canonical graph truth.

## Traversal Principles

Traversal must be:

- bounded
- typed
- provenance-aware
- direction-aware where the relationship type is directional
- safe for multilingual and alias-rich identities
- explicit about whether an edge is canonical, derived, editorial, seeded, or inferred

Traversal must not:

- collapse different entity types into text labels
- use fuzzy-only identity matches for canonical graph edges
- treat recommendation output as graph truth
- allow provider metadata to overwrite canonical identity

## Current Product Traversal

Current traversal is strongest for:

- Work -> related Works
- Work -> ontology grouping
- Work -> Author through book data
- Author -> Works through direct/fallback bibliography
- Social attachment -> structured entity

Current traversal is weak or missing for:

- Author graph
- Quote graph
- Theme graph
- Concept graph
- Movement and Period product pages
- Place as literary graph node
- User-to-entity affinity traversal

## Target Graph Shape

The Entity Graph should evolve into two connected layers:

### Literary Knowledge Graph

Models relationships among literary entities:

- Work
- Edition
- Author
- Quote
- Publication
- Theme
- Concept
- Movement
- Period
- Place

### Literary Identity Graph

Models user relationships to literary entities:

- User -> Work
- User -> Edition
- User -> Author
- User -> Quote
- User -> Publication
- User -> Theme
- User -> Concept
- User -> Movement
- User -> Period
- User -> Place

The two graphs remain separate authority domains but are consumed together by MatchMaker.
