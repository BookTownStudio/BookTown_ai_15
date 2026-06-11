# MatchMaker Entity Layer

Status: Architecture Definition  
Mode: Read Only  
Governing Roadmap: `docs/architecture/LITERARY_ENTITY_ROADMAP.md`  
Related Authority: `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`

## Purpose

The MatchMaker Entity Layer defines how MatchMaker consumes literary entities, the Literary Knowledge Graph, and the Literary Identity Graph.

This document does not define recommendation algorithms. It defines architectural inputs, boundaries, and consumption models.

## MatchMaker Position

MatchMaker operates between:

1. Literary Knowledge Graph
2. Literary Identity Graph

It aligns literature and reader/writer identity to support:

- recommendations
- discovery
- literary pathways
- reading insights
- writing insights
- identity insights

Recommendations are one output. They are not the purpose of MatchMaker.

## MatchMaker Inputs

### Entity Registry

MatchMaker requires stable entity types and canonical references for:

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

### Entity Summaries

MatchMaker may consume display summaries, but summaries are not identity authority.

Required summary concepts:

- entity type
- canonical entity id
- title/name
- subtitle/context
- language
- image where available
- authority status

### Literary Knowledge Graph

MatchMaker consumes:

- explicit relationships
- derived relationships
- ontology assignments
- semantic refs
- relationship confidence
- relationship provenance
- graph distance
- traversal constraints

### Literary Identity Graph

MatchMaker consumes:

- user-entity affinities
- interaction summaries
- reading behavior
- writing behavior
- quoting behavior
- review behavior
- shelving behavior
- follow behavior
- search/discovery behavior
- temporal identity changes

### Search And Discovery Context

Search can provide query intent and result context. Search remains search authority. MatchMaker must not rewrite canonical search identity fields.

## Graph Consumption Model

MatchMaker should consume the graph through bounded typed traversals.

Traversal inputs:

- start entity ref
- target entity types
- allowed relationship types
- max depth
- confidence floor
- provenance requirements
- exclusion rules

Traversal outputs:

- candidate entity refs
- pathway explanation
- relationship evidence
- confidence metadata

MatchMaker may rank or explain candidates, but it must not create canonical graph edges by implication.

## Identity Graph Consumption Model

MatchMaker consumes user identity as derived context, not as raw unrestricted event history.

Allowed identity inputs:

- affinity summaries by entity type
- recent interaction summaries
- long-term interaction summaries
- negative/dismissal summaries
- privacy-safe user profile signals
- temporal movement signals

Required safeguards:

- privacy tier enforcement
- bounded result sets
- provenance tracking
- confidence reporting
- no hidden canonical mutations

## Entity Affinity Model

Entity affinity expresses how strongly a user appears connected to an entity.

Affinity must be:

- entity-type scoped
- entity-id scoped
- time-aware
- confidence-aware
- provenance-aware
- privacy-safe

Affinity must not:

- overwrite user profile truth
- overwrite entity truth
- rely on display strings when canonical IDs are available
- collapse different entity types into one score without type context

## Pathway Generation Model

A pathway is an explainable route through literary meaning.

Example pathway forms:

- User -> Work -> Author -> Movement -> Work
- User -> Quote -> Concept -> Theme -> Work
- User -> Author -> Influenced Author -> Work
- User -> Publication -> Author -> Work

Pathway generation requires:

- graph traversal evidence
- user affinity context
- entity maturity checks
- explanation payloads
- confidence bounds

Pathways are derived experiences. They are not canonical graph truth.

## Discovery Generation Model

Discovery generation should combine:

- known user affinity
- adjacent graph territory
- novelty tolerance
- language context
- reading depth
- literary diversity
- entity maturity
- availability constraints where relevant

Discovery outputs may include:

- Work recommendations
- Author discoveries
- Quote discoveries
- Movement or Period paths
- Theme or Concept explorations after those entities become canonical
- Reading and writing prompts

## Current Readiness

Current implementation is MatchMaker-preparatory:

- Work recommendations exist as top-rated public book selection.
- User intelligence snapshots aggregate reading, genre, author, quote, review, and engagement signals.
- Search annotations can add non-authoritative explainable signals.
- Graph infrastructure supports several literary entity types but product traversal is still work-centered.

Current implementation is not yet MatchMaker-native:

- No unified `LiteraryEntityRef`.
- No canonical user-entity interaction ledger.
- Theme and Concept lack first-class authority.
- Author and Quote are not full graph/search participants.
- Movement, Period, and Place are not complete navigable MatchMaker entities.

## Authority Boundaries

MatchMaker may:

- consume canonical entities
- consume graph relationships
- consume identity summaries
- generate derived pathways
- generate recommendations and explanations
- provide confidence and rationale

MatchMaker may not:

- create canonical entity identity
- rewrite Work, Author, Quote, or Edition authority
- create canonical relationships without an approved relationship write path
- treat vector similarity as canonical truth
- hide missing provenance

## Required Platform Prerequisites

Before large-scale MatchMaker implementation:

1. Unified entity reference contract.
2. Entity registry read model.
3. Canonical user-entity interaction model.
4. Non-book graph traversal contracts.
5. Entity summary contract.
6. Theme and Concept canonical authority.
7. Clear privacy and provenance rules for identity signals.
