# Entity Platform Vision

Status: Architecture Definition  
Mode: Read Only  
Governing Roadmap: `docs/architecture/LITERARY_ENTITY_ROADMAP.md`

## Purpose

The Entity Platform defines BookTown's long-term architectural foundation for treating literature as an interconnected system of canonical literary entities rather than as a book catalog.

This document does not implement schemas, indexes, functions, UI, or product behavior. It defines the target platform semantics that future implementation must align with.

## What Is A Literary Entity?

A Literary Entity is a stable object of literary meaning that can be identified, referenced, traversed, searched, discussed, and reasoned about across BookTown.

A Literary Entity is not merely display metadata. It must have, or be eligible to have:

- a stable identity
- a canonical or governed authority source
- a summary representation for product surfaces
- explicit relationships to other entities
- participation rules for search, graph, social, reader, identity, and MatchMaker systems

## Why BookTown Is Entity-Centric

BookTown is not a traditional book catalog. A book catalog centers inventory records. BookTown centers literary meaning.

The Work remains foundational because it is the strongest canonical literary object currently implemented, but the platform objective is broader:

- Works express literary creations.
- Editions express material publishing manifestations.
- Authors express creator identities.
- Quotes express portable literary atoms.
- Publications express BookTown-native authored longform.
- Themes and Concepts express semantic meaning.
- Movements and Periods express literary-historical context.
- Places express geographic and cultural context.
- User Literary Identity expresses the reader/writer relationship to all of the above.

Entity-centric architecture allows BookTown to support literary pathways such as:

- Work to author to movement
- Quote to concept to theme
- Reader to work to author to adjacent tradition
- Publication to canonical author to authored work

## Platform Relationship Model

### Literary Entity Layer

The Literary Entity Layer is the common identity and registry layer. It defines what entity types exist, how each entity is identified, where authority lives, and what systems may reference it.

The layer must provide a common contract for entity references and summaries before BookTown can become graph-native or MatchMaker-native.

### Literary Knowledge Graph

The Literary Knowledge Graph models relationships among literary entities.

Current implementation evidence shows graph-capable infrastructure through ontology fields, semantic references, and literary relationship types. The currently surfaced product graph is still primarily book-to-book.

The Entity Platform makes non-book graph participation explicit so future graph traversal can include authors, quotes, movements, periods, themes, concepts, and places.

### Literary Identity Graph

The Literary Identity Graph models how a user forms a literary identity through interactions with entities.

Current implementation evidence includes reading progress, shelves, quotes, reviews, bookmarks, follows, and intelligence snapshots. The current identity layer aggregates several signals, but not yet through a unified canonical entity-interaction model.

### MatchMaker

MatchMaker consumes the Literary Knowledge Graph and Literary Identity Graph. Its purpose is literary understanding and pathway generation, not simple recommendation ranking.

The Entity Platform supplies the canonical entity inputs MatchMaker needs. MatchMaker must not become an identity authority and must not rewrite entity truth.

## Entity Lifecycle

The platform lifecycle for a literary entity is:

1. Candidate
   - Raw external, user-generated, or editorial evidence appears.
   - The candidate is not canonical authority.

2. Resolved
   - The candidate is matched to an existing entity or assigned a new governed identity.
   - Identity evidence is retained.

3. Canonicalized
   - The entity receives a stable canonical identifier and authority source.
   - Identity fields are protected from silent overwrite.

4. Enriched
   - Non-identity metadata, aliases, summaries, classifications, or semantic refs are added under provider-role rules.
   - Enrichment cannot override canonical identity.

5. Related
   - The entity participates in explicit or derived relationships.
   - Relationship ownership must be separate from entity identity authority.

6. Surfaced
   - The entity appears in navigation, search, social, reader, graph, or discovery surfaces.
   - Surfaces consume entity summaries; they do not redefine entity truth.

7. Interacted With
   - User actions produce entity interaction signals.
   - These signals belong to the Literary Identity Graph, not to entity authority.

8. Reasoned Over
   - MatchMaker and future intelligence systems consume entity and identity graphs.
   - Reasoning output is derived, not canonical authority.

## First-Class Entity Criteria

An entity is first-class in BookTown only when it satisfies all required criteria:

1. Stable Identity
   - It has a canonical identifier or a governed path to one.

2. Authority Ownership
   - Its source of truth is explicit.

3. Entity Reference Contract
   - It can be represented by a common entity reference and summary model.

4. Relationship Participation
   - It can participate in graph edges without being reduced to display text.

5. Navigation Semantics
   - Product surfaces know whether and how it can be opened.

6. Search Semantics
   - Search knows whether it is searchable directly, searchable through related entities, or not searchable.

7. Social Semantics
   - Social systems know whether it can be attached, bookmarked, followed, or discussed.

8. Identity Semantics
   - User interactions with it can be recorded as canonical user-entity signals.

9. MatchMaker Semantics
   - MatchMaker can consume it as graph or identity input without owning its truth.

## Current Platform Classification

Based on the architecture roadmap and audits:

- Current state: Work-centric, entity-aware, graph-capable, MatchMaker-preparatory.
- Target state: Entity-native, graph-native, MatchMaker-native.

The next architecture milestone is the Literary Entity Foundation:

- `LiteraryEntityRef`
- Entity Type Registry
- Entity Summary Model
- Unified entity relationship rules
- Canonical user-entity interaction model
