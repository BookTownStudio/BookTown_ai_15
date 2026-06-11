# BT-LITERARY-ENTITY-ROADMAP-001

## BookTown Literary Entity Platform Roadmap

### Status

Architecture Planning

Read Only

No Implementation

---

# Executive Summary

The Work Audit, Author Audit, and Literary Entity Audit collectively establish that BookTown has successfully built several strong individual entity systems.

However, BookTown does not yet possess a unified Literary Entity Layer.

Current architecture is best described as:

- Work-centric
- Entity-aware
- Graph-capable
- MatchMaker-preparatory

But not yet:

- Entity-native
- Graph-native
- MatchMaker-native

The next major platform milestone is therefore not a feature.

It is the creation of the Literary Entity Layer.

---

# Strategic Objective

Transform BookTown from:

Work Platform

into:

Literary Entity Platform

where every literary object becomes a first-class entity participating in:

- Navigation
- Discovery
- Search
- Social
- Reader
- Graph
- Literary Identity
- MatchMaker

---

# Current State

## Mature Entities

### Work

Current Level:
Level 3

Capabilities:

- Canonical authority
- Work-first architecture
- Invisible editions
- Search participation
- Reader participation
- Social participation
- Graph participation

---

### Author

Current Level:
Level 2

Capabilities:

- Canonical authority
- Identity mapping
- Discovery
- Follow system
- Author Details

Missing:

- Graph participation
- Search participation
- MatchMaker participation

---

### Quote

Current Level:
Level 2

Capabilities:

- Canonical identity
- Quote Details
- Social participation
- Book linkage

Missing:

- Graph participation
- Search participation
- MatchMaker participation

---

## Emerging Entities

### Publication

Current Level:
Level 2

### User Literary Identity

Current Level:
Level 1

---

## Weak Entities

### Movement

Current Level:
Level 1

### Period

Current Level:
Level 1

### Place

Current Level:
Level 1

---

## Conceptual Entities

### Theme

Current Level:
Level 0

### Concept

Current Level:
Level 0

---

# Core Architectural Problem

There is currently no unified entity contract.

Identity is fragmented across:

- bookId
- authorId
- quoteId
- publicationId
- venueId
- uid

Every subsystem treats identity differently.

This prevents:

- Cross-entity traversal
- Graph reasoning
- Identity Graph
- MatchMaker

---

# Phase 1

## Literary Entity Foundation

Priority:
P0

Objective:

Create a unified entity architecture.

---

### Deliverable 1

LiteraryEntityRef

Common identity contract for:

- Work
- Author
- Quote
- Publication
- Movement
- Period
- Place
- Theme
- Concept

---

### Deliverable 2

Entity Type Registry

Supported entity types:

- work
- author
- quote
- publication
- movement
- period
- place
- theme
- concept

---

### Deliverable 3

Entity Summary Model

Common display contract:

- id
- type
- title
- subtitle
- image
- language
- authority

---

### Deliverable 4

Entity Ownership Rules

Define:

- Authority
- Lifecycle
- Resolution
- Canonicalization

for every entity type.

---

# Phase 2

## Canonical Entity Authority

Priority:
P0

Objective:

Normalize all existing systems around entity references.

---

### Systems

Search

Reader

Reviews

Quotes

Shelves

Bookmarks

Attachments

Publications

Social

Notifications

Discovery

---

### Goal

Every system consumes entity references.

No system depends on display strings.

---

# Phase 3

## Entity Graph

Priority:
P1

Objective:

Replace book-centric graphing.

Current:

Book → Book

Future:

Entity → Entity

---

### Target Relationships

Work ↔ Author

Work ↔ Quote

Work ↔ Theme

Work ↔ Concept

Work ↔ Movement

Work ↔ Period

Work ↔ Place

Author ↔ Author

Author ↔ Theme

Author ↔ Concept

Author ↔ Movement

Author ↔ Period

Author ↔ Place

Quote ↔ Theme

Quote ↔ Concept

Theme ↔ Concept

Movement ↔ Period

Place ↔ Period

---

### Outcome

Every entity becomes traversable.

---

# Phase 4

## Literary Identity Graph

Priority:
P1

Objective:

Move from book activity tracking to entity affinity tracking.

---

### Current

User

↓

Books

---

### Future

User

↓

Works

Authors

Quotes

Themes

Concepts

Movements

Periods

Places

Publications

---

### Outcome

BookTown begins modeling literary identity.

---

# Phase 5

## Entity Discovery Layer

Priority:
P1

Objective:

Enable mixed-entity discovery.

---

### Search

Current:

Books

Future:

Books

Authors

Quotes

Themes

Concepts

Movements

Periods

Places

Publications

---

### Discovery

Current:

Book-first

Future:

Entity-first

---

# Phase 6

## Reader Entity Navigation

Priority:
P2

Objective:

Allow Reader to become an entry point into the graph.

---

### Examples

Author

Quote

Theme

Concept

Movement

Period

Place

---

### Outcome

Reading becomes graph exploration.

---

# Phase 7

## Author Promotion Program

Priority:
P2

Objective:

Promote Authors from canonical entities to graph entities.

---

### Deliverables

Author Graph

Author Similarity

Author Influence

Author Pathways

Author Discovery

Author Reputation

Author Literary Identity

---

### Result

Author reaches Level 4.

---

# Phase 8

## Theme & Concept Materialization

Priority:
P2

Objective:

Convert themes and concepts from metadata into entities.

---

### Deliverables

Canonical Theme Authority

Canonical Concept Authority

Theme Pages

Concept Pages

Theme Search

Concept Search

Theme Graph

Concept Graph

---

### Result

Themes and Concepts become first-class citizens.

---

# Phase 9

## MatchMaker Entity Layer

Priority:
P3

Objective:

Enable MatchMaker to reason over entities.

---

### Inputs

Works

Authors

Quotes

Themes

Concepts

Movements

Periods

Places

Publications

Identity Graph

---

### Outputs

Recommendations

Pathways

Influences

Resonance

Discovery

Intellectual Journeys

---

### Result

MatchMaker becomes a Literary Intelligence System.

---

# Phase 10

## Literary Intelligence Platform

Priority:
Strategic

Objective:

Achieve BookTown's target architecture.

---

### Final State

Canonical Literary Knowledge Graph

+

Literary Identity Graph

+

MatchMaker Intelligence Layer

+

Unified Literary Entity Layer

---

# Recommended Execution Order

1. LiteraryEntityRef
2. Entity Registry
3. Canonical Entity Authority
4. Entity Graph
5. Literary Identity Graph
6. Mixed Entity Search
7. Author Promotion
8. Theme & Concept Materialization
9. MatchMaker Entity Layer
10. Literary Intelligence Platform

---

# Success Criteria

BookTown should be considered a Literary Entity Platform when:

- Every literary object is a first-class entity.
- Every entity possesses canonical authority.
- Every entity participates in navigation.
- Every entity participates in discovery.
- Every entity participates in the graph.
- Every entity participates in identity formation.
- MatchMaker reasons over entities rather than books.
- Literary pathways can traverse the entire graph.

Only then will BookTown fully transition from a book application into a literary intelligence platform.