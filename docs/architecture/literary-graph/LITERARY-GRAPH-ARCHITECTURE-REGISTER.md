---
id: BT-DOCS-ARCHITECTURE-LITERARY-GRAPH-LITERARY-GRAPH-ARCHITECTURE-REGISTER
title: "BookTown Literary Graph Architecture Register"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Literary Graph Architecture Register

Purpose

This document serves as the authoritative register for the BookTown Literary Graph.

The Literary Graph is a foundational architecture domain that powers:

- Search
- Connections
- Related Works
- Quotes
- Shelves
- Recommendations
- MatchMaker
- Future AI systems

The purpose of this register is to document discoveries, audits, questions, proposals, and locked decisions related to the Literary Graph.

The register is intended to prevent architectural drift between:

- BookTown Application
- Canonical Factory
- MatchMaker
- Future Literary Intelligence Systems

---

Authority Order

1. Locked ADRs (highest authority)
2. Verified Discoveries
3. Audit Results
4. Open Questions
5. Proposals

When conflicts occur, higher authority items supersede lower authority items.

---

Scope

This register governs:

- Literary entities
- Literary relationships
- Ontology
- Graph structure
- Graph storage
- Graph consumers
- Graph producers
- Graph alignment

This register does not govern:

- Search UX
- Reader UX
- Writing UX
- Social UX

Those domains maintain their own architecture registers.

---

Design Principle

The Literary Graph is a shared foundational layer.

Search, MatchMaker, Recommendations, Connections, Related Works, and future systems consume the graph but do not own it.

The graph should have a single canonical architecture and source of truth.

---

Register Structure

### Literary Graph Audits

# LITERARY-GRAPH-AUDIT-001

Status: OPEN

Title:
Codebase Graph vs Canonical Factory Graph Alignment Audit

Goal:
Determine whether the existing BookTown codebase graph and Canonical Factory graph are aligned and capable of supporting a single canonical Literary Graph architecture.

The purpose of this audit is to identify existing graph structures, prevent architectural drift, and establish a common foundation for future graph development.

Scope:

1. BookTown Codebase Graph
2. Canonical Factory Graph
3. Graph Consumers
4. Graph Producers
5. Ontology
6. Relationships
7. Storage Models

Deliverables:

## A. Current Codebase Graph

Document:

- Entities
- Relationships
- Ontology
- Storage
- Retrieval Paths
- Graph Consumers

Examples:

- Search
- Book Details
- Recommendations
- Semantic Navigation

---

## B. Current Canonical Factory Graph

Document:

- Entities
- Relationships
- Ontology
- Artifact Schema
- Classification Systems
- Intended Outputs

---

## C. Alignment Matrix

Compare:

- Entities
- Relationships
- Ontology
- Naming
- Storage
- Semantics

Identify:

- Matching structures
- Missing structures
- Divergent structures

---

## D. Conflicts

Identify:

- Naming conflicts
- Relationship conflicts
- Ontology conflicts
- Structural conflicts

---

## E. Recommendations

Recommend:

- Canonical entities
- Canonical relationships
- Canonical ontology
- Canonical storage model

---

Success Criteria:

The audit should determine:

1. What graph exists in the BookTown codebase today.
2. What graph exists in Canonical Factory today.
3. Whether they are aligned.
4. What must be changed to establish a single canonical Literary Graph.

Source:
Architecture Discussion

Date:
2026-06-07
---

### Verified Discoveries

D-G-001
D-G-002
D-G-003

---

### Open Questions

### Q-G-001
Status: OPEN

Question:
What is the canonical source of truth for literary relationships?

Context:

Current audits show that BookTown contains the operational literary relationship layer through:

- literary_relationships
- graph traversal
- Connections
- Related Works

Current audits also show that Canonical Factory contains:

- relationship schemas
- graph schemas
- graph ontology

but does not currently materialize relationship artifacts.

The future architecture must determine:

- Where literary relationships are authored
- Where literary relationships are validated
- Where literary relationships are stored
- Which system acts as the authoritative source of truth

Potential models include:

A. BookTown Authority

Factory generates recommendations.
BookTown owns relationship truth.

B. Factory Authority

