# MATCHMAKER-ARCHITECTURE-REGISTER

Purpose

This register serves as the architectural authority for MatchMaker, the proprietary intelligence layer of BookTown.

MatchMaker originated from the idea that meaningful literary recommendations require understanding both the book and the reader as individuals and then matching them accordingly.

As BookTown evolved, this concept expanded beyond recommendation into a broader Literary Intelligence architecture.

MatchMaker is not a recommendation engine, a search engine, or a standalone LLM.

MatchMaker operates between two living systems:

1. Literary Knowledge Graph
2. Literary Identity Graph

The Literary Knowledge Graph models literature itself and evolves as new works, authors, quotes, relationships, ontology, and literary intelligence are added.

The Literary Identity Graph models the evolving literary identity of each user and changes through reading, writing, quoting, reviewing, shelving, searching, discovery, and engagement.

MatchMaker continuously aligns these two living graphs in order to understand:

- Literature
- Readers
- Writers
- Ideas
- Intellectual pathways
- Literary evolution

The objective of MatchMaker is not simply to recommend books.

The objective is to help people discover meaningful literary pathways and support their growth as readers, writers, and thinkers.

Recommendations are one expression of that understanding.

This register governs:

- MatchMaker architecture
- Identity modeling
- Literary intelligence
- Recommendation philosophy
- Discovery systems
- Reading pathways
- Writing pathways
- Literary growth systems
- Future AI reasoning systems

All MatchMaker discoveries, questions, proposals, and architecture decisions must be recorded here.

Structure:

- D-M = Discoveries
- Q-M = Questions
- P-M = Proposals
- ADR-M = Architecture Decision Records

Related Authorities:

- SEARCH-ARCHITECTURE-REGISTER
- LITERARY-GRAPH-ARCHITECTURE-REGISTER

Status:
ACTIVE

Date:
2026-06-09

---

### P-M-001
Status: UNDER DISCUSSION

Proposal:
MatchMaker should operate as a Literary Intelligence Layer positioned between the Literary Knowledge Graph and the Literary Identity Graph.

MatchMaker is not a recommendation engine.

MatchMaker is not a search engine.

MatchMaker is not an LLM.

MatchMaker is the system responsible for understanding relationships between:

- Literature
- Readers
- Writers
- Ideas
- Intellectual pathways

MatchMaker continuously observes:

### Literary Knowledge Graph

Including:

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

### Literary Identity Graph

Including:

- Reading behavior
- Writing behavior
- Quoting behavior
- Reviews
- Shelves
- Discovery patterns
- Literary evolution

MatchMaker aligns both graphs in order to generate:

- Recommendations
- Discoveries
- Literary pathways
- Reading insights
- Writing insights
- Identity insights

The primary purpose of MatchMaker is literary understanding.

Recommendations are one expression of that understanding.

Source:
ADR-G-001
ADR-G-002
ADR-G-003
ADR-G-004
BookTown Vision
Read → Write → Think

### P-M-002
Status: UNDER DISCUSSION

Proposal:
MatchMaker should optimize for Literary Understanding and Identity Development.

Engagement and recommendation accuracy are important outcomes but are not the primary objectives of the system.

MatchMaker should seek to develop increasingly accurate models of:

- Literature
- Readers
- Writers
- Literary identities
- Intellectual pathways

The purpose of MatchMaker is to understand both the Literary Knowledge Graph and the Literary Identity Graph and continuously improve the alignment between them.

The ultimate objective is to support the development of readers, writers, and thinkers.

MatchMaker should therefore prioritize:

### Literary Understanding

Develop increasingly accurate models of:

- Works
- Authors
- Quotes
- Themes
- Concepts
- Traditions
- Movements
- Philosophies
- Civilizations
- Historical Periods

and their relationships.

### Identity Development

Develop increasingly accurate models of:

- Reading identity
- Writing identity
- Thinking identity
- Literary evolution
- Intellectual evolution

### Literary Growth

Support exploration of meaningful adjacent literary territory rather than merely reinforcing existing preferences.

### Recommendation

Provide recommendations that emerge naturally from literary understanding rather than acting as the primary objective.

The purpose of MatchMaker is not to maximize activity.

The purpose of MatchMaker is to maximize meaningful literary understanding.

Source:
Q-M-001
P-M-001
BookTown Vision
Read → Write → Think
Architecture Discussion

### P-M-003
Status: UNDER DISCUSSION

Proposal:
Literary Identity should be represented through a Hybrid Identity Model.

Literary Identity is not a static profile and cannot be accurately represented through preferences alone.

Literary Identity emerges from the combination of:

### Profile Signals

Explicit information provided by the user.

Examples:

- Preferred genres
- Preferred languages
- Reading goals
- Writing goals
- Discovery preferences

### Behavioral Signals

Observed actions and interactions.

Examples:

- Books read
- Books finished
- Books abandoned
- Books reread
- Quotes saved
- Reviews written
- Authors followed
- Shelves created
- Searches performed
- Recommendations accepted
- Recommendations rejected

### Graph Signals

Relationships formed inside the Literary Identity Graph.

Examples:

- Reader → Work
- Reader → Author
- Reader → Quote
- Reader → Theme
- Writer → Theme
- Writer → Concept
- Reader → Shelf

Graph signals capture the structure of a user's literary identity rather than isolated actions.

### Temporal Signals

Literary Identity evolves over time.

Examples:

- Emerging interests
- Declining interests
- Reading transitions
- Writing transitions
- Intellectual evolution

Identity should therefore be treated as a living system rather than a static state.

MatchMaker should continuously reconcile Profile Signals, Behavioral Signals, Graph Signals, and Temporal Signals in order to maintain the most accurate representation of a user's Literary Identity.

The objective is to understand not only what a user likes, but how that user is changing over time.

Source:
Q-M-002
P-M-001
P-M-002
ADR-G-001
Architecture Discussion

---

### Q-M-001
Status: OPEN

Question:
What is MatchMaker optimizing for?

Potential objectives include:

A. Engagement

Maximize clicks, reading time, and activity.

B. Recommendation Accuracy

Maximize likelihood that a user enjoys a recommendation.

C. Literary Growth

Help users gradually expand their literary horizons.

D. Literary Understanding

Develop increasingly accurate models of both literature and readers.

E. Identity Development

Support the evolution of readers, writers, and thinkers over time.

The decision determines the long-term behavior of MatchMaker and influences recommendation, discovery, and exploration strategies.

Source:
P-M-001
Architecture Discussion

### Q-M-002
Status: OPEN

Question:
How should MatchMaker represent Literary Identity?

Potential models:

A. Static Profile

Identity is represented through user-selected preferences.

B. Behavioral Model

Identity is inferred from observed actions.

C. Graph Model

Identity is represented as a living graph composed of entities and relationships.

D. Hybrid Model

Identity combines profile information, behavior, and graph structures.

The decision determines how MatchMaker understands users and how Literary Identity evolves over time.

Source:
P-M-001
P-M-002
Architecture Discussion

### Q-M-003
Status: OPEN

Question:
Should Literary Identity be explainable?

Examples:

Should MatchMaker be able to explain:

- Why a recommendation was made?
- Why a theme is important to a user?
- Why a literary pathway was suggested?
- Why a user's identity model changed?

Potential models:

A. Black Box

Identity exists internally but is not exposed.

B. Partial Explainability

Users see selected explanations.

C. Full Explainability

Users can inspect significant portions of their Literary Identity Graph and MatchMaker reasoning.

The decision affects:

- Trust
- Transparency
- User learning
- AI explainability
- MatchMaker product design

Source:
P-M-003
Architecture Discussion

---