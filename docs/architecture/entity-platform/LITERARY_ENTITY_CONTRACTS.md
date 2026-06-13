---
id: BT-DOCS-ARCHITECTURE-ENTITY-PLATFORM-LITERARY-ENTITY-CONTRACTS
title: "Literary Entity Contract Definition"
status: active
authority_level: architecture
owner: entity-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Literary Entity Contract Definition

Status: Architecture Definition  
Mode: Read Only  
Audit/Design ID: BT-LITERARY-ENTITY-CONTRACT-002  
Governing Documents:

- `ENTITY_PLATFORM_VISION.md`
- `ENTITY_REGISTRY.md`
- `ENTITY_GRAPH.md`
- `LITERARY_IDENTITY_GRAPH.md`
- `MATCHMAKER_ENTITY_LAYER.md`
- `docs/architecture/LITERARY_ENTITY_ROADMAP.md`

## Purpose

This document defines the platform contracts that govern literary entities across BookTown.

These are architecture contracts, not implementation schemas, API definitions, code models, Firestore designs, index plans, or UI specifications.

The contracts provide the foundation required before implementing:

- Entity Graph
- Literary Identity Graph
- Mixed Entity Search
- Author Promotion
- Theme/Concept Materialization
- MatchMaker Entity Layer

## Part 1: LiteraryEntityRef Specification

### Definition

`LiteraryEntityRef` is the canonical cross-system reference to a literary entity.

It identifies what the entity is, which authority owns its identity, and whether the reference is canonical, transitional, merged, deprecated, or unresolved.

### Supported Entity Types

The entity type set is closed at this architecture phase:

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

User is intentionally excluded from `LiteraryEntityRef`. User Literary Identity references users separately and connects users to literary entities through `UserEntityInteraction`.

### Required Fields

| Field | Requirement |
|---|---|
| `contractVersion` | Required. Identifies the contract version used by the reference. |
| `entityType` | Required. Defines the entity domain. IDs are not assumed globally unique across types. |
| `entityId` | Required for resolved/canonical references. Identifies the entity inside its authority domain. |
| `authorityState` | Required. Indicates whether the reference is candidate, resolved, canonical, deprecated, merged, archived, or unresolved. |
| `authoritySource` | Required. Names the system or authority layer responsible for identity. |

### Optional Fields

| Field | Requirement |
|---|---|
| `canonicalId` | Optional. Present when the current reference resolves to a canonical surviving identity different from the local entity id. |
| `canonicalKey` | Optional. Allowed for entities that have canonical key architecture. |
| `sourceRef` | Optional. External provider, user, editorial, or derived source memory. |
| `mergeTarget` | Optional. Present when the entity has been merged into another entity. |
| `displayHint` | Optional. Short label for degraded display only; never identity authority. |
| `languageHint` | Optional. Helps consumers choose display text; not identity. |
| `resolutionConfidence` | Optional. Used for candidate/resolved states only. |
| `provenance` | Optional. Describes how the reference was produced. |

### Entity Typing Strategy

`entityType` is always required.

IDs must be treated as type-scoped. A `bookId`, `authorId`, `quoteId`, and `publicationId` may share string shapes without conflict because the entity type defines the namespace.

Global uniqueness is not required. Global references are formed by the combination of:

- contract version
- entity type
- entity id
- authority state

### Versioning Strategy

The contract version is required so all long-lived references can be interpreted safely as the platform evolves.

Version changes are required when:

- supported entity types change
- authority states change
- resolution semantics change
- merge/deletion behavior changes
- cross-system compatibility expectations change

Version changes are not required for display-only additions that do not affect identity or resolution.

### Resolution Rules

1. A consumer must read `entityType` before interpreting `entityId`.
2. A canonical entity must resolve to exactly one current authority owner.
3. A candidate entity may be displayed only with clear degraded semantics.
4. A merged entity must resolve to its merge target before graph, identity, or MatchMaker use.
5. A deprecated entity may remain readable but must not be used to create new canonical relationships.
6. An archived entity may remain visible according to product policy but must not be considered active discovery material.
7. An unresolved reference is not eligible for graph or MatchMaker consumption.

### Alias Behavior

Aliases are not identity.

Aliases may support:

- search
- display
- resolution evidence
- multilingual lookup

Aliases may not:

- create graph edges alone
- merge entities alone
- overwrite canonical identifiers
- become MatchMaker entity IDs

### Deleted, Archived, Deprecated, And Merged Entities

Hard deletion is not an entity lifecycle state for canonical reasoning. If a record is removed operationally, consumers must treat existing references as unresolved unless a merge or archival pointer exists.

Merged entities must preserve:

- original entity type
- original entity id
- surviving target entity reference
- merge provenance

Archived entities remain identifiable but inactive.