Factory generates relationship truth.
BookTown consumes relationship artifacts.

C. Hybrid Authority

Factory generates candidate relationships.
BookTown validates and materializes authoritative relationships.

The objective is to prevent relationship duplication, divergence, and competing graph authorities.

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
LITERARY-GRAPH-ALIGNMENT-001

### Q-G-002
Status: OPEN

Question:
What are the first-class entities of the BookTown Literary Graph?

Context:

Current audits reveal the existence of multiple literary structures across BookTown and Canonical Factory.

Some structures already exist as materialized entities.

Others currently exist as ontology metadata.

The Literary Graph must determine which concepts become first-class graph entities and which remain metadata.

Candidate entities include:

Implemented:
- Work
- Author
- Quote
- Shelf

Future:
- Character

Ontology Candidates:
- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period
- Theme
- Concept

The decision impacts:

- Search
- Connections
- Related Works
- MatchMaker
- Canonical Factory
- Graph traversal
- AI reasoning

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
LITERARY-GRAPH-ALIGNMENT-001

### Q-G-003
Status: OPEN

Question:
What are the canonical first-class node types of the BookTown Literary Graph?

Context:

The Literary Graph requires a stable set of node types that can participate in graph relationships and traversal.

Current audits reveal existing and planned entities across BookTown and Canonical Factory.

Potential node types include:

Literary Nodes:
- Work
- Author
- Quote
- Shelf
- Character

Ontology Nodes:
- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period
- Theme
- Concept

The graph architecture must determine:

- Which node types are first-class entities
- Which node types may participate in relationships
- Which node types remain metadata
- Which node types are deferred

This decision will influence:

- Search
- Connections
- Related Works
- MatchMaker
- Canonical Factory
- Future AI systems

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
LITERARY-GRAPH-ALIGNMENT-001
P-G-003

### Q-G-004
Status: RESOLVED

Question:
Should BookTown support typed relationships as first-class graph entities?

Resolution:
BookTown will support typed relationships as first-class graph entities.

Relationships are not generic connections. Every graph relationship must express a specific literary meaning.

Examples include:

- influenced_by
- responds_to
- same_tradition
- same_movement
- philosophical_relation
- historical_relation
- thematic_affinity
- similar_theme

Typed relationships support:

- Explainable Connections
- Related Works
- Search
- MatchMaker
- Semantic Navigation
- Future AI reasoning

Source:
Architecture Discussion
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001

### Q-G-005
Status: OPEN

Question:
What are the first-class node and relationship types of the Literary Identity Graph?

Context:

The Literary Identity Graph models the literary evolution of a reader and writer.

Potential node types include:

- Reader
- Writer
- Work
- Author
- Quote
- Shelf
- Theme
- Concept

Potential relationship types include:

- reads
- started
- finished
- abandoned
- rereads
- quotes
- writes
- follows
- bookmarks
- recommends
- reviews

The Identity Graph should capture not only what a user reads, but how they read, write, think, and evolve over time.

The decision impacts:

- MatchMaker
- Recommendations
- Reading Insights
- Writing Insights
- Literary Growth Tracking
- Future AI Systems

Source:
P-G-006
Architecture Discussion

### Q-G-006
Status: OPEN

Question:
What constitutes a literary identity in BookTown?

Context:

The Literary Identity Graph is intended to model a reader and writer rather than simply record actions.

Actions such as:

- reading a book
- finishing a book
- quoting a passage
- following an author
- writing a review
- writing original work

are observable events.

The Literary Identity Graph must determine:

- Which events contribute to identity formation
- Which traits emerge from accumulated behavior
- Which signals represent temporary interests
- Which signals represent enduring literary characteristics

Potential identity dimensions include:

Reading Identity:
- Preferred forms
- Preferred traditions
- Preferred movements
- Preferred themes
- Reading depth
- Reading diversity

Writing Identity:
- Genres written
- Themes explored
- Concepts explored
- Stylistic tendencies

Thinking Identity:
- Concepts engaged with
- Philosophical interests
- Intellectual curiosity
- Literary evolution

The objective is to distinguish between:

User Activity

and

Literary Identity

Source:
P-G-006
BookTown Vision
Read → Write → Think

