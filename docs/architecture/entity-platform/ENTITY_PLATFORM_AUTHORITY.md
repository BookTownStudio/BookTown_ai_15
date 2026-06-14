---
id: BT-ARCH-ENTITY-PLATFORM-AUTHORITY-001
title: "Entity Platform Authority"
status: locked
authority_level: foundational
owner: entity-platform
last_audited: 2026-06-14
source_of_truth: true
locked_at: 2026-06-14
lock_id: BT-ENTITY-PLATFORM-LOCK-001
supersedes: []
superseded_by: null
ai_read: true
---

# Entity Platform Authority

## Purpose

This document is the locked foundational doctrine for the BookTown Entity Platform. It defines what an Entity is, what an Entity is not, how entities are referenced across systems, which systems own entity authority, and which entity types are canonical, emerging, deferred, or excluded.

This document locks doctrine only. It does not authorize runtime changes, Firestore changes, Functions changes, Rules changes, Index changes, Search changes, Graph changes, MatchMaker changes, migrations, backfills, schema changes, or implementation work.

## Lock Status

Status: LOCKED.

Lock date: 2026-06-14.

Lock ID: BT-ENTITY-PLATFORM-LOCK-001.

Lock rationale: Entity Platform doctrine is required as a foundational layer between WEM, Author Authority, Meaning Unit Authority, Literary Graph, Search, MatchMaker, Public Web, Publishing, Social, Reader, and future intelligence systems. Entity refs and summaries must be shared without allowing downstream systems to redefine entity truth.

Modification policy:

- Future changes to entity definition, entity type vocabulary, lifecycle semantics, authority routing, or entity eligibility require a new architecture decision record or replacement locked authority document.
- Runtime systems may consume Entity Platform doctrine but must not create parallel entity definitions.
- Compatibility fields may exist only as projections or adapters and must not redefine entity authority.
- Documentation that conflicts with this locked authority is superseded for Entity Platform doctrine questions.

## Canonical Definition Of Entity

An Entity is a stable, typed object of literary or BookTown-native meaning that can be identified, referenced, summarized, routed, related, displayed, searched, discussed, reasoned over, or interacted with across systems while preserving its authority source.

An Entity must have:

- a type-scoped identity;
- an explicit authority owner or governed authority path;
- lifecycle state;
- reference semantics;
- display-safe summary semantics;
- eligibility rules for search, graph, identity, MatchMaker, public web, publishing, and product surfaces.

An Entity is not necessarily canonical. Candidate, resolved, deprecated, merged, superseded, archived, and unresolved entities may exist as lifecycle states, but only canonical entities may own canonical truth.

## What Is Not An Entity

The following are not Entities:

- display strings;
- aliases without accepted identity;
- provider rows;
- raw external IDs;
- raw search queries;
- raw reading history;
- recommendation outputs;
- AI-generated labels;
- embeddings or vector clusters;
- shelves as user collections;
- reviews, bookmarks, highlights, reactions, comments, posts, messages, and notifications as user/product objects;
- public pages, cards, DTOs, summaries, feeds, and search results as projections;
- user accounts.

These may reference Entities, produce evidence, or project Entity summaries. They must not become entity truth.

## Entity Versus Authority

Entity Platform defines the shared reference and lifecycle doctrine for entity identity across BookTown.

Authority owns truth for a specific entity domain.

| Concern | Entity Platform Owns | Domain Authority Owns |
|---|---|---|
| Entity type vocabulary | Yes | May request additions through doctrine change. |
| Reference shape | Yes | Must provide values that satisfy the reference doctrine. |
| Lifecycle state semantics | Yes | Applies state transitions under its domain policy. |
| Canonical identity truth | No, except Entity Platform doctrine itself | Owning domain such as WEM, Author, Quote, Publishing, Meaning Unit, or future Place authority. |
| Display summary contract | Yes | Source data and canonical labels. |
| Relationship truth | No | Literary Graph or owning relationship authority. |

Entity Platform owns references, lifecycle language, routing semantics, and cross-system compatibility. It does not replace Work, Author, Quote, Publication, Meaning Unit, or Literary Graph authority.

## Canonical Definition Of LiteraryEntityRef

`LiteraryEntityRef` is the canonical cross-system reference to an Entity.

It identifies:

