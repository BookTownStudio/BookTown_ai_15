---
id: BT-DOCS-ARCHITECTURE-ENGINEERING-ENTITY-ENGINEERING-ROADMAP
title: BT-ENTITY-ENGINEERING-ROADMAP-001
status: draft
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

# BT-ENTITY-ENGINEERING-ROADMAP-001

Title:
Literary Entity Platform Engineering Roadmap

Status:
Engineering Planning

Mode:
Read Only

Authority:

- LITERARY_ENTITY_ROADMAP.md
- ENTITY_PLATFORM_VISION.md
- ENTITY_REGISTRY.md
- ENTITY_GRAPH.md
- LITERARY_IDENTITY_GRAPH.md
- MATCHMAKER_ENTITY_LAYER.md
- LITERARY_ENTITY_CONTRACTS.md

Purpose:

Translate Entity Platform architecture and contracts into executable engineering phases.

This document does not define implementation tickets.

It defines engineering waves, dependencies, sequencing, and rollout strategy.

---

# Executive Summary

BookTown architecture is now sufficiently mature to begin contract-driven evolution toward a Literary Entity Platform.

Current state:

- Work-centric
- Entity-aware
- Graph-capable
- MatchMaker-preparatory

Target state:

- Entity-native
- Graph-native
- Identity-native
- MatchMaker-native

The roadmap follows a non-destructive adoption model:

Contracts
→ Wrappers
→ Adapters
→ Adoption
→ Migration
→ Optimization

No Big Bang rewrites.

No platform resets.

---

# Guiding Principles

## Principle 1

Backward compatibility first.

Existing:

- bookId
- authorId
- quoteId
- publicationId
- editionId

remain operational during transition.

---

## Principle 2

Introduce contracts before replacing systems.

---

## Principle 3

Wrap before migrate.

---

## Principle 4

Entity Platform evolves beneath existing product surfaces.

Users should experience minimal disruption.

---

## Principle 5

MatchMaker adoption occurs last.

MatchMaker consumes the platform.

It does not define it.

---

# Wave 1

## Contract Foundation

Priority:
P0

Objective:

Introduce platform contracts.

No behavior changes.

No storage changes.

No migrations.

---

### Deliverables

LiteraryEntityRef

EntitySummary

GraphEntityReference

UserEntityInteraction

Affinity

Pathway

Discovery

Lifecycle

---

### Success Criteria

Contracts compile.

No product changes.

No consumer adoption required yet.

---

# Wave 2

## Boundary Wrappers

Priority:
P0

Objective:

Create compatibility adapters.

---

### Wrap

bookId

authorId

quoteId

publicationId

editionId

---

### Output

Existing systems continue operating.

New systems consume contracts.

---

### Success Criteria

Dual compatibility achieved.

---

# Wave 3

## Low-Risk Adoption

Priority:
P0

Objective:

Validate Entity Platform in low-risk systems.

---

### Targets

Social Attachments

DM Attachments

Bookmarks

Notification Entity Rendering

---

### Why

Audit shows these systems already resemble EntityRef architecture.

---

### Success Criteria

EntitySummary rendering operational.

No regressions.

---

# Wave 4

## Search Adoption

Priority:
P1

Objective:

Introduce EntitySummary into Search.

---

### Phase A

Compatibility layer

Current:

BookSearchResult

Future:

EntitySummary

---

### Phase B

Mixed entity response contracts

Support:

Work

Author

Quote

Publication

---

### Phase C

Entity-aware search rendering

---

### Success Criteria

Book search preserved.

Entity search enabled.

---

# Wave 5

## Author Promotion

Priority:
P1

Objective:

Move Authors from Navigable Entity to Graph Entity.

---

### Deliverables

AuthorRef adoption

Bibliography projection

Author graph participation

Author search participation

Author discovery participation

---

### Success Criteria

Authors become first-class graph nodes.

---

# Wave 6

## Reader Adoption

Priority:
P1

Objective:

Introduce entity-aware reading.

---

### Deliverables

WorkRef

EditionRef

Author navigation

QuoteRef integration

Entity-aware highlights

Entity-aware bookmarks

---

### High Risk

Reader continuity

Offline sync

Reading progress

---

### Success Criteria

No reading continuity regression.

---

# Wave 7

## Graph Adoption

Priority:
P1

Objective:

Transition from Work Graph to Entity Graph.

---

### Deliverables

GraphEntityReference

Relationship Contract

Typed graph traversal

Non-book nodes

---

### Supported Nodes

Work

Author

Quote

Movement

Period

Later:

Theme

Concept

Place

---

### Success Criteria

Entity traversal operational.

---

# Wave 8

## Literary Identity Graph

Priority:
P2

Objective:

Canonicalize user interactions.

---

### Deliverables

UserEntityInteraction

Affinity generation

Identity summaries

Identity evolution

---

### Sources

Reading

Reviewing

Quoting

Following

Bookmarking

Discovering

Publishing

Discussing

---

### Success Criteria

Identity becomes entity-based.

---

# Wave 9

## Theme & Concept Materialization

Priority:
P2

Objective:

Promote Themes and Concepts into entities.

---

### Deliverables

Theme authority

Concept authority

Theme registry

Concept registry

Theme summaries

Concept summaries

Theme graph

Concept graph

---

### Success Criteria

Themes and Concepts become searchable and traversable.

---

# Wave 10

## Movement, Period & Literary Place

Priority:
P2

Objective:

Complete cultural-context entities.

---

### Deliverables

Movement pages

Period pages

Literary Place authority

Graph integration

Identity integration

---

### Success Criteria

Context entities become first-class participants.

---

# Wave 11

## MatchMaker Adoption

Priority:
P3

Objective:

Transition MatchMaker from book-centric to entity-centric.

---

### Inputs

Entity Graph

Identity Graph

Affinity

Pathways

Discovery

---

### Outputs

Recommendations

Author pathways

Quote pathways

Theme pathways

Concept pathways

Reading journeys

Writing journeys

Literary insights

---

### Success Criteria

MatchMaker consumes entities rather than books.

---

# Wave 12

## Literary Intelligence Platform

Priority:
Strategic

Objective:

Achieve target architecture.

---

### Final State

Canonical Factory

↓

Entity Platform

↓

Knowledge Graph

↓

Identity Graph

↓

MatchMaker

↓

Product Surfaces

---

# Engineering Risk Ranking

## Highest Risk

Reader

Reading Progress

Graph Migration

Identity Graph

---

## Medium Risk

Search

Publications

Reviews

Shelves

---

## Lowest Risk

Attachments

Bookmarks

Notifications

DM Attachments

---

# Milestone Gates

## Gate 1

Contracts Established

---

## Gate 2

Boundary Wrappers Operational

---

## Gate 3

EntitySummary Operational

---

## Gate 4

Authors Become Graph Entities

---

## Gate 5

Entity Graph Operational

---

## Gate 6

Identity Graph Operational

---

## Gate 7

Theme & Concept Materialized

---

## Gate 8

MatchMaker Entity Adoption

---

## Gate 9

Literary Intelligence Platform Achieved

---

# Final Rule

No future subsystem may introduce a new identity model outside:

- LiteraryEntityRef
- EntitySummary
- GraphEntityReference
- UserEntityInteraction

All future entity work must conform to the Entity Platform before implementation.