### Q-G-007
Status: OPEN

Question:
What is MatchMaker actually matching?

Potential models:

A. User → Book

Traditional recommendation systems.

B. User Identity → Work

Match a literary identity to a work.

C. User Identity → Literary Graph Region

Match a user to a cluster of works, authors, concepts, traditions, and ideas.

D. User Identity → Future Identity

Recommend literature that helps a user evolve toward unexplored areas of the graph.

The decision affects:

- Recommendations
- Discovery
- Reading journeys
- Writing journeys
- Literary growth
- AI Librarian
- Long-term BookTown differentiation

Source:
P-G-006
P-G-007
Architecture Discussion

### Q-G-008
Status: OPEN

Question:
What is the output of MatchMaker?

Context:

MatchMaker aligns the Literary Identity Graph and the Literary Knowledge Graph.

The architecture must determine what MatchMaker actually produces.

Possible outputs include:

- Books
- Authors
- Quotes
- Shelves
- Themes
- Concepts
- Literary pathways
- Reading journeys
- Writing journeys
- Identity insights

The decision determines whether MatchMaker functions primarily as:

A. A recommendation engine

B. A literary discovery engine

C. A literary growth engine

D. A literary intelligence engine

The objective is to determine the primary role of MatchMaker within the BookTown ecosystem.

Source:
P-G-006
BookTown Vision
Read → Write → Think

### Q-G-009
Status: OPEN

Question:
Should MatchMaker optimize for similarity or growth?

Option A:
Similarity

Recommend things most similar to the user's current identity.

Option B:
Growth

Recommend things that help the user expand beyond their current identity.

Option C:
Balanced

Combine familiarity and exploration.

Context:

Most recommendation systems optimize for similarity.

BookTown's vision may require optimization for literary growth rather than merely reinforcing existing preferences.

Source:
P-G-008
Architecture Discussion

---

### Proposals

### P-G-001
Status: UNDER DISCUSSION

Proposal:
BookTown and Canonical Factory participate in a single Literary Graph architecture with distinct responsibilities.

BookTown serves as the current runtime Literary Graph authority.

Current responsibilities include:

- Literary relationship storage
- Graph traversal
- Connections
- Related Works
- Semantic graph APIs
- Graph presentation

Canonical Factory serves as the current Literary Intelligence authority.

Current responsibilities include:

- Canonical identity
- Ontology enrichment
- Semantic descriptors
- Embeddings
- Validation
- Provenance

The long-term architecture should allow Canonical Factory to evolve into a graph-producing system while preserving a single canonical Literary Graph architecture.

Future graph outputs produced by Factory should integrate with the BookTown Literary Graph rather than creating an independent graph implementation.

The objective is a unified Literary Graph architecture shared across:

- BookTown
- Canonical Factory
- MatchMaker
- Future AI systems

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
LITERARY-GRAPH-ALIGNMENT-001

### P-G-002
Status: UNDER DISCUSSION

Proposal:
Canonical Factory should become the primary producer of literary relationship candidates.

Relationship candidates may include:

- influenced_by
- responds_to
- same_tradition
- same_movement
- historical_relation
- philosophical_relation
- thematic_affinity
- similar_theme

Factory should generate:

- source entity
- target entity
- relationship type
- confidence
- reasoning
- provenance

BookTown should remain responsible for:

- relationship materialization
- relationship storage
- graph traversal
- graph presentation

The authoritative runtime literary graph remains the BookTown Literary Graph.

Factory acts as the literary intelligence layer that proposes graph relationships.

This model establishes:

Factory = Graph Intelligence

BookTown = Graph Runtime

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
LITERARY-GRAPH-ALIGNMENT-001
Architecture Discussion

### P-G-003
Status: UNDER DISCUSSION

Proposal:
The BookTown Literary Graph should support ontology concepts as first-class graph entities rather than treating them exclusively as metadata.

Initial ontology graph entities should include:

- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period

Future ontology graph entities may include:

- Theme
- Concept

Ontology graph entities enable:

- Semantic traversal
- Literary discovery
- Explainable connections
- Related Works
- Search expansion
- MatchMaker reasoning

