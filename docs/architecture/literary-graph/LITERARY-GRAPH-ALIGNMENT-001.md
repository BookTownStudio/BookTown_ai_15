---
id: BT-DOCS-ARCHITECTURE-LITERARY-GRAPH-LITERARY-GRAPH-ALIGNMENT-001
title: LITERARY-GRAPH-ALIGNMENT-001
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# LITERARY-GRAPH-ALIGNMENT-001

Status: OPEN

Purpose

Compare the current BookTown Literary Graph implementation with the current Canonical Factory graph design and determine the path toward a single canonical Literary Graph architecture.

This document does not introduce new architecture.

Its purpose is to identify:

- Alignment
- Gaps
- Conflicts
- Ownership
- Canonical authority

Source Audits:

- CODEBASE-GRAPH-AUDIT-001
- FACTORY-AUDIT-001

---

## Section A — Entity Alignment

| Entity | BookTown | Factory | Alignment |
|----------|----------|----------|----------|
| Work | Yes | Yes | Aligned |
| Author | Yes | Partial | Partial |
| Quote | Yes | Partial | Partial |
| Shelf | Yes | No | Not Aligned |
| Character | No | No | Aligned (Future) |

---

## Section B — Relationship Alignment

| Relationship | BookTown | Factory | Alignment |
|----------|----------|----------|----------|
| influenced_by | Yes | Schema | Partial |
| same_tradition | Yes | Similar | Partial |
| same_movement | Yes | Metadata | Partial |
| historical_relation | Yes | Schema | Partial |
| philosophical_relation | Yes | Schema | Partial |

---

## Section C — Ontology Alignment

| Ontology Concept | BookTown | Factory | Alignment |
|----------|----------|----------|----------|
| Form | Yes | Yes | Aligned |
| SubForm | Yes | Yes | Aligned |
| Tradition | Yes | Yes | Aligned |
| Philosophy | SemanticRefs | Metadata | Partial |
| Civilization | SemanticRefs | Metadata | Partial |
| Historical Period | SemanticRefs | Metadata | Partial |

---

## Section D — Ownership Analysis

Current Authority:

BookTown

Owns:

- Literary Relationships
- Graph Traversal
- Connections
- Related Works

Factory

Owns:

- Canonical Identity
- Ontology
- Enrichment
- Embeddings

---

## Section E — Key Findings

### Finding 1 — BookTown is the current graph authority

BookTown currently contains the operational literary graph implementation.

This includes:

- `literary_relationships`
- `getBookSemanticGraph`
- Book Details Connections
- Related Works behavior
- Ontology-derived semantic grouping

Factory does not currently materialize graph edges.

---

### Finding 2 — Factory is the current ontology/enrichment authority

Canonical Factory currently produces:

- Canonical identity
- Ontology enrichment
- Semantic descriptors
- Embedding records
- Validation artifacts
- Runtime governance

Factory is graph-aware and graph-ready, but not yet graph-producing.

---

### Finding 3 — The systems are complementary, not competing

BookTown and Factory do not currently contain two competing graph implementations.

Instead:

- BookTown owns the active graph runtime.
- Factory owns upstream canonical enrichment.
- Factory is intended to become a future graph producer.

---

### Finding 4 — Relationship generation is the main missing bridge

The largest gap is not identity, ontology, or embeddings.

The largest gap is Factory-side relationship generation.

Until Factory produces relationship artifacts, BookTown graph expansion must rely on:

- Manual/seeded `literary_relationships`
- Existing BookTown graph APIs
- Derived ontology relationships

---

### Finding 5 — Ontology is currently metadata, not graph structure

Both systems use ontology heavily.

However, ontology concepts such as:

- Tradition
- Movement
- Philosophy
- Civilization
- Historical period
- Theme

are not yet consistently materialized as first-class graph nodes across both systems.

---

### Finding 6 — Quotes and shelves are graph-adjacent, not fully graph-integrated

Quotes and shelves exist as real BookTown entities.

However:

- Quotes are not currently modeled as `literary_relationships` edges.
- Shelves are currently membership structures, not canonical literary graph nodes.
- Factory schemas anticipate quote support, but quote graph generation is not operational.

---

### Finding 7 — Character remains future-only

Neither BookTown nor Factory currently implements Character as a dedicated graph entity.

Character search and character graph behavior should remain future architecture.

---

## Section F — Alignment Risks

### Risk 1 — Relationship Runtime Gap

BookTown currently consumes and exposes literary relationships through an operational graph implementation.

Factory currently defines relationship schemas but does not materialize relationship artifacts.

Result:

BookTown graph growth cannot yet be fully driven by Factory outputs.

