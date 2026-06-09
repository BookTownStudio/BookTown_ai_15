# BookTown Search Architecture Register

## Purpose

This register is the authoritative source of truth for BookTown Search Architecture.

It records:

- Verified discoveries from audits
- Open architectural questions
- Proposed decisions under discussion
- Locked architectural decisions (ADR)
- Search architecture roadmap and evolution

This document is intended to prevent search architecture decisions from being lost across conversations, audits, implementation phases, and codebase changes.

## Authority Order

When conflicts exist, the following order applies:

1. Locked Decisions (ADR)
2. Verified Discoveries
3. Approved Proposals
4. Audited Evidence
5. Architecture Discussions
6. Assumptions

Proposals under discussion are not considered architecture authority until approved or locked.

## Scope

This register governs:

- Search UX
- Search routing
- Query classification
- Entity search
- Literary search
- Discovery architecture
- Search result composition
- Search ranking principles
- Search integration with the Literary Knowledge Graph

This register does not govern:

- Book Details architecture
- Reader architecture
- MatchMaker architecture
- Social search architecture
- Admin search architecture

These may reference search but remain separate architecture domains.

## Design Principle

BookTown Search is designed from the end-state vision backward.

V1 implementations should evolve toward the locked architecture rather than introducing temporary architectures that require future replacement.

Search architecture should grow through richer literary intelligence, graph coverage, ontology coverage, and catalog maturity while preserving a stable user experience.

## Register Structure

This register follows the lifecycle:

Discovery
↓
Question
↓
Proposal
↓
Locked Decision (ADR)

Definitions:

D-xxx = Verified discovery
Q-xxx = Open question
P-xxx = Proposed decision
ADR-S-xxx = Locked architecture decision

Only ADR entries are considered architecture authority.

---

## Discoveries

### D-001
Status: VERIFIED

Finding:
Search returns a mixed result set:
- BookTown records are emitted as canonical works.
- External provider records are emitted as editions.

Evidence:
SEARCH-AUDIT-001 / D-007

### D-002
Status: VERIFIED

Finding:
Search providers currently used are:
- Firestore books
- Google Books
- OpenLibrary

Evidence:
SEARCH-AUDIT-001 / D-003

### D-003
Status: VERIFIED

Finding:
`books/{bookId}` is the canonical work authority row.

Evidence:
SEARCH-AUDIT-002

### D-004
Status: VERIFIED

Finding:
`editions/{editionId}` rows belong to works through `bookId` and `workId`.

Evidence:
SEARCH-AUDIT-002

### D-005
Status: VERIFIED

Finding:
Work-level identifiers exist as `bookId`, `canonicalKey`, and `workIdentity`.

Evidence:
SEARCH-AUDIT-002

### D-006
Status: VERIFIED

Finding:
`book_identity` maps identity keys (e.g. `canonical:*`, `provider:*`) to `bookId`.

Evidence:
SEARCH-AUDIT-002

### D-007
Status: VERIFIED

Finding:
`authors` and `author_identity` are backend materialized authority surfaces.

Evidence:
SEARCH-AUDIT-002

### D-008
Status: VERIFIED

Finding:
Ontology is stored on `books.ontology` and mirrored as `books.literaryForm`.

Evidence:
SEARCH-AUDIT-002

### D-009
Status: VERIFIED

Finding:
Explicit semantic graph relationships are stored in `literary_relationships`.

Evidence:
SEARCH-AUDIT-002

### D-010
Status: VERIFIED

Finding:
Derived semantic graph relationships are calculated from ontology fields and semantic references.

Evidence:
SEARCH-AUDIT-002

### D-011
Status: VERIFIED

Finding:
Related books are currently author-based, not graph-based.

Evidence:
SEARCH-AUDIT-002

### D-012
Status: VERIFIED

Finding:
Canonical Factory / Refinery artifacts can enrich existing books after identity resolution but do not create new canonical works through the audited path.

Evidence:
SEARCH-AUDIT-002

### D-013
Status: VERIFIED

Finding:
Search ranks canonical works and external editions together, with canonical works explicitly preferred in final ordering.

Evidence:
SEARCH-AUDIT-002

### D-014
Status: VERIFIED