Classification metadata such as:

- Form
- SubForm
- Mood
- Confidence

should remain ontology attributes rather than graph entities.

Source:
LITERARY-GRAPH-ALIGNMENT-001
Architecture Discussion

### P-G-004
Status: UNDER DISCUSSION

Proposal:
The BookTown Literary Graph should be organized into node families rather than treating all nodes as a single undifferentiated entity set.

Initial node families:

### P-G-005
Status: UNDER DISCUSSION

Proposal:
The BookTown Literary Graph should use a governed relationship taxonomy composed of typed literary relationships.

Relationships are first-class graph structures and must explicitly express the nature of a connection between nodes.

Initial relationship candidates include:

Influence Relationships:
- influenced_by
- influenced

Response Relationships:
- responds_to
- literary_response_to

Tradition Relationships:
- same_tradition

Movement Relationships:
- same_movement

Historical Relationships:
- historical_relation
- contemporary_of
- same_period

Philosophical Relationships:
- philosophical_relation

Thematic Relationships:
- thematic_affinity
- similar_theme

Structural Relationships:
- same_cycle
- same_form
- same_subform

Future relationship types may be added through Literary Graph governance.

All relationship types should be shared across:

- BookTown
- Canonical Factory
- MatchMaker
- Future AI systems

A single relationship vocabulary should exist throughout the BookTown ecosystem.

Source:
CODEBASE-GRAPH-AUDIT-001
FACTORY-AUDIT-001
P-G-002
Q-G-004

### P-G-006
Status: UNDER DISCUSSION

Proposal:
BookTown shall maintain two distinct but interoperable graph systems:

1. Literary Knowledge Graph
2. Literary Identity Graph

The Literary Knowledge Graph models literature itself.

Examples:

- Works
- Authors
- Quotes
- Traditions
- Movements
- Philosophies
- Civilizations
- Historical Periods
- Themes
- Concepts

The Literary Identity Graph models the evolving literary identity of a user.

Examples:

- Reading behavior
- Writing behavior
- Quoting behavior
- Shelf behavior
- Discovery behavior
- Literary interests
- Literary evolution

The Literary Knowledge Graph exists independently of any user.

The Literary Identity Graph is unique to each user and evolves over time.

Both graphs are living systems.

The Literary Knowledge Graph evolves as new works, authors, quotes, relationships, ontology, embeddings, and literary intelligence are added.

The Literary Identity Graph evolves as the user reads, writes, quotes, reviews, shelves, searches, engages, and changes over time.

MatchMaker operates as the intelligence layer that compares, aligns, and traverses both graphs.

MatchMaker continuously evaluates the relationship between a user's evolving literary identity and BookTown's evolving understanding of literature.

MatchMaker may generate:

- Recommendations
- Discoveries
- Literary pathways
- Reading insights
- Writing insights
- Personalized exploration

MatchMaker does not simply recommend books.

Its purpose is to identify meaningful literary pathways between a user's evolving identity and the Literary Knowledge Graph.

The objective is to match people to literature rather than merely matching books to books.

The long-term objective is to understand not only what a user has read, written, or engaged with, but who that user is becoming as a reader, writer, and thinker.

Source:
Architecture Discussion
BookTown Vision
Read → Write → Think
LITERARY-GRAPH-ALIGNMENT-001

### P-G-007
Status: UNDER DISCUSSION

Proposal:
A Literary Identity is an emergent structure derived from behavior rather than a profile field explicitly assigned to a user.

Literary Identity should be inferred from accumulated signals across the Literary Identity Graph.

Sources may include:

Reading Signals:
- Books read
- Books finished
- Books abandoned
- Books reread
- Reading duration
- Reading patterns

Writing Signals:
- Original writing
- Drafts
- Published works
- Themes explored
- Concepts explored

Engagement Signals:
- Quotes saved
- Quotes shared
- Reviews written
- Shelves created
- Authors followed

Discovery Signals:
- Searches performed
- Recommendations accepted
- Recommendations rejected
- Exploration pathways

Literary Identity should not be represented as a single label.

Instead it should be modeled as a dynamic, evolving structure composed of multiple dimensions.

Examples:

