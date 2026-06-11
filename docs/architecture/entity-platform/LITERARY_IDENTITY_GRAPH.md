# Literary Identity Graph

Status: Architecture Definition  
Mode: Read Only  
Governing Roadmap: `docs/architecture/LITERARY_ENTITY_ROADMAP.md`

## Purpose

The Literary Identity Graph models how each user forms, changes, and expresses literary identity through interactions with canonical literary entities.

It is not a preference table and not a recommendation cache. It is a governed graph of user-to-entity relationships derived from explicit and behavioral signals.

## Current Evidence-Based State

Current implementation already records many user signals:

- reading progress
- shelves and shelf membership
- reviews
- saved quotes
- bookmarks
- follows
- post interactions
- publication and writing activity
- user intelligence snapshots

However, these signals are not yet normalized into one canonical user-entity interaction model. Some author distributions are computed from display labels such as `authorEn`, which is useful as a transitional signal but not sufficient for canonical entity affinity.

## User To Entity Interactions

The canonical interaction model should express every user action as:

- user id
- entity type
- entity id
- interaction type
- source surface
- timestamp
- strength
- privacy tier
- provenance

### Interaction Types

| Interaction | Meaning |
|---|---|
| viewed | User opened or inspected an entity. |
| searched | User searched for or selected an entity. |
| read_started | User began reading a Work or Edition. |
| read_progressed | User advanced in reading. |
| read_completed | User completed reading. |
| saved | User saved/bookmarked an entity. |
| shelved | User placed a Work/Edition on a shelf. |
| quoted | User created or saved a Quote. |
| reviewed | User reviewed a Work. |
| followed | User followed an Author, User, Shelf, or future entity. |
| attached | User attached an entity to a post or message. |
| discussed | User discussed an entity socially. |
| published | User published a Publication or Work. |
| dismissed | User rejected or dismissed a recommendation or discovery. |

## Affinity Generation

Affinity is a derived signal describing the user's relationship to an entity.

Affinity must not be written back as entity truth. It belongs to the Literary Identity Graph.

### Affinity Inputs

- explicit interactions such as follows and bookmarks
- reading depth and completion
- quote density
- review frequency
- recency
- repetition
- diversity across related entities
- graph distance from known affinities
- user-declared preferences where available

### Affinity Outputs

An affinity output should be scoped to:

- entity type
- entity id
- score band
- confidence
- contributing signal classes
- freshness
- privacy tier

The architecture should avoid pretending precision where signals are weak. Confidence and provenance are required.

## Identity Formation

Literary identity forms through accumulation and change across time.

The graph should represent:

- stable affinities
- emerging interests
- fading interests
- exploratory behavior
- completion consistency
- depth preference
- novelty tolerance
- language patterns
- author affinity
- theme and concept affinity once those entities become canonical

Identity is temporal. A current identity snapshot is a derived view over interaction history, not the source of truth.

## Signal Collection Rules

1. Collect canonical entity references wherever possible.
2. If only display text exists, classify the signal as transitional and non-canonical.
3. Do not infer canonical identity from fuzzy text alone.
4. Preserve source surface and provenance.
5. Bound high-volume signals.
6. Respect privacy tier boundaries.
7. Separate raw interaction events from derived identity snapshots.

## Signal Weighting Principles

This document does not define recommendation algorithms.

Architectural weighting principles:

- Completion is stronger than opening.
- Repeated interactions are stronger than isolated interactions.
- Explicit follows and saves are high-intent signals.
- Reviews and quotes are high-expression signals.
- Recent behavior may indicate emerging identity but should not erase long-term identity.
- Graph-near entities may inherit weak affinity only through provenance-aware derivation.
- Negative or dismissive signals must be modeled separately from missing interaction.

## Canonical Interaction Model

The target model is a canonical ledger of user-entity interactions.

Required conceptual fields:

- `uid`
- `entityType`
- `entityId`
- `interactionType`
- `sourceSurface`
- `createdAt`
- `weightClass`
- `privacyTier`
- `provenance`
- `schemaVersion`

Derived views may include:

- top entities by type
- recent entity affinities
- theme/concept profiles
- reading pathway state
- writer identity state
- MatchMaker-ready identity snapshots

## Current Gaps

- No unified `LiteraryEntityRef`.
- No canonical user-entity interaction ledger.
- Theme and Concept do not yet have canonical IDs.
- Author affinity can be string-derived in current intelligence snapshots.
- Search annotations are non-authoritative and do not mutate ranking.
- MatchMaker cannot yet consume canonical multi-entity identity pathways.

## Boundary With MatchMaker

The Literary Identity Graph owns user-entity affinity truth.

MatchMaker consumes:

- identity snapshots
- interaction summaries
- affinity distributions
- graph-near candidate contexts

MatchMaker does not own:

- raw interactions
- canonical user identity
- canonical entity identity
- canonical relationship truth