Finding:
Production `books` contains 145 documents.

Evidence:
SEARCH-AUDIT-003

### D-015
Status: VERIFIED

Finding:
Production catalog contains 116 canonical works and 29 provisional works.

Evidence:
SEARCH-AUDIT-003

### D-016
Status: VERIFIED

Finding:
Production `editions` contains 131 documents; all have `bookId` and 121 have `workId`.

Evidence:
SEARCH-AUDIT-003

### D-017
Status: VERIFIED

Finding:
Production `authors` contains 442 documents; all have `canonicalKey`.

Evidence:
SEARCH-AUDIT-003

### D-018
Status: VERIFIED

Finding:
Production `book_identity` contains 328 documents; 318 map to existing books and 271 map to canonical books.

Evidence:
SEARCH-AUDIT-003

### D-019
Status: VERIFIED

Finding:
142 books contain sufficient canonical identity fields to resolve as canonical search results.

Evidence:
SEARCH-AUDIT-003

### D-020
Status: VERIFIED

Finding:
Ontology exists on 143 of 145 books, but canonical tradition exists on only 62 books.

Evidence:
SEARCH-AUDIT-003

### D-021
Status: VERIFIED

Finding:
No production books currently contain valid `semanticRefs`.

Evidence:
SEARCH-AUDIT-003

### D-022
Status: VERIFIED

Finding:
`literary_relationships` contains only 8 records and uses the legacy relationship schema.

Evidence:
SEARCH-AUDIT-003

### D-023
Status: VERIFIED

Finding:
Readable ebook coverage is 12 books total:
- 10 in-app readable
- 2 external-readable

Evidence:
SEARCH-AUDIT-003

### D-024
Status: VERIFIED

Finding:
The locked Search Results Specification assumes a work-centric search model. Search results represent literary works with availability summaries, while editions remain subordinate and are accessed through details, reading, or acquisition flows.

Evidence:
BookTown — Search Results List v1.1 (LOCKED)

### D-025
Status: VERIFIED

Finding:
Current UI exposes internal catalog concepts (e.g. Edition, Physical, External, Other Language) that are implementation metadata rather than user-facing literary concepts. These labels may remain during development and data population but are intended to be hidden or replaced before public launch.

Evidence:
Founder decision during search architecture review.

### D-026
Status: VERIFIED

Finding:
BookTown currently has independent search endpoints rather than a single central search router.

Evidence:
SEARCH-AUDIT-004

### D-027
Status: VERIFIED

Finding:
`unifiedSearch` contains deterministic query classification limited to:
- ISBN
- AUTHOR_INTENT
- TITLE_INTENT
- MIXED_INTENT

Evidence:
SEARCH-AUDIT-004

### D-028
Status: VERIFIED

Finding:
AI Librarian contains a separate natural-language intent classifier powered by Vertex AI / Gemini.

Evidence:
SEARCH-AUDIT-004

### D-029
Status: VERIFIED

Finding:
Normal search does not currently use AI Librarian, Vertex AI, MatchMaker, ontology retrieval, or graph retrieval.

Evidence:
SEARCH-AUDIT-004

### D-030
Status: VERIFIED

Finding:
Quote search exists as a dedicated endpoint using quote projection collections.

Evidence:
SEARCH-AUDIT-004

### D-031
Status: VERIFIED

Finding:
Author discovery exists as a dedicated endpoint using canonical authors and OpenLibrary author search.

Evidence:
SEARCH-AUDIT-004

### D-032
Status: VERIFIED

Finding:
No dedicated character-search infrastructure was verified.

Evidence:
SEARCH-AUDIT-004

### D-033
Status: VERIFIED

Finding:
No dedicated comparison-search infrastructure was verified outside AI Librarian intent classification.

Evidence:
SEARCH-AUDIT-004

### D-034
Status: VERIFIED

Finding:
Ontology navigation exists, but ontology-driven retrieval is not implemented.

Evidence:
SEARCH-AUDIT-004

### D-035
Status: VERIFIED

Finding:
Semantic graph infrastructure exists for Book Details but is not currently used for search retrieval or ranking.

Evidence:
SEARCH-AUDIT-004