- the contract version used to interpret the reference;
- the entity type;
- the type-scoped entity ID;
- the authority state;
- the authority source;
- optional canonical ID, canonical key, source reference, merge target, display hint, language hint, resolution confidence, and provenance.

Rules:

1. Consumers must read `entityType` before interpreting `entityId`.
2. IDs are type-scoped, not globally meaningful by string shape.
3. A reference is not a display label.
4. A candidate reference is not canonical truth.
5. An unresolved reference is not eligible for graph, MatchMaker, or public canonical exposure.
6. A merged reference must resolve to its merge target before new graph, identity, MatchMaker, or public use.
7. A deprecated or archived reference may remain readable but must not create new canonical relationships unless explicitly allowed by domain doctrine.

## Canonical Definition Of EntitySummary

`EntitySummary` is the display-safe, routing-safe lightweight representation of an Entity for product and intelligence surfaces.

It may include:

- entity reference;
- title or label;
- subtitle;
- description;
- image;
- language;
- alternate labels;
- badges;
- availability summary;
- relationship context;
- navigation state;
- type-specific display context.

Only the embedded Entity reference carries identity authority. Summary text, images, badges, availability text, and relationship context are projections. They must not override canonical identity or authority state.

## Entity Lifecycle Model

| State | Definition | Authority Rule |
|---|---|---|
| Candidate | Evidence suggests a possible Entity. | Not canonical; may be reviewed, displayed only with degraded semantics, or rejected. |
| Resolved | Candidate has been matched to an existing Entity or assigned a governed identity path. | Not necessarily canonical; resolution evidence must be retained. |
| Canonical | Entity identity is accepted by its owning authority. | May be used for canonical relationships, public routing, and downstream intelligence subject to eligibility. |
| Enriched | Non-identity metadata, aliases, summaries, classifications, or semantic refs are added. | Enrichment cannot override canonical identity. |
| Merged | Entity identity is absorbed into a surviving Entity. | New use must resolve to the survivor; provenance must preserve the old identity. |
| Split | One Entity is divided into multiple distinct Entities. | Relationships, aliases, summaries, and references must be reassigned by the owning authority. |
| Superseded | Entity model or authority path has been replaced by a stronger model. | May redirect, remain archival, or be suppressed according to domain policy. |
| Deprecated | Entity remains readable for compatibility but should not be used for new canonical work. | Consumers must prefer the current authority path. |
| Archived | Entity is retired from active use. | May remain visible as historical context; not active discovery material by default. |
| Unresolved | Reference cannot currently be resolved to a governed Entity. | Not eligible for canonical graph, MatchMaker, public canonical exposure, or authority writes. |

## Candidate Vs Canonical Doctrine

Candidate is evidence. Canonical is accepted truth.

Candidates may come from providers, users, AI, editorial workflows, publishing, search discovery, ingestion, or migration. Candidates do not own canonical identity, graph truth, bibliography, public canonical pages, or MatchMaker candidate identity.

Canonical status requires the owning domain authority to accept identity. Acceptance must be explicit, provenance-bearing, and reversible through merge, split, deprecation, or archival doctrine.

## Merged, Split, Superseded, Archived Doctrine

Merged entities preserve identity history and redirect to a survivor. Splits correct over-broad identities by creating multiple canonical targets and reassigning relationships. Superseded entities indicate that a stronger authority model has replaced the older entity path. Archived entities remain identifiable but inactive.

Hard deletion is not an entity lifecycle state for canonical reasoning. If a record is operationally removed, existing references must be treated as unresolved unless a merge, supersession, or archival pointer exists.

## Entity Ownership Matrix

| Entity Domain | Authority Owner | Entity Platform Role |
|---|---|---|
| Work | WEM / Catalog | Defines reference and summary semantics; does not own Work truth. |
| Edition | WEM / Catalog | Defines reference and summary semantics; does not own material truth. |
| Author | Author Authority | Defines reference and summary semantics; does not own creator identity truth. |
| Quote | Quote Platform | Defines reference and summary semantics; does not own quote attribution truth. |
| Publication | Publishing Platform | Defines reference and summary semantics; does not own publication release truth. |
| Theme | Meaning Unit Authority, when locked | Defines target entity type and reference semantics. |
| Concept | Meaning Unit Authority, when locked | Defines target entity type and reference semantics. |
| Movement | Literary Graph / Ontology authority path | Defines reference semantics and maturity state. |
| Period | Literary Graph / Ontology authority path | Defines reference semantics and maturity state. |
| Place | Future Literary Place authority | Defines target entity type and blocks venue equivalence by default. |
| User | User/Auth/Profile systems | Excluded from `LiteraryEntityRef`; connects through user-entity interaction contracts. |
| Relationships | Literary Graph or relationship authority | Entity Platform defines graph-compatible refs; relationship truth is separate. |
| User interactions | Identity Graph | Entity Platform defines entity targets; user truth is separate. |

