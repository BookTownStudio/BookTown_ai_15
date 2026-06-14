---
id: BT-PROJECT-SOURCES-ARCHITECTURE-CANON-V2
title: "BookTown Architecture Canon v2"
status: active
authority_level: project_sources
owner: architecture-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Architecture Canon v2

## Authority Scope

This document is the consolidated architectural authority for Project Source retrieval. It summarizes locked foundations and routes details to source documents. It does not authorize implementation.

## Foundational Architecture

| Foundation | Lock | Owns | Does Not Own |
|---|---|---|---|
| WEM | BT-WEM-LOCK-001 | Work identity, Edition truth, Manifestation access/rendering truth | Author identity, meaning units, graph relationships, search ranking |
| Author Authority | BT-AUTHOR-DOCTRINE-LOCK-001 | Author identity, aliases, pseudonyms, author types, authorship, bibliography | Work identity, influence, movement membership, search identity |
| Entity Platform | BT-ENTITY-PLATFORM-LOCK-001 | Entity type vocabulary, references, lifecycle language, summaries, routing | Domain truth for every entity |
| Meaning Unit Authority | BT-MEANING-UNIT-LOCK-001 | Canonical Theme and Concept doctrine | Work identity, Author identity, graph edge truth, search tags |
| Literary Graph | BT-LITERARY-GRAPH-LOCK-001 | Literary relationships between eligible nodes | Node identity, search ranking, MatchMaker output, public page truth |

## WEM Canon

Work is intellectual truth. Edition is publishing/material truth. Manifestation is access, rendering, readability, acquisition, uploaded file, or external readable instance truth.

Public, readable, or acquirable Works require a primary Edition. Compatibility fields may exist only as projections and must not redefine WEM authority.

## Author Authority Canon

An Author is a canonical literary creator identity. Author identity is independent of user accounts, provider rows, display names, aliases, search results, public pages, and recommendations.

Pseudonyms may be canonical Author identities. Contributor roles must stay at the lowest accurate layer: Work, Edition, Manifestation, or Publication.

## Entity Platform Canon

An Entity is a stable, typed object of literary or BookTown-native meaning that can be referenced across systems while preserving authority source.

`LiteraryEntityRef` is the canonical cross-system reference. IDs are type-scoped. Consumers must read `entityType` before interpreting `entityId`.

`EntitySummary` is a display-safe projection. Only the embedded Entity reference carries identity authority.

## Entity Status

| Type | Status |
|---|---|
| Work | Foundational canonical |
| Edition | Canonical material entity |
| Author | Foundational canonical |
| Quote | Canonical literary atom |
| Publication | Canonical BookTown-native content entity |
| Theme | Canonical Meaning Unit after acceptance |
| Concept | Canonical Meaning Unit after acceptance |
| Movement | Emerging context entity |
| Period | Emerging context entity |
| Place | Deferred |
| User, Shelf, Query, Result, DTO, Card | Excluded from literary entity authority |

## Meaning Unit Canon

Theme and Concept are canonical Meaning Units after authority acceptance.

Theme is a recurrent literary concern, tension, pattern, or field of significance. Concept is a definable intellectual or semantic unit. Philosophy is ontology-only context in v1. Idea resolves to Theme or Concept. Motif, Symbol, Topic, Keyword, provider tags, user labels, and AI phrases are evidence or projections only.

## Literary Graph Canon

Literary Graph owns relationship identity, type, direction, provenance, confidence, lifecycle, and canonical-vs-derived status.

Graph nodes are eligible Entity references or governed ontology context. They are not separate identities.

Canonical relationships include accepted influence, response, lineage, tradition membership, movement membership, period membership, theme relationships, concept relationships, and historical relationships.

Derived or evidence-only relationships include same form, same subform, similarity, provider tags, AI suggestions, user labels, shelf co-membership, search co-clicks, and recommendation adjacency.

## Search Canon

Search is a consumer and projection system. It owns query handling, normalization, result composition, ranking, search fields, and search UX contracts. It does not own Work, Author, Meaning Unit, or Graph truth.

Search must remain work-centric and authority-backed.

Search Results doctrine is work-centric at the foundation: book search results represent literary Works with availability summaries, while Editions remain subordinate and are accessed through Book Details, reading, acquisition, and language/version flows.

The locked Search Results specification also supports structured entity-card result sets where governed. Result cards may include Work, Author, Quote, and shelf/product result cards according to Search authority and product rules. These cards are search/product projections unless their embedded references route to an owning authority.

## MatchMaker Canon

MatchMaker is the Literary Intelligence layer that aligns the Literary Knowledge Graph and Literary Identity Graph. It is not a search engine, recommendation-only engine, LLM, or authority layer.

MatchMaker consumes WEM, Author Authority, Entity Platform, Meaning Unit Authority, Literary Graph, Identity Graph, and Reader/Product signals. It produces derived intelligence only.

## Authority Ownership Model

| Question | Decision |
|---|---|
| What is authority? | A bounded owner of canonical identity, meaning, relationship, lifecycle, or state truth. |
| What is projection? | A derived representation of authority-owned truth. |
| Which domains own truth? | WEM, Author Authority, Entity Platform, Meaning Unit Authority, Literary Graph, Quote, Review, Reader, Shelf, Publishing by domain. |
| Which domains consume truth? | Search, MatchMaker, Public Web, Discovery, Reader UI, Social, Messaging, SEO, AI. |

## Cross-References

- [Authority Index](AUTHORITY_INDEX.md)
- [Schema Canon](03_BOOKTOWN_SCHEMA_CANON_V2.md)
- [Execution Canon](05_BOOKTOWN_EXECUTION_CANON_V2.md)
- `docs/master/MASTER_AUTHORITY_MATRIX.md`