Deprecated entities remain resolvable for backwards compatibility but must direct new usage to the current authority path.

### Cross-System Compatibility

Every system may consume `LiteraryEntityRef`, but no system may reinterpret identity locally.

Search, Social, Reader, Graph, Identity, and MatchMaker must all treat `LiteraryEntityRef` as a reference contract, not as display metadata.

## Part 2: EntitySummary Specification

### Definition

`EntitySummary` is the common lightweight representation of a literary entity used by product and intelligence surfaces.

It is optimized for display and routing. It is not the source of canonical truth.

### Consumers

- Search
- Discovery
- Reader
- Social
- Attachments
- Graph
- MatchMaker

### Mandatory Fields

| Field | Requirement |
|---|---|
| `ref` | Required. The canonical `LiteraryEntityRef`. |
| `title` | Required. Primary display label. |
| `authorityState` | Required. Mirrors the reference authority state for safe rendering. |
| `summaryVersion` | Required. Version of the summary contract. |

### Optional Fields

| Field | Requirement |
|---|---|
| `subtitle` | Optional display context such as author, period, source, or entity class. |
| `description` | Optional short descriptive text. |
| `image` | Optional display image or cover-like asset. |
| `language` | Optional preferred display language. |
| `alternateTitles` | Optional display aliases or translated labels. |
| `badges` | Optional non-authoritative display affordances. |
| `availability` | Optional surface-specific availability summary. |
| `relationshipContext` | Optional explanation of why the entity is shown in a graph/discovery context. |
| `navigation` | Optional statement that the entity is openable, preview-only, or non-navigable. |

### Display-Only Fields

These fields may never become authority:

- title
- subtitle
- description
- image
- badges
- relationship context
- availability text

### Authority-Bearing Fields

Only the embedded `LiteraryEntityRef` carries identity authority.

The summary may repeat `authorityState` for safety, but repeated values are projections and must not override the reference.

### Type-Specific Summary Extensions

Type-specific extensions are allowed when they are clearly namespaced by entity type and treated as display or context.

Examples:

- Work may expose author summary and form context.
- Edition may expose format, publisher, or language.
- Author may expose lifespan, country, or primary language.
- Quote may expose source Work or Author.
- Publication may expose owner or canonical author context.
- Movement and Period may expose time/context labels.
- Place may expose location context.

## Part 3: Entity Registry Read Model

### Definition

The Entity Registry Read Model is the common conceptual read shape that consumers use to understand an entity.

It is not a storage design. It is a platform boundary between authority systems and consumers.

### Common Information Every Entity Must Expose

- entity reference
- summary
- authority state
- authority source
- lifecycle state
- supported capabilities
- search participation state
- graph participation state
- identity participation state
- MatchMaker participation state
- canonical display labels
- alias and translation metadata where available
- provenance summary

### Type-Specific Information

| Entity | Type-Specific Read Information |
|---|---|
| Work | canonical title, author refs, original language, ontology, work identity, canonical relations. |
| Edition | parent Work ref, format, language, publisher/material metadata, readable capability context. |
| Author | canonical name, aliases, source IDs, lifespan, language/country context, linked native user context where applicable. |
| Quote | canonical text, source labels, source Work/Author refs where resolved, attribution confidence. |
| Publication | title, owner context, canonical author bridge where available, linked Work where available. |
| Theme | canonical label, aliases, semantic scope, related concepts after materialization. |
| Concept | canonical label, aliases, semantic definition, related themes after materialization. |
| Movement | canonical label, aliases, period context, related Works/Authors. |
| Period | canonical label, temporal scope, related Movements/Works/Authors. |
| Place | canonical label, geographic/cultural scope, related Works/Authors/Periods. |

### Alias Representation

Aliases must distinguish:

- canonical aliases
- provider aliases
- editorial aliases
- search-only aliases
- transliterations
- translations

Alias provenance is required before aliases can affect resolution.

### Translation Representation

Translations are display and search aids unless explicitly accepted into the entity authority layer.

The read model must distinguish:

- primary label
- localized label
- translated label
- transliterated label
- source language

### Authority States

The registry read model must expose authority state as one of:

- candidate
- resolved
- canonical
- enriched
- deprecated
- merged
- archived
- unresolved

## Part 4: Graph Entity Contracts

### GraphEntityReference

`GraphEntityReference` is a `LiteraryEntityRef` that is eligible for graph participation.

Eligibility requires:

- resolved or canonical authority state
- supported entity type
- provenance sufficient for graph use
- not archived unless traversal explicitly includes archival context
- not unresolved

### Relationship Contract

A relationship connects two graph-eligible entity references.

Required relationship concepts:

- relationship identity
- source entity reference
- target entity reference
- relationship type
- directionality
- relationship source
- provenance
- confidence
- lifecycle state
- contract version