## Entity Taxonomy

| Entity Type | Doctrine Class | Current Status |
|---|---|---|
| Work | Foundational canonical Entity | Locked through WEM. |
| Edition | Canonical material Entity | Locked through WEM. |
| Author | Foundational canonical Entity | Locked through Author Authority. |
| Quote | Canonical literary atom | Active canonical entity, authority remains routed through Quotes. |
| Publication | Canonical BookTown-native content Entity | Active product/content entity; not foundational literary truth by itself. |
| Theme | Emerging Meaning Unit Entity | Contracted target; blocked until Meaning Unit authority. |
| Concept | Emerging Meaning Unit Entity | Contracted target; blocked until Meaning Unit authority. |
| Movement | Emerging context Entity | Ontology-backed, graph-ready, product maturity incomplete. |
| Period | Emerging context Entity | Ontology-backed, graph-ready, product maturity incomplete. |
| Place | Deferred context Entity | Contracted target; literary place authority unresolved. |

## Canonical Entity Inventory

Canonical today:

- Work;
- Edition;
- Author;
- Quote;
- Publication, as BookTown-native publishing content.

Foundational today:

- Work;
- Edition;
- Manifestation as WEM access/rendering authority, though not a `LiteraryEntityRef` entity type in the current vocabulary;
- Author.

## Emerging Entity Inventory

Emerging:

- Theme;
- Concept;
- Movement;
- Period.

These are legitimate Entity Platform types or graph/context entities, but their full authority, graph, search, identity, MatchMaker, and public exposure doctrine is not equally mature.

## Deferred Entity Inventory

Deferred:

- Place as Literary Place;
- Character;
- Motif;
- Symbol;
- Archetype;
- Question;
- Argument;
- Principle;
- Philosophy as an Entity Platform type unless promoted by future contract/version doctrine;
- Tradition and Civilization as Entity Platform types unless promoted by future contract/version doctrine.

Deferred means possible future doctrine, not current canonical entity status.

## Excluded Entity Inventory

Excluded from literary entity identity:

- User;
- Shelf;
- Venue as product venue;
- raw provider row;
- raw query;
- raw event;
- recommendation output;
- AI output;
- keyword;
- genre string;
- display-only alias;
- public page;
- search result;
- UI card;
- attachment object;
- notification;
- comment;
- message;
- review;
- bookmark;
- highlight.

Excluded objects may reference Entities or produce evidence. They must not become canonical literary entity identity.

## Entity Eligibility Rules

An Entity is eligible for canonical cross-system use only when:

1. its type is recognized by the Entity Platform doctrine or by an approved contract expansion;
2. its authority source is explicit;
3. its lifecycle state is canonical, resolved, or otherwise accepted for the target use;
4. its provenance is sufficient for the target surface;
5. it is not unresolved;
6. merged references resolve to the surviving Entity;
7. deprecated, superseded, or archived references are treated according to domain policy;
8. the consuming system uses Entity refs and summaries without redefining truth.

Graph, Search, MatchMaker, Public Web, Publishing, Reader, Social, and Discovery may impose narrower eligibility rules than Entity Platform.

## WEM Relationship

WEM owns Work, Edition, and Manifestation truth. Entity Platform references Work and Edition and carries their authority state across systems. Entity Platform does not own Work identity, Edition material truth, Manifestation access truth, provider arbitration, primary edition selection, or readable asset authority.

Manifestation remains WEM/access authority even if it is not currently a `LiteraryEntityType`. Product surfaces must not treat a Work ref as sufficient access authority where Edition or Manifestation truth is required.

## Author Authority Relationship

Author Authority owns creator identity, author type, pseudonym doctrine, aliases, bibliography, and Author-to-Work authorship authority. Entity Platform references Authors and exposes author summaries. Entity Platform does not create Authors, merge Authors, assign bibliography, or turn display names into canonical Authors.

## Meaning Unit Relationship