Reading Identity
Writing Identity
Thinking Identity

Identity dimensions may strengthen, weaken, emerge, or disappear over time.

MatchMaker should operate primarily on Literary Identity rather than raw user activity.

The objective is to understand who a reader and writer is becoming rather than merely recording what they have done.

Source:
Q-G-005
Q-G-006
BookTown Vision
Read → Write → Think

### P-G-008
Status: UNDER DISCUSSION

Proposal:
MatchMaker should be designed as a Literary Intelligence Engine rather than solely as a recommendation engine.

Recommendations remain an important capability, but they are not the primary purpose of MatchMaker.

MatchMaker aligns the Literary Identity Graph and the Literary Knowledge Graph in order to generate meaningful literary pathways.

MatchMaker outputs may include:

### P-G-009
Status: UNDER DISCUSSION

Proposal:
MatchMaker should optimize for literary growth through guided adjacency rather than pure similarity.

MatchMaker should not operate solely as a similarity engine.

Likewise, MatchMaker should not prioritize exploration so aggressively that recommendations become disconnected from a user's literary identity.

Instead, MatchMaker should identify adjacent literary territory.

Adjacent territory may include:

- Related works
- Related authors
- Related themes
- Related concepts
- Related traditions
- Related movements
- Related philosophies
- Related historical periods

Recommendations should balance:

### Familiarity

Content closely aligned with the user's current Literary Identity.

### Exploration

Content connected to neighboring regions of the Literary Knowledge Graph.

The objective is to help users expand their literary horizons while maintaining relevance and trust.

MatchMaker should seek to answer:

"What is the most meaningful next step from where this user is today?"

rather than:

"What is most similar to what this user already likes?"

The long-term goal is to support literary growth, intellectual curiosity, and personal evolution.

Source:
P-G-008
Q-G-009
BookTown Vision
Read → Write → Think
Architecture Discussion

---

### Recommendations

Examples:

- Books
- Authors
- Quotes
- Shelves

### Discovery

Examples:

- Themes
- Concepts
- Traditions
- Movements
- Philosophies

### Literary Pathways

Examples:

- Reading journeys
- Author journeys
- Concept journeys
- Intellectual pathways

### Literary Growth

Examples:

- Emerging interests
- Unexplored neighboring domains
- Reading diversification
- Writing development

### Literary Intelligence

Examples:

- Identity insights
- Literary evolution
- Reading patterns
- Writing patterns
- Long-term intellectual trajectories

MatchMaker should seek to answer:

- What should this user read next?
- What ideas is this user exploring?
- What intellectual territory is this user approaching?
- How is this user changing over time?
- What meaningful literary pathway exists between the user's current identity and future identity?

The primary objective of MatchMaker is not recommendation.

The primary objective is literary understanding.

Recommendation becomes one expression of that understanding.

Source:
P-G-006
Q-G-008
BookTown Vision
Read → Write → Think
Architecture Discussion

---


### Literary Layer

Represents literary works and literary artifacts.

Entities:

- Work
- Author
- Quote
- Shelf

Future:

- Character

### Knowledge Layer

Represents intellectual, historical, philosophical, and cultural structures that connect literary works.

Entities:

- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period

Future:

- Theme
- Concept

The Literary Layer represents what people create, read, write, collect, and discuss.

The Knowledge Layer represents the intellectual context that explains relationships between literary entities.

Relationships may exist:

- Within a layer
- Across layers

Examples:

Work → Work
Author → Author
Work → Tradition
Work → Philosophy
Author → Movement
Quote → Concept

This structure provides a scalable foundation for:

- Search
- Connections
- Related Works
- MatchMaker
- Semantic Navigation
- Future AI reasoning

Source:
Architecture Discussion
P-G-003
LITERARY-GRAPH-ALIGNMENT-001

---

### Architecture Decision Records

### ADR-G-001

Decision:
BookTown adopts a Dual Graph Architecture composed of:

1. Literary Knowledge Graph
2. Literary Identity Graph

The Literary Knowledge Graph models literature itself.

Examples include:

- Works
- Authors
- Quotes
- Traditions
- Movements
- Philosophies
- Civilizations
- Historical Periods
- Themes
- Concepts

