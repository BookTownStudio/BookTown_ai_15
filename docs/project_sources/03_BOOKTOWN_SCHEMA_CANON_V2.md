---
id: BT-PROJECT-SOURCES-SCHEMA-CANON-V2
title: "BookTown Schema Canon v2"
status: active
authority_level: project_sources
owner: data-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Schema Canon v2

## Authority Scope

This document is the data authority model for Project Source retrieval. It defines ownership, authority boundaries, projection doctrine, and collection classification required before detailed Schema v2 authoring. It does not propose schema, implementation, or migrations.

## Schema Doctrine

Schema v2 must begin from authority ownership, not existing collection names.

Collections and fields may be operationally retained while their authority role is reclassified. A document can contain authority fields and projection fields, but Schema v2 must distinguish them explicitly.

## Collection Ownership Model

| Collection / Surface | Classification | Owner |
|---|---|---|
| `books` | Work authority plus compatibility projections | WEM / Catalog |
| `editions` | Edition authority | WEM / Catalog |
| `manifestations` | Manifestation authority | WEM / Manifestation Authority |
| `authors` | Author authority | Author Authority |
| `quotes` | Quote authority | Quote Platform |
| `reviews` | Product/user review authority | Review domain |
| `literary_relationships` | Graph relationship authority candidate | Literary Graph |
| ontology/canonical entity surfaces | Mixed context and entity evidence | Entity Platform, Meaning Unit, Literary Graph |
| search fields and feeds | Projection | Search |
| quote/review fanouts | Projection | Quote/Review consumers |
| `reading_progress` | Reader user-state authority | Reader |
| reader manifests/indexes | Media derivative projection | Reader / WEM consumer |
| `shelf_books` | Shelf membership authority | Library UX |
| `longform_publications` | Publication/product authority | Publishing |
| public pages, SSR, sitemap payloads | Projection | Public Web |
| intelligence profiles and aggregates | Derived intelligence | Identity Graph / MatchMaker |

## Authority vs Projection Doctrine

| Surface | Authority Rule |
|---|---|
| Canonical identity | Must be owned by the relevant authority domain. |
| Search index | Projection only. |
| DTO/card/summary | Projection only unless it embeds a valid entity reference. |
| Public page | Projection only. |
| MatchMaker output | Derived intelligence only. |
| Provider/AI artifact | Evidence only. |
| Compatibility field | Projection or adapter only. |

## Entity Contracts

`LiteraryEntityRef` is the canonical reference contract. It must preserve contract version, entity type, type-scoped ID, authority state, authority source, and provenance where applicable.

`EntitySummary` is a projection. It may support display, routing, and retrieval, but cannot override canonical identity.

## Graph Contracts

Graph edge authority belongs to Literary Graph. A graph relationship must preserve eligible source node, eligible target node, relationship type, direction when applicable, provenance, confidence, lifecycle, and canonical-vs-derived status.

Graph node identity is never owned by the graph. Nodes must resolve to Entity Platform references or governed ontology context.

## Meaning Boundaries

Theme and Concept belong to Meaning Unit Authority. Philosophy is ontology-only context in v1. Topic, Keyword, Motif, Symbol, AI phrases, provider tags, and user labels are evidence or projections unless accepted by Meaning Unit Authority as Theme or Concept.

## Required Schema v2 Basis

| Area | Required Authority Basis |
|---|---|
| Work | WEM Work authority |
| Edition | WEM Edition authority |
| Manifestation | WEM Manifestation authority |
| Author | Author Authority |
| Entity refs | Entity Platform |
| Theme/Concept | Meaning Unit Authority |
| Graph edges | Literary Graph |
| Search | Projection system |
| MatchMaker | Derived intelligence system |
| Public Web | Projection system |
| Reader | Reader state plus WEM-dependent media projections |

## Cross-References

- [Architecture Canon](02_BOOKTOWN_ARCHITECTURE_CANON_V2.md)
- [Product Experience Canon](04_BOOKTOWN_PRODUCT_EXPERIENCE_CANON_V2.md)
- `docs/master/MASTER_AUTHORITY_MATRIX.md`
- `docs/engineering/FIRESTORE_AUDIT_REPORT.md`