Severity:
HIGH

---

### Risk 2 — Ontology-to-Graph Transition

Both systems support:

- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period

However these concepts are currently represented primarily as ontology structures and semantic references rather than consistently materialized graph nodes.

Result:

Future graph expansion may require ontology concepts to evolve into first-class graph entities.

Severity:
HIGH

---

### Risk 3 — Divergence Between Derived and Explicit Relationships

BookTown currently combines:

- Explicit persisted relationships
- Derived ontology-based relationships

Factory currently generates ontology but does not generate explicit graph relationships.

Result:

The same literary connection may exist as:

- explicit graph edge
- ontology-derived connection

creating potential duplication or inconsistency.

Severity:
MEDIUM

---

### Risk 4 — Quote Graph Incompleteness

BookTown contains:

- canonical quotes
- quote projections
- quote search

Factory contains:

- quote schemas

but neither system currently operates a fully materialized quote graph.

Result:

Quote-based discovery and graph traversal remain limited.

Severity:
MEDIUM

---

### Risk 5 — Shelf Graph Ambiguity

BookTown currently treats shelves as:

- organizational containers
- membership structures

Future architecture discussions increasingly position shelves as graph entities.

Result:

The role of shelves inside the Literary Graph remains undefined.

Severity:
MEDIUM

---

### Risk 6 — Character Entity Absence

Neither system currently supports:

- Character entities
- Character relationships
- Character graph traversal

Result:

Future character search and discovery features will require new graph structures.

Severity:
LOW

---

### Risk 7 — MatchMaker Graph Independence

MatchMaker currently operates without dependency on the literary graph.

Result:

Future MatchMaker capabilities may require graph integration that does not yet exist.

Severity:
MEDIUM

---

### Risk 8 — Factory Graph Expectations

Factory was designed with graph-oriented schemas and concepts.

Current implementation materializes:

- identity
- ontology
- enrichment
- embeddings

but not graph relationships.

Result:

Architecture discussions may incorrectly assume graph production already exists.

Severity:
HIGH

---

## Section G — Recommendations

### Recommendation 1 — Preserve BookTown as Current Graph Authority

BookTown should remain the authoritative runtime owner of the Literary Graph until Factory begins materializing relationship artifacts.

Current graph ownership includes:

- literary_relationships
- graph traversal
- Connections
- Related Works
- semantic graph APIs

Rationale:

BookTown currently contains the only operational literary graph implementation.

---

### Recommendation 2 — Preserve Factory as Canonical Intelligence Authority

Factory should remain responsible for:

- canonical identity
- ontology
- enrichment
- embeddings
- validation
- provenance

Rationale:

Factory already serves as the canonical literary intelligence layer.

---

### Recommendation 3 — Relationship Generation Becomes Factory Priority

The highest-value missing capability is relationship generation.

Future Factory outputs should eventually include:

- relationship artifacts
- influence relationships
- philosophical relationships
- historical relationships
- tradition relationships
- movement relationships

Rationale:

Relationship generation is the largest missing bridge between Factory and the BookTown Literary Graph.

---

### Recommendation 4 — Establish a Single Canonical Relationship Ontology

BookTown and Factory should ultimately share a single relationship vocabulary.

Current candidates include:

- influenced_by
- responds_to
- same_tradition
- same_movement
- historical_relation
- philosophical_relation
- thematic_affinity
- similar_theme

Rationale:

A shared ontology prevents graph divergence.

---

### Recommendation 5 — Separate Ontology from Graph Relationships

Ontology and graph relationships should remain distinct concepts.

Ontology describes:

- form
- tradition
- movement
- philosophy
- civilization
- historical period

Relationships describe:

- influence
- response
- affinity
- historical connection
- philosophical connection

Rationale:

Ontology classification and graph reasoning serve different purposes.

---

### Recommendation 6 — Treat Graph Materialization as a Future Factory Capability

Current Factory status should be recognized as:

Graph-Ready

not

Graph-Producing

Future graph generation should be treated as a dedicated Factory development phase rather than an assumed existing capability.

---

### Recommendation 7 — Defer Character Graph Architecture

Character entities should remain outside the current Literary Graph scope until:

- Work graph
- Author graph
- Quote graph
- Relationship graph

are stabilized.

Rationale:

Character architecture introduces significant complexity and is not required for current BookTown functionality.

---

### Recommendation 8 — Begin Literary Graph Governance

Future Literary Graph decisions should be recorded through:

- D-G discoveries
- Q-G questions
- P-G proposals
- ADR-G decisions

inside the Literary Graph Architecture Register.

The alignment audit should serve as the baseline authority for future graph architecture work.

Date:
2026-06-07