### D-036
Status: VERIFIED

Finding:
Recommendation infrastructure exists separately from search and is not currently connected to normal search execution.

Evidence:
SEARCH-AUDIT-004

---

## Open Questions

### Q-001
Status: OPEN

Question:
`books.workType` uses values `canonical` / `provisional`, while search DTO `workType` uses `work` / `edition`. The naming overlap is ambiguous.

Source:
SEARCH-AUDIT-002

### Q-002
Status: OPEN

Question:
Both `books.editionId` and `books.canonicalRelations.primaryEditionId` appear to represent the primary edition. The authoritative field is unclear from schema naming.

Source:
SEARCH-AUDIT-002

### Q-003
Status: OPEN

Question:
Frontend types model a clean Work → Edition architecture, but runtime paths still rely on legacy `Book` compatibility fields.

Source:
SEARCH-AUDIT-002

### Q-004
Status: OPEN

Question:
Refinery artifacts contain semantic references and embedding descriptors, but direct persistence behavior is not fully verified.

Source:
SEARCH-AUDIT-002

### Q-005
Status: OPEN

Question:
Does `rightsMode: "public_free"` represent the intended public-domain classification?

Source:
SEARCH-AUDIT-003

### Q-006
Status: OPEN

Question:
Should graph coverage be measured using the legacy relationship schema or only the newer entity-based schema?

Source:
SEARCH-AUDIT-003

### Q-007
Status: OPEN

Question:
Why do 10 `book_identity` records point to non-existing book IDs?

Source:
SEARCH-AUDIT-003

### Q-008
Status: OPEN

Question:
When a work has multiple editions and one or more readable formats, should search results represent:
A) the Work,
B) the Edition,
or
C) the Work with an availability summary?

Source:
ARCHITECTURE DISCUSSION

### Q-009
Status: RESOLVED

Question:
Should the future Search Router replace the current independent search endpoints or orchestrate them?

Resolution:
The Search Router orchestrates existing search systems rather than replacing them.

Source:
SEARCH-AUDIT-004
Architecture Discussion

### Q-010
Status: OPEN

Question:
Can the existing AI Librarian classifier be reused as the first-stage Search Router classifier?

Source:
SEARCH-AUDIT-004

### Q-011
Status: RESOLVED

Question:
Should quote search remain a dedicated subsystem or become part of unified search?

Resolution:
Quote Search remains a specialized retrieval subsystem and provider.

The Search Router may invoke Quote Search when quote retrieval is relevant to the detected query intent, but Quote Search is not replaced by the Router.

Quote retrieval, ranking, and matching remain the responsibility of the Quote Search provider, while the Search Router is responsible for query classification, orchestration, and search result composition.

Source:
SEARCH-AUDIT-004
Architecture Discussion

### Q-012
Status: OPEN

Question:
Should ontology navigation remain display-only until ontology retrieval exists?

Source:
SEARCH-AUDIT-004

### Q-013
Status: OPEN

Question:
Should author discovery remain provider-backed and mixed, or become canonical-first like work search?

Source:
SEARCH-AUDIT-004

---

## Proposed Decisions

### P-001
Status: APPROVED

Proposal:
Search results represent literary Works, not Editions.

Search results expose an availability summary so users can immediately understand whether a work is readable, obtainable, or already in their library.

Editions remain subordinate entities and are accessed through Book Details, reading flows, acquisition flows, and language/version selection.

Source:
Architecture Discussion

### P-002
Status: APPROVED

Proposal:
Internal catalog concepts such as Work, Edition, Manifestation, Provider, Identity, and Acquisition Source are architecture-layer concepts and should not be exposed directly to end users in the public BookTown experience.

Source:
Architecture Discussion

### P-003

Status: UNDER DISCUSSION

Proposal:
Search results are optimized for discovery and selection.

Book Details is the authoritative destination for edition selection, acquisition options, reading options, ownership information, and deeper literary exploration.

Source:
Architecture Discussion

### P-004
Status: UNDER DISCUSSION

Proposal:
Search result CTAs should be contextual.

The Add-to-Shelf CTA is shown only when the work is not yet present in the user's library.