### Edge Ownership

Edges are owned by the Literary Knowledge Graph relationship authority, not by the source or target entity document.

Entity documents may expose relationship summaries, but summaries do not own edge truth.

### Directionality

Relationship types must declare whether they are:

- directional
- reciprocal
- undirected

Consumers must not infer inverse meaning unless the relationship type explicitly allows it.

### Provenance

Relationship provenance must distinguish:

- editorial
- seeded
- migration
- provider-derived
- AI-assisted
- derived from ontology
- derived from user identity graph

Only approved provenance classes may produce canonical graph edges.

### Confidence

Confidence describes relationship certainty. It does not define entity identity certainty.

Low-confidence relationships may be used for exploration but must be excluded from canonical graph claims unless explicitly approved.

### Editorial, Derived, And Seeded Relationships

Editorial relationships are human-governed graph facts.

Seeded relationships are accepted initial graph facts.

Derived relationships are computed from ontology, semantic refs, or other governed data and must remain distinguishable from explicit graph facts.

## Part 5: UserEntityInteraction Contracts

### Definition

`UserEntityInteraction` is the canonical model for user interaction with a literary entity.

It belongs to the Literary Identity Graph.

It does not redefine entity truth.

### Interaction Identity

An interaction must be uniquely identifiable within its provenance domain and must be safe to deduplicate.

Identity should account for:

- user
- entity reference
- interaction type
- source event or source surface
- occurrence time or idempotency key

### Required Concepts

- user identity
- entity reference
- interaction type
- source surface
- provenance
- privacy tier
- lifecycle state
- weight class
- occurred time
- contract version

### Interaction Types

The contract must support:

- reading
- shelving
- reviewing
- quoting
- following
- bookmarking
- searching
- discovering
- publishing
- discussing

### Provenance

Interaction provenance must identify where the signal came from.

Examples:

- Reader
- Search
- Discovery
- Book Details
- Author Details
- Quote Details
- Shelf
- Social Post
- Message
- Publication Reader
- Profile
- Admin or migration process

### Privacy

Every interaction must carry a privacy tier.

Privacy tier determines:

- whether the signal can enter public aggregates
- whether it can enter private identity snapshots
- whether it can be used by MatchMaker
- whether it can be surfaced in explanations

### Weight Classes

Weight class is architectural, not algorithmic.

Allowed conceptual classes:

- passive
- active
- expressive
- durable
- negative
- administrative

Examples:

- opening an entity is passive
- bookmarking is active
- reviewing or quoting is expressive
- finishing a work is durable
- dismissing a discovery is negative

### Lifecycle

User interactions may be:

- recorded
- superseded
- withdrawn
- expired
- anonymized
- deleted

Withdrawal or deletion must not delete canonical entity truth.

## Part 6: MatchMaker Contracts

### MatchMakerInput

MatchMaker may consume:

- entity references
- entity summaries
- graph relationship summaries
- user affinity summaries
- interaction summaries
- search/discovery context
- availability constraints
- privacy-safe profile context

MatchMaker may not consume unresolved entity references as canonical inputs.

### Affinity Contract

Affinity represents a user's derived relationship to an entity.

Required concepts:

- user
- entity reference
- affinity class
- strength band
- confidence
- contributing signal classes
- recency
- provenance
- privacy tier

Affinity is derived. It is not an interaction and not entity authority.

### Pathway Contract

A pathway is an explainable route through literary meaning.

Required concepts:

- start context
- ordered entity references
- relationship evidence
- identity evidence
- explanation
- confidence
- exclusions or constraints

Pathways may be generated for discovery, reading, writing, or reflection contexts.

Pathways do not create canonical relationships.

### Discovery Contract

A discovery output is a MatchMaker-generated presentation candidate.

Required concepts:

- target entity reference
- reason class
- supporting evidence
- confidence
- user context boundary
- graph context boundary
- freshness

Discovery output is not search authority and not graph authority.

### Mutation Boundary

MatchMaker may generate:

- recommendations
- discoveries
- pathways
- explanations
- identity insights
- reading/writing prompts

MatchMaker must never mutate:

- canonical entity identity
- Work authority
- Author authority
- Quote authority
- Edition authority
- graph edge truth
- raw user interaction truth
- search index identity fields

## Part 7: Entity Lifecycle Contracts

### Lifecycle States

| State | Meaning |
|---|---|
| Candidate | Evidence exists but identity is not resolved. |
| Resolved | Candidate has been linked to an entity or assigned governed identity. |
| Canonicalized | Entity identity is accepted as canonical authority. |
| Enriched | Non-identity metadata has been added under authority rules. |
| Related | Entity participates in approved relationship contexts. |
| Surfaced | Entity is eligible for user-facing or system-facing surfaces. |
| Deprecated | Entity path remains readable but should not be used for new references. |
| Merged | Entity has been absorbed into a surviving entity. |
| Archived | Entity remains identifiable but inactive. |
| Unresolved | Existing reference cannot currently be resolved. |