The Literary Knowledge Graph exists independently of any user and evolves as literature, ontology, relationships, and literary intelligence evolve.

The Literary Identity Graph models the evolving literary identity of an individual user.

Examples include:

- Reading behavior
- Writing behavior
- Quoting behavior
- Shelf behavior
- Discovery behavior
- Literary interests
- Literary evolution

The Literary Identity Graph is unique to each user and evolves continuously through interaction with the platform.

Both graphs are living systems.

MatchMaker operates as the intelligence layer between them.

MatchMaker compares, aligns, and traverses both graphs in order to generate:

- Recommendations
- Discoveries
- Literary pathways
- Reading insights
- Writing insights
- Literary intelligence

The primary objective of MatchMaker is not recommendation.

The primary objective is literary understanding.

Recommendations are one expression of that understanding.

MatchMaker should optimize for literary growth through guided adjacency rather than pure similarity.

The objective is to identify meaningful neighboring regions of the Literary Knowledge Graph that support the user's ongoing development as a reader, writer, and thinker.

BookTown's long-term objective is to understand not only what a user has read, but who that user is becoming.

Related References:

- P-G-001
- P-G-002
- P-G-003
- P-G-004
- P-G-005
- P-G-006
- P-G-007
- P-G-008
- P-G-009

Status:
LOCKED

Date:
2026-06-09

### ADR-G-002

Decision:
BookTown adopts a Relationship Authority Model based on a separation between Graph Intelligence and Graph Runtime.

Canonical Factory serves as the Graph Intelligence layer.

BookTown serves as the Graph Runtime layer.

### Canonical Factory Responsibilities

Canonical Factory is responsible for:

- Canonical identity
- Ontology enrichment
- Semantic descriptors
- Embeddings
- Relationship candidate generation
- Relationship reasoning
- Confidence scoring
- Provenance generation

Factory may generate candidate literary relationships including:

- influenced_by
- influenced
- responds_to
- literary_response_to
- same_tradition
- same_movement
- historical_relation
- philosophical_relation
- thematic_affinity
- similar_theme

Factory relationship outputs are proposals rather than authoritative graph truth.

### BookTown Responsibilities

BookTown is responsible for:

- Relationship materialization
- Relationship storage
- Graph traversal
- Graph presentation
- Connections
- Related Works
- Search integration
- MatchMaker integration

BookTown maintains the authoritative runtime Literary Graph.

### Relationship Lifecycle

Factory
↓
Relationship Candidate
↓
Confidence
↓
Reasoning
↓
Provenance
↓
BookTown Ingestion
↓
Authoritative Relationship
↓
Literary Graph

Only relationships accepted into the BookTown Literary Graph become graph truth.

### Objectives

This model provides:

- A single runtime graph authority
- A single literary intelligence authority
- Explainable relationships
- Provenance tracking
- Prevention of competing graph implementations

The objective is to ensure that Canonical Factory and BookTown operate as complementary systems within a single Literary Graph architecture.

Related References:

- CODEBASE-GRAPH-AUDIT-001
- FACTORY-AUDIT-001
- LITERARY-GRAPH-ALIGNMENT-001
- P-G-001
- P-G-002
- ADR-G-001

Status:
LOCKED

Date:
2026-06-09

### ADR-G-003

Decision:
The BookTown Literary Graph adopts a governed Node Taxonomy composed of distinct node families.

Node families organize graph entities according to their role within the BookTown ecosystem.

## Literary Layer

The Literary Layer represents literary works and literary artifacts.

First-class nodes:

- Work
- Author
- Quote
- Shelf

Future nodes:

- Character

The Literary Layer represents the primary objects that users read, write, collect, discuss, and discover.

---

## Knowledge Layer

The Knowledge Layer represents intellectual, historical, cultural, and philosophical structures that provide context for literature.

First-class nodes:

- Tradition
- Movement
- Philosophy
- Civilization
- Historical Period

Future nodes:

- Theme
- Concept

Knowledge Layer nodes provide explainable pathways between literary entities and support semantic discovery, search expansion, graph traversal, and literary intelligence.

---

## Identity Layer