Once the work exists in any shelf, the CTA changes to the most relevant next action (Open, Continue, Review, etc.) and the Add CTA is removed.

### P-005
Status: UNDER DISCUSSION

Proposal:
Selecting a search result always opens Book Details.

Book Details is the authoritative destination for all book actions, including reading, reviews, quotes, editions, acquisition, and shelf management.

Source:
Architecture Discussion

### P-006
Status: UNDER DISCUSSION

Proposal:
Identity Lines are not generated during search requests.

Identity Lines are canonical catalog assets generated during post-ingestion enrichment and persisted on the Work.

When an Identity Line does not yet exist, search results may render without one until enrichment completes.

Once generated, the Identity Line becomes part of the canonical Work record and is reused for all future searches.

Source:
Architecture Discussion

### P-007
Status: UNDER DISCUSSION

Proposal:
Identity Lines are derived discovery assets.

The Literary Intelligence Refinery produces structured literary understanding, including canonical identity, ontology, themes, relationships, traditions, semantic similarity, and literary clusters.

Identity Lines are generated from this structured understanding and persisted on the Work as a user-facing discovery asset.

Identity Lines are not primary intelligence assets and are not generated during search requests.

Source:
Architecture Discussion + Literary Intelligence Refinery

### P-008
Status: UNDER DISCUSSION

Proposal:
Search and catalog ingestion operate independently of the Literary Intelligence Refinery.

A Work may enter the catalog and become searchable before literary enrichment exists.

The Literary Intelligence Refinery operates asynchronously and batch-processes Works, generating validated literary intelligence assets that are later persisted to Firestore.

Search consumes enrichment when available but must function correctly without it.

Source:
Architecture Discussion + Literary Intelligence Refinery

### P-009
Status: UNDER DISCUSSION

Proposal:
Search triggers catalog ingestion only when a Work does not already exist in the BookTown catalog.

Once a Work exists in Firestore, subsequent searches resolve against the local catalog and do not require re-ingestion.

Source:
Architecture Discussion

### P-010
Status: UNDER DISCUSSION

Proposal:
BookTown Search consists of five progressively more intelligent layers:

1. Identity Search
2. Catalog Search
3. Literary Search
4. Conversational Search
5. MatchMaker Recommendation

Each layer builds on the previous one while preserving fast deterministic retrieval for exact-title and exact-author searches.

Source:
SEARCH-AUDIT-003 + Architecture Discussion

### P-011
Status: APPROVED

Proposal:
BookTown uses one unified search box.

The search box accepts exact titles, authors, ISBNs, fuzzy queries, translated titles, and short literary-intent queries.

The box may expand vertically up to two lines so users can see what they wrote before submitting.

A character limit is enforced to keep search distinct from long-form chat.

Search internally routes queries to identity, catalog, literary, or conversational search paths.

MatchMaker personalization is not part of search until BookTown has a reliable literary knowledge graph.

Source:
Architecture Discussion

### P-012
Status: UNDER DISCUSSION

Proposal:
BookTown uses a Search Router before retrieval.

Queries are classified into:
- Identity Search
- Fuzzy Identity Search
- Literary Search
- Conversational Search

LLMs are used only for query understanding and intent extraction.

All retrieval, ranking, and result construction remain under BookTown search authority.

Source:
Architecture Discussion

### P-013
Status: UNDER DISCUSSION

Proposal:
BookTown search is an entity search system rather than a book search system.

The primary searchable entities are:
- Authors
- Works

Future searchable entities may include:
- Quotes
- Shelves

Search architecture must be designed to support multiple literary entity types from the beginning, even if only Authors and Works are initially exposed.

Source:
Architecture Discussion

### P-014
Status: UNDER DISCUSSION

Proposal:
BookTown should introduce a central Search Router responsible for classifying user queries and routing them to the appropriate search experience.

The Search Router should operate above existing search systems rather than replacing them initially.

Potential query types include:
- Work
- Author
- Quote
- Intent
- Recommendation
- Comparison
- Character

Character queries are recognized as a valid future query type by the Search Router architecture.

Character retrieval is not part of V1 implementation and may initially fall back to Work Search until dedicated character entities exist.

The Search Router classifies a primary query intent rather than selecting a single destination.