Meaning Unit Authority owns doctrine for Theme, Concept, and any promoted meaning-bearing entity such as Philosophy. Entity Platform provides the entity type path and reference semantics. Theme and Concept remain emerging until Meaning Unit authority accepts canonical identity rules.

## Literary Graph Relationship

Literary Graph owns relationship truth between eligible entities. Entity Platform defines which references can participate and how authority state travels with them. A Graph node is an Entity reference in graph context; it is not a separate identity. A graph edge must never rewrite entity identity.

## Search Relationship

Search consumes Entity refs, summaries, aliases, and projections. Search owns query handling, ranking, result composition, and search fields. Search must not define canonical entity identity, merge entities, promote provider rows, or treat display labels as authority.

## MatchMaker Relationship

MatchMaker consumes Entity refs, summaries, graph relationships, affinity summaries, and bounded identity snapshots. MatchMaker owns derived intelligence outputs only. It must not create canonical entity identity, graph truth, user truth, or Meaning Unit truth.

## Public Web Relationship

Public Web consumes canonical or public-safe Entity summaries and renders public pages, metadata, and sitemap entries. Public Web does not own entity truth. Public exposure must follow the owning domain authority and must not imply canonical readiness by route existence alone.

## Publishing Relationship

Publishing owns BookTown-native projects, releases, and longform publication authority. Publishing may create evidence or candidates for Authors, Works, Publications, and future entity links. It must not create canonical Work, Author, Meaning Unit, or Graph truth unless the owning authority accepts the evidence.

## Invariant Matrix

| Invariant | Locked Rule |
|---|---|
| Type before ID | Consumers must read entity type before interpreting entity ID. |
| Reference over display | Display labels, aliases, titles, and summaries are not identity. |
| Authority separation | Entity Platform does not replace domain authority. |
| Candidate safety | Candidates are evidence, not canonical truth. |
| Merge safety | Merged entities must resolve to the survivor before new use. |
| Projection safety | Projections may cache and display entity data but may not redefine it. |
| Graph safety | Graph edges may relate entities but may not rewrite identity. |
| Search safety | Search may rank and retrieve but may not canonicalize. |
| MatchMaker safety | Derived intelligence must not become entity authority. |
| Public safety | Public pages expose routed authority; they are not authority. |
| User boundary | User is excluded from `LiteraryEntityRef`. |
| Product object boundary | Product objects may reference entities but are not literary entities by default. |

## Risk Matrix

| Risk | Severity | Doctrine Control |
|---|---:|---|
| Downstream systems define parallel entity truth | High | Entity Platform lock and authority routing. |
| Display strings become identity | High | Reference-over-display invariant. |
| Provider records become canonical | High | Candidate vs canonical doctrine. |
| Search result rows become entity truth | High | Search relationship boundary. |
| MatchMaker outputs become authority | High | Derived intelligence boundary. |
| Graph nodes diverge from entities | High | Graph node equals entity reference in graph context. |
| Theme/Concept are over-promoted before Meaning Unit doctrine | High | Emerging status and Meaning Unit dependency. |
| Venue is mistaken for Literary Place | Medium | Place deferred and venue excluded as product object. |
| Publication is mistaken for Work | Medium | Publishing relationship and WEM boundary. |
| Archived/deprecated references create new truth | Medium | Lifecycle restrictions. |

## Platform Readiness Definition

Entity Platform is doctrine-ready when:

- Entity, `LiteraryEntityRef`, and `EntitySummary` are defined;
- authority ownership is routed;
- lifecycle states are unambiguous;
- canonical, emerging, deferred, and excluded inventories are explicit;
- downstream systems are forbidden from redefining entity truth;
- WEM, Author, Meaning Unit, Literary Graph, Search, MatchMaker, Public Web, and Publishing boundaries are explicit.

Entity Platform is runtime-conformance-ready only after separate implementation audits verify that runtime behavior follows this doctrine. This lock does not claim runtime conformance.

## Final Lock Recommendation

Entity Platform is locked as foundational doctrine under `BT-ENTITY-PLATFORM-LOCK-001`.

The lock establishes Entity Platform as BookTown's shared entity reference, lifecycle, and routing authority. It does not make Entity Platform the owner of all entity identity. Domain authorities continue to own truth for their entities, while Entity Platform ensures every downstream system consumes that truth through consistent typed references and summaries.