The Identity Layer represents the evolving literary identity of an individual user.

First-class nodes:

- Reader
- Writer

Identity nodes are unique to each user and evolve over time through reading, writing, quoting, reviewing, shelving, searching, and discovery behavior.

The Identity Layer forms the foundation of the Literary Identity Graph.

---

## Future Context Layer

The Context Layer represents external contextual entities that may enrich literary understanding.

Potential future nodes:

- Place
- Event

Context nodes are deferred until future graph phases.

---

## Relationship Rules

Relationships may exist:

Within a layer:

- Work → Work
- Author → Author
- Theme → Theme

Across layers:

- Work → Philosophy
- Author → Movement
- Quote → Concept
- Reader → Work
- Writer → Theme

The graph is not limited to a single layer and supports traversal across the entire literary ecosystem.

---

## Governance

New node types may only be introduced through Literary Graph governance.

Node additions must demonstrate:

- Long-term stability
- Reusability
- Literary significance
- MatchMaker value
- Search value
- Graph value

The objective is to maintain a coherent and explainable Literary Graph architecture.

Related References:

- ADR-G-001
- ADR-G-002
- P-G-003
- P-G-004
- P-G-006
- P-G-007

Status:
LOCKED

Date:
2026-06-09

### ADR-G-004

Decision:
The BookTown Literary Graph adopts a governed Relationship Taxonomy based on typed relationships.

All relationships must explicitly express literary meaning.

Generic or unlabeled graph connections are not permitted.

Relationships are first-class graph structures and represent the semantic pathways that connect entities throughout the BookTown ecosystem.

---

## Influence Relationships

Used when one entity meaningfully influences another.

Relationship Types:

- influenced_by
- influenced

Examples:

Kafka influenced_by Dostoevsky

Camus influenced_by Kafka

---

## Response Relationships

Used when a work, author, or idea responds to another.

Relationship Types:

- responds_to
- literary_response_to

Examples:

Work A responds_to Work B

Author A literary_response_to Author B

---

## Tradition Relationships

Used when entities belong to the same literary tradition.

Relationship Types:

- same_tradition

Examples:

The Trial same_tradition The Stranger

---

## Movement Relationships

Used when entities belong to the same literary movement.

Relationship Types:

- same_movement

Examples:

Mrs Dalloway same_movement Ulysses

---

## Historical Relationships

Used when entities share historical context.

Relationship Types:

- historical_relation
- same_period
- contemporary_of

Examples:

Author A contemporary_of Author B

Work A same_period Work B

---

## Philosophical Relationships

Used when entities share philosophical foundations.

Relationship Types:

- philosophical_relation

Examples:

The Myth of Sisyphus philosophical_relation Thus Spoke Zarathustra

---

## Thematic Relationships

Used when entities share important themes or concepts.

Relationship Types:

- thematic_affinity
- similar_theme

Examples:

The Trial thematic_affinity Notes from Underground

---

## Structural Relationships

Used when entities share literary structure or form.

Relationship Types:

- same_cycle
- same_form
- same_subform

Examples:

Work A same_form Work B

---

## Identity Relationships

Used within the Literary Identity Graph.

Examples include:

- reads
- started
- finished
- abandoned
- rereads
- quotes
- writes
- reviews
- shelves
- follows
- discovers

Identity relationships model literary behavior rather than literary knowledge.

These relationships belong to the Literary Identity Graph and are distinct from Literary Knowledge Graph relationships.

---

## Governance

All relationship types must:

- Have explicit literary meaning
- Be explainable to users
- Support graph traversal
- Support MatchMaker reasoning
- Support search and discovery

New relationship types may only be added through Literary Graph governance.

---

## Objectives

The Relationship Taxonomy provides:

- Explainable literary connections
- Consistent graph semantics
- Shared vocabulary across Factory and BookTown
- MatchMaker compatibility
- Search compatibility
- Future AI compatibility

The objective is to ensure that every graph connection communicates meaningful literary context.

Related References:

- ADR-G-001
- ADR-G-002
- ADR-G-003
- P-G-005
- Q-G-004

Status:
LOCKED

Date:
2026-06-09

---

### Change Log

Date
Change
Reason
Decision Reference