Search results are composed from multiple section providers.

The detected primary intent determines:
- Top Match selection
- Section ordering
- Ranking priorities

Additional sections may be populated from other search systems when trusted data is available.

Examples:
- Work queries may surface author, quote, shelf, connection, and related work sections.
- Author queries may surface work, quote, shelf, and connection sections.
- Intent queries may surface works, authors, shelves, and quotes.

Potential routing targets include:
- Work Search
- Author Search
- Quote Search
- Intent Search
- Recommendation Search
- Comparison Search

The Search Router should initially orchestrate existing search systems rather than replace them.

Source:
Architecture Discussion

### P-015
Status: UNDER DISCUSSION

Proposal:
The Search Router should classify queries using a tiered approach.

Tier 1 — Deterministic Classification
- ISBN
- Exact Work
- Exact Author
- Exact Quote

Tier 2 — Catalog Intent Classification
- Literary movements
- Genres
- Themes
- Shelf-like queries
- Ontology-driven queries

Tier 3 — Natural Language Classification
- Recommendation queries
- Ambiguous conversational queries
- Mood-based queries
- Comparative natural-language queries

Higher-confidence tiers take precedence over lower tiers.

The Router should prefer deterministic and catalog-driven classification before invoking AI services.

Source:
Architecture Discussion

### P-016
Status: UNDER DISCUSSION

Proposal:
The Search Router may assign both primary and secondary query intents.

Primary intent determines:
- Top Match selection
- Section ordering
- Ranking priorities

Secondary intents may contribute additional sections when trusted data is available.

Example:

Query:
Kafka quotes

Classification:
Primary Intent = Author
Secondary Intent = Quote

Query:
The Trial quotes

Classification:
Primary Intent = Work
Secondary Intent = Quote

The Search Router should prefer multi-intent classification over forcing ambiguous queries into a single intent category.

Source:
Architecture Discussion

### P-017
Status: UNDER DISCUSSION

Proposal:
The Search Router should assign a confidence score to query classification.

High-confidence classifications may produce a dominant Top Match and intent-specific section ordering.

Medium-confidence classifications may broaden result composition through additional supporting sections.

Low-confidence classifications should favor discovery and present multiple entity groups rather than forcing a single interpretation.

The Search Router should avoid clarification dialogs whenever possible.

Ambiguous literary queries should be resolved through broader result composition rather than interrupting the user experience.

Source:
Architecture Discussion

### P-018
Status: UNDER DISCUSSION

Proposal:
V1 Search Router should support the following first-class searchable entities:

- Work
- Author
- Quote

Shelf entities may appear as supporting sections within search results but are not first-class searchable entities in V1.

Character entities are recognized as future searchable entities but are not part of V1.

The Search Router should only route to entity types that have mature retrieval infrastructure and trusted data coverage.

Source:
Architecture Discussion

### P-019
Status: UNDER DISCUSSION

Proposal:
The Search Router should orchestrate existing search systems rather than replace them.

The Router is responsible for:
- Query classification
- Intent detection
- Search orchestration
- Section composition
- Result ordering

The Router is not responsible for implementing all retrieval logic itself.

Existing systems such as:
- Work Search
- Author Search
- Quote Search
- AI Librarian
- Recommendation Systems

should remain specialized retrieval providers that may be invoked by the Router as needed.

This approach minimizes implementation risk, preserves existing functionality, and allows the Search Router to evolve independently from underlying retrieval systems.

Source:
Architecture Discussion

### P-020
Status: UNDER DISCUSSION

Proposal:
Search Router behavior should be validated against a canonical query test matrix before ADR-S-012 is locked.

The test matrix should include:
- Work queries
- Author queries
- Quote queries
- Intent queries
- Recommendation queries
- Comparison queries
- Character queries

The purpose is to verify classification, routing, section composition, and fallback behavior across both V1 and end-state architectures.

Source:
Architecture Discussion

### P-021
Status: UNDER DISCUSSION

Proposal:
Shelves are a single literary entity type and should be presented as a unified concept throughout the BookTown experience.

Internal distinctions such as work shelves, author shelves, quote shelves, or mixed shelves should not be exposed as primary user-facing categories.