### State Transitions

Allowed conceptual transitions:

- Candidate -> Resolved
- Resolved -> Canonicalized
- Canonicalized -> Enriched
- Canonicalized -> Related
- Related -> Surfaced
- Canonicalized -> Deprecated
- Deprecated -> Merged
- Canonicalized -> Archived
- Any non-canonical state -> Unresolved when authority evidence fails

Transitions must preserve provenance.

### Authority Ownership

Only the entity authority owner can change lifecycle states that affect identity.

Relationship authorities can change relationship lifecycle states but not entity lifecycle states.

Identity Graph systems can change interaction lifecycle states but not entity lifecycle states.

MatchMaker can generate derived output lifecycle states but cannot change entity, relationship, or interaction truth.

### Merge Rules

Merged entities must preserve:

- original entity reference
- surviving entity reference
- merge reason
- merge authority
- merge timestamp
- compatibility state for old references

New references must use the surviving entity.

Old references may resolve through mergeTarget.

### Deletion Rules

Canonical entity deletion is not a normal lifecycle operation.

Preferred lifecycle states:

- archived
- deprecated
- merged
- unresolved

If operational deletion occurs, all consumers must treat unresolved references as non-authoritative and must not create new graph, identity, or MatchMaker facts from them.

## Part 8: Contract Dependency Matrix

| Contract | Required By |
|---|---|
| LiteraryEntityRef | EntitySummary, Registry Read Model, GraphEntityReference, UserEntityInteraction, MatchMakerInput, Mixed Entity Search, Social Attachments, Reader Entity Navigation |
| EntitySummary | Search, Discovery, Reader, Social, Attachments, Graph display, MatchMaker explanations |
| Entity Registry Read Model | Mixed Entity Search, Entity Graph, Author Promotion, Theme/Concept Materialization, MatchMaker Entity Layer |
| GraphEntityReference | Relationship Contract, Entity Graph traversal, MatchMaker pathways |
| Relationship Contract | Literary Knowledge Graph, Graph search, MatchMaker graph consumption |
| UserEntityInteraction | Literary Identity Graph, affinity generation, MatchMaker identity inputs |
| Affinity Contract | MatchMakerInput, Pathway Contract, Discovery Contract |
| MatchMakerInput | MatchMaker Entity Layer, pathway generation, discovery generation |
| Pathway Contract | MatchMaker discovery, reader journeys, author journeys, theme/concept journeys |
| Discovery Contract | Discovery surfaces, MatchMaker explanations, future mixed-entity discovery |
| Entity Lifecycle Contract | All contracts that persist or consume long-lived entity references |

### Implementation Order

1. LiteraryEntityRef
2. Entity Lifecycle Contract
3. EntitySummary
4. Entity Registry Read Model
5. GraphEntityReference
6. Relationship Contract
7. UserEntityInteraction
8. Affinity Contract
9. MatchMakerInput
10. Pathway Contract
11. Discovery Contract

## Part 9: Implementation Readiness Assessment

Ready for contract-driven engineering:

- Work
- Edition
- Author
- Quote
- Publication

Requires authority definition before implementation:

- Theme
- Concept
- Literary Place

Requires product traversal definition before implementation:

- Movement
- Period

Requires privacy and provenance definition before large-scale implementation:

- UserEntityInteraction
- Affinity
- MatchMakerInput

Not ready for algorithmic MatchMaker implementation:

- multi-entity pathway generation
- theme/concept recommendations
- author similarity
- literary identity evolution

These depend on canonical entity references and user-entity interaction contracts first.

## Part 10: Recommended Engineering Sequence

This is not an implementation ticket list. It is the architecture dependency sequence future engineering must respect.

1. Establish the shared entity reference contract.
2. Establish lifecycle and merge semantics.
3. Establish common entity summary semantics.
4. Establish registry read semantics for every entity type.
5. Establish graph eligibility and relationship semantics.
6. Establish canonical user-entity interaction semantics.
7. Establish affinity semantics.
8. Establish MatchMaker consumption boundaries.
9. Materialize Theme and Concept authority only after contracts are stable.
10. Implement mixed-entity search and graph traversal only after registry and summary contracts are stable.
11. Implement MatchMaker entity pathways only after graph and identity contracts are stable.

## Final Contract Rule

No BookTown subsystem may treat display strings as canonical literary identity once a `LiteraryEntityRef` exists for that entity type.

Display strings can help humans read the system. They cannot become the system's truth.
