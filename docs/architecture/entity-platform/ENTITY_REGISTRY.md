---
id: BT-DOCS-ARCHITECTURE-ENTITY-PLATFORM-ENTITY-REGISTRY
title: "Entity Registry"
status: active
authority_level: architecture
owner: entity-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Entity Registry

Status: Architecture Definition  
Mode: Read Only  
Governing Roadmap: `docs/architecture/LITERARY_ENTITY_ROADMAP.md`

## Registry Purpose

The Entity Registry defines BookTown's canonical literary entity types and their current architectural maturity.

This registry is descriptive and directional. It does not create schemas or implementation tickets.

## Maturity Scale

- Level 0: Metadata
- Level 1: Navigable Entity
- Level 2: Canonical Entity
- Level 3: Graph Entity
- Level 4: Literary Identity Entity
- Level 5: MatchMaker Entity
- Level 6: Literary Intelligence Primitive

## Entity Matrix

| Entity | Definition | Current Level | Authority Source | Canonical Identifier | Search | Graph | Identity | MatchMaker | Current Status |
|---|---|---:|---|---|---|---|---|---|---|
| Work | Abstract literary creation independent of edition, file, format, or ownership. | 3 | `books` canonical authority, governed by Work Authority Source Law. | `bookId`, `canonicalKey`, `workIdentity`. | Global book search. | Book semantic graph, ontology, explicit and derived relationships. | Reading, shelves, reviews, quotes, bookmarks. | Partial as book recommendation target. | Strongest current entity. |
| Edition | Concrete publishing manifestation of a Work. | 2 | `editions`, `ebooks`, edition links under Work authority. | `editionId`, `bookId`, `workId` where available. | Search emits external provider results as editions; editions can be listed for a work. | Indirect through Work. | Reader access and acquisition signals. | Not a primary entity input. | Canonical material layer exists but remains mostly invisible. |
| Author | Stable creator identity independent of user profile. | 2 | `authors`, `author_identity`, provider identity mappings, native authored-author materialization. | `authorId`, `canonicalKey`, provider/authority identity keys. | Dedicated author discovery; not first-class global search entity. | Typed as graph entity but not fully surfaced. | Follow signals, book authorship, quote links. | Not ready beyond candidate signals. | Canonical layer exists; UI/search participation incomplete. |
| Quote | Portable literary atom with source attribution. | 2 | Root `quotes`, user quote copies, `quote_identity`, canonical quote hash. | `canonicalQuoteId`, root quote id, quote hash. | Quote-specific search and admin query; not global mixed entity search. | Not surfaced as graph node. | Saved quotes, quote density, quote bookmarks. | Not ready. | Canonical identity exists; graph/search maturity limited. |
| Publication | BookTown-native longform authored content. | 2 | `longform_publications`, publishing bridge outputs. | `publicationId`, slug/canonical slug. | Publication surfaces and read flows; not global literary entity search. | Not currently a graph node. | Writing/publication activity. | Not ready. | Navigable content entity, not yet integrated with entity graph. |
| Theme | Recurrent literary concern or semantic pattern. | 0 | No first-class authority identified; appears as embedded metadata. | None established. | Not first-class searchable. | Relationship labels and metadata only. | Stubbed or embedded only. | Not ready. | Conceptual entity. |
| Concept | Abstract idea or intellectual unit represented in literature. | 0 | No first-class authority identified; appears in quote/admin fields. | None established. | Not first-class searchable. | Not productized. | Not canonicalized. | Not ready. | Conceptual entity. |
| Movement | Literary or intellectual movement. | 1 | Canonical entity type and seeded canonical entities. | `entityId`, `slug`. | Not first-class global search; appears through ontology/semantic refs. | Participates in semantic refs and relationship types. | Not canonical user affinity yet. | Not ready. | Emerging ontology-backed entity. |
| Period | Historical or literary period. | 1 | `historical_period` canonical entity type and semantic refs. | `entityId`, `slug` when materialized. | Not first-class global search. | Typed relationship and semantic ref support. | Not canonical user affinity yet. | Not ready. | Emerging ontology-backed entity. |
| Place | Geographic/cultural location relevant to literary experience. | 1 | `venues`/spaces for product place; no unified literary-place authority identified. | `venueId`, `placeId` in venue flows. | Venue search; not literary place search. | Space relationship refs can include books/authors; not literary graph node. | Venue reviews/bookmarks. | Not ready. | Product place exists; literary place is not unified. |

## Registry Notes

### Work

Work is the foundation of the current platform. It owns canonical literary truth and carries ontology fields. It is already search, reader, social, and graph participating.

### Edition

Edition is canonical material truth, but it must not redefine Work identity. It remains mostly invisible in user-facing flows, which is consistent with the invisible edition architecture.

### Author

Author is a canonical creator entity. It is stronger than metadata but not yet graph-native or global-search-native.

### Quote

Quote is a canonical atom but remains weakly integrated into the graph and MatchMaker systems.

### Publication

Publication is a first-class BookTown content record. Its relationship to Author is currently split between user ownership and canonical authored-author materialization.

### Theme And Concept

Theme and Concept are target entities but currently lack authority, canonical IDs, direct navigation, graph surfaces, and search participation.

### Movement And Period

Movement and Period are more mature than Theme and Concept because canonical entity types and semantic refs exist, but they do not yet operate as complete product entities.

### Place

Place exists as venues/spaces, but a literary place is not yet a unified canonical entity. Future architecture must decide whether product venues and literary places share identity or remain separate but linkable entities.