Shelf cards should communicate their purpose through content, metadata, and preview information rather than entity subtype labels.

Shelves may contain:
- Works
- Authors
- Quotes
- Mixed literary entities (future)

Shelves are containers used to organize literary entities and should be treated as a unified concept regardless of their contents.

Search results should present shelves through a single SHELVES section rather than separate shelf categories.

Search Providers consume canonical data.

Canonical Factory produces canonical data.

Search must not depend on Canonical Factory execution at query time.

Canonical Factory is responsible for producing and enriching:
- Works
- Authors
- Quotes
- Relationships
- Ontology

Search is responsible for consuming and presenting those assets through Search Providers.

Source:
Architecture Discussion

### P-022
Status: UNDER DISCUSSION

Proposal:
Search section ordering should be determined by literary proximity to the resolved entity.

The most directly related sections should appear first.

Examples:

Work Query:
- Top Match
- More by Author
- Connections
- Related Works
- Quotes
- Shelves

Author Query:
- Top Match
- Works
- Connections
- Quotes
- Shelves

Quote Query:
- Top Match
- Work
- Author
- Related Quotes
- Shelves

Intent Query:
- Works
- Shelves
- Authors
- Quotes

Recommendation Query:
- Recommended Works
- Authors
- Shelves

Section ordering should remain stable over time to preserve user familiarity.

Source:
Architecture Discussion


---

## Locked Decisions (ADR)

### ADR-S-001
Decision:
All search architecture discussions are tracked in this register.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-002

Decision:
Search results are Work-centric.

Search results represent literary Works, not Editions.

Editions are subordinate entities accessed through Book Details, reading flows, acquisition flows, and language/version selection.

Search results expose availability summaries rather than edition entities.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-003

Decision:
Search results use a human-readable Identity Line rather than tags.

The Identity Line is a single editorial-quality sentence that communicates the essential nature of a work.

Examples:
- Existential novel about bureaucracy and alienation.
- Psychological novel about guilt, morality, and redemption.
- Popular history examining how shared stories shaped human civilization.

Identity Lines are derived from BookTown's literary knowledge graph and canonical catalog.

Genre tags, mood tags, provider metadata, ontology labels, and other classification systems are implementation-layer data and are not exposed in primary search results.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-004
Decision:
Identity Lines are canonical catalog assets generated during enrichment and persisted on Works.

Identity Lines are not generated at search time.

...

### ADR-S-005

Decision:
Search results are structured literary result sets rather than flat result lists.

All search results are composed of entity cards.

Supported entity types:
- Work
- Author
- Quote

Future entity types may include:
- Shelf

When BookTown identifies a strong primary match, search results are organized around that entity.

Example:

TOP MATCH

[The Trial card]

MORE BY FRANZ KAFKA

[The Castle card]
[Metamorphosis card]

CONNECTIONS

[Camus card]
[Borges card]

RELATED WORKS

[The Stranger card]
[Nausea card]

QUOTES

[Quote card]
[Quote card]

SHELVES

[Kafka Essentials]
[Existential Classics]

Search results remain a results page composed entirely of cards.
BookTown does not transition directly into a dedicated literary landing page.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-006

Decision:
When the primary search entity is an Author, BookTown search results are organized around that Author.

Example:

TOP MATCH

[Franz Kafka]

WORKS

[The Trial]
[The Castle]
[Metamorphosis]

CONNECTIONS

[Camus]
[Borges]
[Dostoevsky]

QUOTES

[Quote]
[Quote]

SHELVES

[Kafka Essentials]
[Complete Kafka]
[Existential Classics]
[Modernist Literature]

All items are rendered as entity cards.

Shelves are presented as a unified literary entity type regardless of their contents.

The search experience remains a structured results page rather than a dedicated author landing page.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-007

Decision:
For literary-intent searches, the first result section matches the entity type explicitly requested by the user.

Examples:

Search: "Existential novels"

WORKS
SHELVES
AUTHORS
QUOTES

Search: "Existential authors"

AUTHORS
SHELVES
WORKS
QUOTES

Search: "Existential quotes"

QUOTES
SHELVES
AUTHORS
WORKS

