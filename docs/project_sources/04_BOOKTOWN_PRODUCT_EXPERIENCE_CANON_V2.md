---
id: BT-PROJECT-SOURCES-PRODUCT-EXPERIENCE-CANON-V2
title: "BookTown Product Experience Canon v2"
status: active
authority_level: project_sources
owner: product-experience-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Product Experience Canon v2

## Authority Scope

This document is the UX and product-surface authority for Project Source retrieval. It defines what each product surface owns and consumes. It does not define implementation.

## Surface Ownership Matrix

| Surface | Owns | Consumes |
|---|---|---|
| Home | Discovery modules, continuity surfaces, editorial/product ordering | Search, Catalog, Reader, MatchMaker-derived signals |
| Search | Query UX, filters, result rendering, search state | WEM, Author, Entity, Meaning, and approved search projections |
| Search Results | Structured entity-card projection display | Canonical Work, Author, Quote, and governed shelf/product result references |
| Book Details | Work inspection UX | WEM, Author Authority, Quotes, Reviews, Graph summaries |
| Authors | Author inspection and discovery UX | Author Authority, WEM bibliography, Graph projections |
| Discovery | Editorial and intelligence-driven pathways | Search, Catalog, approved Graph projections, approved MatchMaker surfaces, Author intelligence |
| Quotes | Quote creation, saving, display, fanout UX | Quote authority, WEM, Author Authority |
| Reviews | Review writing and display UX | Review authority, Work identity, moderation |
| Reader | Reading, progress, sessions, highlights, bookmarks, reader settings | WEM Manifestation authority, media, rights |
| Shelves | User library organization | Work refs, Reader state, shelf membership authority |
| Messaging | Conversations, requests, entity attachments | Entity summaries, privacy/reporting rules |
| Notifications | User notification delivery and render state | Product events and projection fanouts |
| Publishing | Writing projects, releases, publication display | Publication authority, WEM bridge, Author Authority |
| Public Web | SSR, SEO, public entity exposure | Approved authority-backed projections |

## Current Implementation Caveat

Normal Search currently does not use MatchMaker, AI Librarian, ontology retrieval, graph retrieval, or graph ranking. Those systems may inform future product experiences only after their consumer boundaries are approved and implemented.

## Search Results Doctrine

Search Results are work-centric at the foundation. Book search results represent literary Works with availability summaries; Editions remain subordinate and are accessed through Book Details, reading, acquisition, and language/version flows.

Search Results are also structured entity-card result sets under the locked Search specification. They may render Work, Author, Quote, and governed shelf/product result cards where Search authority allows. Result cards are projections and must not redefine Work, Author, Quote, shelf, Meaning Unit, or Graph authority.

Book Details is the authoritative destination for edition selection, acquisition options, reading options, ownership information, reviews, quotes, shelf actions, and deeper literary exploration.

## MatchMaker V1 Consumption

Home Dynamic Discovery is the first approved MatchMaker consumer in V1.

Search, Search Results, Reader, Social, Notifications, and Messaging are not approved MatchMaker consumers in V1. Book Details, Read Tab, Discovery, AI Librarian, Author Details, Publications, Writing, Admin, and Analytics remain deferred until separate authority work approves their consumption boundaries.

## UX Doctrine

1. UX may render authority; it must not create authority.
2. UI labels, cards, tabs, sections, filters, and badges are projections.
3. Product summaries must preserve authority source and lifecycle.
4. Candidate, unresolved, derived, or evidence-only data must not be presented as canonical.
5. Public Web must not expose private, candidate, unresolved, pseudonym-sensitive, or evidence-only relationships as fact.

## Product Surface Boundaries

| Surface | Boundary |
|---|---|
| Book Details | May summarize Edition and Manifestation availability, but Work identity stays WEM-owned. |
| Author Details | May expose bibliography and graph summaries, but Author identity stays Author-owned. |
| Related Books | May show graph/search-derived relatedness, but must distinguish canonical relationship from derived affinity. |
| Search | May rank and retrieve; cannot certify identity or meaning. |
| MatchMaker UX | May explain derived matches; cannot claim canonical literary relationship unless sourced from Graph. |
| Reader | May produce reading state; cannot turn behavior into literary graph truth. |
| Reviews/Shelves | May feed personalization evidence; cannot create canonical affinity or graph edges. |

## Beta Exposure Posture

| Area | Posture |
|---|---|
| Reader, Search, Catalog, Shelves | Candidate for constrained reading beta only after blockers pass product gates. |
| Authors and Quotes | Operational, authority-backed but still dependent on conformance and projection quality. |
| Discovery, MatchMaker, Literary Graph surfacing | Emerging/internal unless explicitly gated. |
| Social, Messaging, AI, Public Web | Constrained or internal until moderation, public exposure, and authority boundaries are complete. |
| Admin/Operations | Internal only. |

The full app is not beta-ready as a broad public surface. The viable beta posture is a constrained authenticated reading loop: Search -> Book Details -> Acquire/Read -> Reader -> Shelf, with feedback and tightly gated AI only where separately approved.

## Cross-References

- [Product Constitution](01_BOOKTOWN_PRODUCT_CONSTITUTION_V2.md)
- [Architecture Canon](02_BOOKTOWN_ARCHITECTURE_CANON_V2.md)
- [Execution Canon](05_BOOKTOWN_EXECUTION_CANON_V2.md)
- `docs/master/MASTER_PRODUCT_MAP.md`