Supporting sections provide literary context around the primary entity type.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-008
Decision:
Shelves are first-class literary entities.

V1:
- Users can create shelves.
- BookTown can create canonical shelves.
- Shelves can appear in search results.

Future:
- AI can create shelves.
- Shelves become graph entities.
- Shelves can contain works, authors, quotes, and other literary entities.
- Shelves participate in literary discovery, relationships, and search.

Examples:

Work Shelves:
- Existential Classics
- Books About Exile

Author Shelves:
- Best Russian Authors
- Complete Kafka

Quote Shelves:
- Best Kafka Quotes
- Quotes About Freedom

Status:
LOCKED

Date:
2026-06-05

### ADR-S-009

Decision:
Connections and Related Works are derived from the same literary graph.

They are not separate storage systems.

Connections is the broader graph view and may include:
- Works
- Authors
- Movements
- Traditions
- Philosophical links
- Historical links
- Quotes

Related Works is a filtered projection of the same graph limited to Work entities.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-010

Decision:
Search and MatchMaker are separate systems.

Search is responsible for identity resolution, retrieval, literary discovery, and navigation.

MatchMaker is a future personalization layer built on the literary graph, user graph, reading graph, writing graph, quote graph, and shelf graph.

Search must function correctly without MatchMaker.

Status:
LOCKED

### ADR-S-011

Decision:
V1 uses the same architecture as the end-state search experience.

Search is built from a fixed set of section types:

- TOP MATCH
- WORKS
- AUTHORS
- CONNECTIONS
- RELATED WORKS
- QUOTES
- SHELVES

Search result composition is query-driven.

Search result ordering is determined by the detected query type and user intent.

Search section visibility is capability-driven.

Sections are rendered only when trusted data is available.

Unavailable or low-confidence sections are omitted.

As the literary graph, ontology, shelves, quotes, relationships, and other catalog assets mature, existing sections automatically become richer and may become visible without requiring redesign of the search experience.

New code should only be required when introducing entirely new entity types or section types that do not already exist in the architecture.

Status:
LOCKED

Date:
2026-06-05

### ADR-S-012

Decision:
BookTown Search is governed by a Search Router architecture.

A single unified search box serves as the entry point for all public literary search experiences.

The Search Router is responsible for:

- Query classification
- Intent detection
- Search orchestration
- Section composition
- Result ordering

The Search Router operates above existing retrieval systems and orchestrates them rather than replacing them.

Supported query intents include:

- Work
- Author
- Quote
- Intent
- Recommendation
- Comparison
- Character (future)

The Search Router may assign both primary and secondary intents.

Primary intent determines:

- Top Match selection
- Section ordering
- Ranking priorities

Secondary intents may contribute additional sections when trusted data is available.

Search uses a tiered classification model:

Tier 1:
Deterministic classification

Tier 2:
Catalog and ontology classification

Tier 3:
Natural-language classification

Deterministic and catalog-driven classification take precedence over AI-assisted classification.

Entity queries produce a Top Match representing the highest-confidence resolved entity.

Supported entity query types include:
- Work
- Author
- Quote

Intent and Recommendation queries do not produce a Top Match and instead render discovery-oriented result sections.

Search results are composed through specialized providers.

Examples include:

- Work Search
- Author Search
- Quote Search
- Recommendation Systems

Providers remain responsible for retrieval and ranking within their domains.

The Search Router remains responsible for orchestration and presentation.

V1 searchable entities are:

- Work
- Author
- Quote

Shelves may appear as supporting entities.

Character entities are deferred to a future phase.

Search section visibility remains capability-driven under ADR-S-011.

Sections are rendered only when trusted data is available.

As the catalog, ontology, literary graph, quote graph, and shelf graph mature, existing search sections automatically become richer without requiring changes to the search architecture.

Related References:

- P-014
- P-015
- P-016
- P-017
- P-018
- P-019
- P-020
- P-021
- P-022
- ADR-S-011

Status:
LOCKED

Date:
2026-06-07

---

## Roadmap

### Phase A — Current State Audit
Status: COMPLETED

### Phase B — Target Architecture
Status: NOT STARTED

### Phase C — Implementation Plan
Status: NOT STARTED