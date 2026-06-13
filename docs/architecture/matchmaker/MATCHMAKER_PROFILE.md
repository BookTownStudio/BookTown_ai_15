---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-PROFILE
title: "MatchMaker Profile"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MatchMaker Profile

Status: Architectural Authority
Mode: Read Only
Created: June 2026
Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`
- `docs/architecture/entity-platform/MATCHMAKER_ENTITY_LAYER.md`
- `docs/architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md`
- `docs/architecture/entity-platform/ENTITY_GRAPH.md`
- `docs/architecture/engineering/WAVE_9_COMPLETION.md`

## What MatchMaker Is

MatchMaker is BookTown's Literary Intelligence Layer.

It operates between the Literary Knowledge Graph and the Literary Identity Graph. Its responsibility is to align what BookTown knows about literature with what BookTown knows about a reader or writer's evolving literary identity.

MatchMaker is not defined by the act of recommending books. Recommendations are one output of literary intelligence. The broader responsibility is to reason about literary resonance, distance, growth, challenge, discovery, and pathways.

MatchMaker consumes bounded, privacy-safe Entity Platform snapshots. It reasons over canonical literary entities, affinity summaries, interaction summaries, graph relationship summaries, entity summaries, and safe profile or discovery context. It must preserve provenance, confidence, and privacy at every step.

## What MatchMaker Is Not

MatchMaker is not:

- a recommendation engine alone
- a search engine
- an LLM
- a vector database
- a graph database
- an entity authority
- a relationship authority
- a user identity authority
- an affinity generator
- a persistence layer
- a telemetry collector

MatchMaker must never rewrite literary truth, user identity truth, graph truth, or affinity truth. It may consume those layers and produce derived intelligence outputs with explanation.

## Mission

MatchMaker's mission is to support literary understanding and literary growth.

It should help users:

- recognize what already resonates with them
- discover adjacent literary territory
- encounter meaningful challenge
- understand why a work, author, quote, movement, or pathway matters
- evolve as readers, writers, and thinkers

Engagement and completion are useful signals, but they are not the primary objective. MatchMaker should optimize for meaningful literary alignment rather than activity maximization.

## Philosophy

MatchMaker should balance five objectives:

| Objective | Meaning | V1 Role |
|---|---|---|
| Relevance | Align with demonstrated user affinity. | Primary |
| Growth | Extend the user's literary identity. | Limited |
| Challenge | Introduce productive difficulty or contrast. | Limited |
| Diversity | Avoid collapsing taste into one narrow lane. | Limited |
| Serendipity | Surface unexpected but explainable adjacency. | Future |

V1 should be conservative. It should establish explainable Work recommendations from bounded snapshots. Later versions may broaden into pathways, discovery, challenge, and serendipity after graph and entity maturity improves.

## Reasoning Model

MatchMaker should reason in stages.

1. Ingest
   - Accept only `MatchMakerInput` snapshots.
   - Reject or ignore raw private activity, raw search text, raw reader history, notifications, and recommendation output.

2. Normalize
   - Group evidence by canonical entity reference.
   - Preserve entity type boundaries.
   - Preserve privacy, provenance, confidence, and source class.

3. Interpret
   - Distinguish explicit, expressive, behavioral, negative, and graph-context evidence.
   - Treat graph relationships as context, not affinity.
   - Treat display strings as display metadata only.

4. Score
   - Apply deterministic, bounded scoring in V1.
   - Favor high-confidence explicit and expressive affinities.
   - Apply weak influence from behavioral and graph-context signals.
   - Keep negative and contradictory signals visible rather than collapsing them.

5. Explain
   - Produce reason classes and supporting evidence.
   - State whether evidence came from affinity, interaction, graph, profile context, or availability.
   - Include confidence and constraints.

6. Bound
   - Limit output count.
   - Respect privacy.
   - Avoid unbounded traversal or hidden retrieval.

## Discovery Model

A discovery is an entity that is not merely similar to what the user already knows, but is meaningfully adjacent to their identity.

Discovery may be based on:

- adjacent Work relationships
- shared movement or period context
- quote or review patterns
- emerging interests
- safe profile context such as novelty tolerance
- unexplored but graph-near territory

Discovery must remain explainable. It should answer: "Why is this worth your attention now?"

V1 should not implement full discovery. It may expose simple discovery reason classes only when already present in snapshot context.

## Recommendation Model

A recommendation is a bounded output that proposes a target entity for a user based on explainable alignment between literary evidence and identity evidence.

V1 recommendation targets should be Works only.

V1 recommendation evidence may include:

- Work affinity
- recent interaction summaries
- graph relationship summaries involving Work entities
- entity summary metadata
- availability constraints
- privacy-safe profile context

V1 recommendation evidence must exclude:

- raw search text
- raw reading history
- raw reader positions or anchors
- raw private shelves or bookmarks
- notifications
- recommendation outputs
- unverified display strings as identity

## Pathway Model

A pathway is an ordered explanation through literary meaning.

Examples:

- User affinity -> Work -> related Work
- User affinity -> Quote -> Work
- User affinity -> Work -> Author -> Work
- User affinity -> Work -> Movement -> Work
- User affinity -> Quote -> Concept -> Theme -> Work

Pathways require graph traversal evidence, identity evidence, provenance, confidence, and explicit relationship boundaries.

V1 should not implement full pathway generation. It may include single-step evidence such as "because this Work is related to a Work you engaged with." Multi-hop pathways should wait for stronger non-book graph traversal and entity maturity.

## Exploration Model

Exploration is controlled movement away from known affinity.

Exploration should consider:

- graph distance
- confidence of existing affinity
- novelty tolerance
- reading completion consistency
- language and availability constraints
- diversity across forms, movements, periods, and traditions

V1 exploration should be shallow. It may diversify among candidate Works but should not construct independent exploratory pathways.

## Reinforcement Model

Reinforcement strengthens known identity.

It should be used when:

- the user has high-confidence explicit or expressive affinity
- the target Work shares trusted graph context
- the target is available and relevant
- the explanation is clear

Reinforcement must not trap users in repetitive recommendations. Even V1 should avoid returning only variants of the same signal class when broader safe candidates exist.

## Serendipity Model

Serendipity is meaningful surprise.

It is not randomness. It requires:

- weak or indirect connection to known affinity
- strong literary explanation
- acceptable graph distance
- high enough confidence that the suggestion is not arbitrary
- user context that allows novelty

Serendipity is future architecture. It should not be implemented in V1 beyond tagging a recommendation as exploratory when evidence supports it.

## Contradiction Model

Contradiction is signal conflict.

Examples:

- A user completed a Work but reviewed it negatively.
- A user bookmarked a Work and later removed it.
- A user searches often in a domain but rarely reads it.
- A user quotes an author but abandons that author's Works.

MatchMaker must preserve contradiction as evidence. It must not average conflict into a meaningless middle score. Contradictions should produce explanation, lower confidence, or challenge-oriented outputs.

## Diversity Model

Diversity protects literary identity from collapse.

MatchMaker should consider diversity across:

- entity types
- literary forms
- authors
- traditions
- movements
- periods
- languages
- signal classes

V1 should use diversity only as a tie-breaker or output constraint. Later versions may explicitly optimize literary breadth.

## Growth Model

Literary growth is movement from current identity toward richer literary territory.

Growth is not simply reading more. It may mean:

- moving from familiar Works to adjacent traditions
- confronting contrasting movements
- engaging more deeply with quoted ideas
- moving from passive searching to expressive reviewing or quoting
- building pathways across authors, periods, and concepts

V1 should record growth intent as an output reason class only where evidence is already available. Growth optimization belongs to V2+.

## Explainability Model

Every MatchMaker output must explain itself.

Required explanation fields conceptually include:

- target entity reference
- reason class
- supporting evidence
- confidence
- source boundary
- graph context boundary
- privacy boundary
- exclusions or constraints when relevant

Explanations must distinguish:

- identity evidence
- affinity evidence
- graph evidence
- availability evidence
- profile context
- discovery context

No output may rely on hidden inference that cannot be traced to snapshot evidence.

## Trust Model

Trust is earned through restraint.

MatchMaker should:

- be deterministic in V1
- report low confidence when evidence is weak
- avoid pretending display labels are canonical identity
- avoid using private raw data directly
- keep recommendation outputs separate from truth layers
- explain when an output is reinforcement, exploration, contrast, or discovery

Trust fails when MatchMaker makes confident claims from weak evidence.

## Privacy Model

MatchMaker must consume privacy-safe snapshots only.

Privacy rules:

1. Private signals remain private.
2. Raw search text is excluded.
3. Raw reading history is excluded.
4. Reader anchors and positions are excluded.
5. Notifications are excluded.
6. Direct subsystem records are excluded.
7. Public aggregate outputs require separate anonymization architecture.
8. MatchMaker must not persist raw inputs in V1.

## Literary Authority Model

MatchMaker may reason over literary authority, but it does not own authority.

| Authority Domain | Owner | MatchMaker Role |
|---|---|---|
| Entity identity | Entity Platform / entity authority sources | Consume refs only |
| Entity summaries | Entity Platform projections | Consume display metadata |
| Graph relationships | Literary Knowledge Graph | Consume relationship context |
| User interactions | Literary Identity Graph | Consume summaries |
| Affinity | Affinity Layer | Consume summaries |
| Recommendations | MatchMaker output | Generate derived outputs |

MatchMaker must never create canonical entity identity, canonical graph truth, or canonical affinity truth.

## Entity Participation Model

| Entity | Recommend | Explain | Pathway | Affinity | Context | Intelligence Primitive |
|---|---:|---:|---:|---:|---:|---:|
| Work | V1 | V1 | Limited V1 | V1 | V1 | V1 |
| Edition | No | Limited | No | Limited | V1 availability | Future |
| Author | Future | V1 context | Future | Only with canonical Author ref | V1 context | V2 |
| Quote | Future | V1 context | Future | V1 if canonical Quote ref exists | V1 context | V2 |
| Publication | Future | Limited | Future | Limited | V1 context | V2 |
| Movement | Future | V1 context | Future | No V1 | V1 context | V2 |
| Tradition | Future | V1 context | Future | No V1 | V1 context | V2 |
| Philosophy | Future | Limited | Future | No V1 | Context only | V2+ |
| Civilization | Future | Limited | Future | No V1 | Context only | V2+ |
| Historical Period | Future | V1 context | Future | No V1 | V1 context | V2 |
| Theme | No V1 | No V1 | Future | No V1 | Future | V3 |
| Concept | No V1 | No V1 | Future | No V1 | Future | V3 |
| Place | No V1 | Limited | Future | No V1 | Context only | Future |

## Output Taxonomy

### Recommendation

A ranked target entity suggested because current evidence indicates likely meaningful resonance.

### Discovery

A target entity suggested because it expands the user's literary identity into adjacent or underexplored territory.

### Pathway

An ordered route through literary meaning, connecting user identity and literary graph evidence.

### Insight

A statement about the user's literary identity, such as emerging interests or changing depth preference.

### Challenge

A suggestion intended to stretch the user beyond familiar territory while remaining explainable.

### Reflection

A prompt or explanation that helps the user understand their own literary behavior.

## Recommendation Matrix

| Recommendation Type | V1 | Required Evidence |
|---|---:|---|
| Work reinforcement | Yes | Work affinity and entity summary |
| Work graph-adjacent | Limited | Work affinity plus relationship evidence |
| Author recommendation | No | Requires Author graph/search maturity |
| Quote recommendation | No | Requires Quote graph/search maturity |
| Movement recommendation | No | Requires movement navigation and graph maturity |
| Theme/Concept recommendation | No | Requires canonical authority |

## Discovery Matrix

| Discovery Type | V1 | Notes |
|---|---:|---|
| Similar Work discovery | Limited | Only if graph evidence exists |
| Adjacent tradition discovery | No | Needs stronger graph traversal |
| Contrast discovery | No | Needs contradiction model implementation |
| Author discovery | No | Needs canonical author participation |
| Theme/Concept discovery | No | Future only |

## Pathway Matrix

| Pathway | V1 |
|---|---:|
| User -> Work | Yes |
| User -> Work -> Work | Limited |
| User -> Quote -> Work | Context only |
| User -> Work -> Author -> Work | No |
| User -> Work -> Movement -> Work | No |
| User -> Theme/Concept -> Work | No |

## Resonance Matrix

| Resonance Source | Meaning | V1 Role |
|---|---|---|
| Explicit affinity | Saves, shelves, follows where canonical | Strong |
| Expressive affinity | Reviews, quotes, discussions | Strong |
| Behavioral affinity | Reading and clicks | Moderate/weak |
| Graph context | Relationship evidence | Context |
| Profile context | Novelty, depth, completion signals | Modulator |
| Search context | Recent intent without raw query | Weak session context |

## Exploration Matrix

| Exploration Mode | V1 |
|---|---:|
| Diversify among Work candidates | Limited |
| Graph-near expansion | No |
| Author exploration | No |
| Movement/period exploration | No |
| Theme/concept exploration | No |

## Reinforcement Matrix

| Reinforcement Source | V1 Strength |
|---|---|
| Bookmarking | High |
| Shelving | High |
| Reviewing | High |
| Quoting | High |
| Reading progress | Medium |
| Search click | Low |

## Serendipity Matrix

| Serendipity Source | V1 |
|---|---:|
| Randomness | Never |
| Weak graph distance | No |
| Explainable contrast | Future |
| Underexplored adjacent Work | Limited |
| Theme/concept bridge | Future |

## Contradiction Matrix

| Contradiction | Required Behavior |
|---|---|
| Finished but disliked | Preserve as conflict; reduce confidence |
| Saved then removed | Treat as withdrawal |
| Searched but never read | Low confidence curiosity only |
| Quoted but abandoned related Works | Preserve as split affinity |
| Negative review with high engagement | Treat as critical engagement |

## Diversity Matrix

| Diversity Axis | V1 |
|---|---:|
| Candidate de-duplication | Yes |
| Avoid single-source domination | Yes |
| Author diversity | Limited |
| Form/tradition diversity | Limited |
| Language diversity | Future |

## Growth Matrix

| Growth Signal | V1 |
|---|---:|
| Completion consistency | Context only |
| Depth preference | Context only |
| Novelty tolerance | Context only |
| Emerging interest | Future |
| Intellectual evolution | Future |

## Trust Matrix

| Trust Requirement | V1 Rule |
|---|---|
| Bounded input | Required |
| Determinism | Required |
| Provenance | Required |
| Confidence | Required |
| Privacy-safe context | Required |
| No raw private streams | Required |
| No hidden model inference | Required |

## Explainability Matrix

| Output | Explanation Requirement |
|---|---|
| Recommendation | Reason class, evidence, confidence |
| Discovery | Adjacency and novelty explanation |
| Pathway | Ordered evidence chain |
| Challenge | Contrast and growth rationale |
| Insight | Source signal classes and limits |

## Governance Principles

1. MatchMaker consumes snapshots, not subsystem authority.
2. MatchMaker outputs derived intelligence, not truth.
3. MatchMaker V1 must be deterministic.
4. Every output must be explainable.
5. Privacy constraints must be preserved or narrowed.
6. Graph relationships are context, not preference.
7. Affinity is input, not MatchMaker-owned state.
8. Recommendation output must not feed back into truth layers without a separate audited path.
9. Theme and Concept reasoning waits for canonical authority.
10. Literary growth matters more than engagement maximization.

## Failure Modes

| Failure Mode | Severity | Control |
|---|---:|---|
| Treating recommendations as graph truth | Critical | Output isolation |
| Treating graph proximity as user preference | Critical | Graph context boundary |
| Using raw private events | Critical | Snapshot-only input |
| Using display strings as identity | High | Canonical refs only |
| Overfitting to passive clicks | High | Low confidence weighting |
| Recommending without explanation | High | Mandatory evidence |
| Premature AI/vector introduction | High | Deterministic V1 |
| Theme/Concept hallucination | High | Exclude until authority exists |

## V1 Scope

MatchMaker V1 should contain:

- a pure engine consuming `MatchMakerInput`
- Work-only recommendation targets
- deterministic scoring
- bounded output
- confidence reporting
- reason classes
- evidence summaries
- availability constraints
- no persistence
- no APIs
- no retrieval
- no embeddings
- no AI models
- no graph expansion
- no entity rollups

V1 should explicitly exclude:

- Author recommendations
- Quote recommendations
- Movement or Period recommendations
- Theme and Concept reasoning
- multi-hop pathways
- vector retrieval
- LLM reasoning
- persisted recommendation ledgers
- public aggregate intelligence

## V2+ Evolution Roadmap

### V2: Entity-Aware Discovery

- Author context becomes recommendation-capable when author graph/search maturity improves.
- Quote context becomes pathway-capable when quote graph maturity improves.
- Movement and Period become discovery contexts with bounded traversal.
- Contradiction and challenge modes become explicit output modes.

### V3: Pathway Intelligence

- Multi-hop pathways become available after non-book graph traversal contracts mature.
- Theme and Concept may participate only after canonical authority exists.
- Literary growth and serendipity become first-class strategies.

### V4: Adaptive Literary Intelligence

- MatchMaker may incorporate learned or probabilistic models only after deterministic behavior, governance, privacy, deletion semantics, and explainability are proven.
- AI-assisted reasoning may be introduced only as an explainable layer over canonical evidence, never as authority.

## Implementation Readiness

BookTown is ready to implement MatchMaker V1 as a deterministic, snapshot-consuming Work recommendation engine.

BookTown is not ready for full MatchMaker intelligence, multi-hop pathway generation, Theme/Concept reasoning, embeddings, vector retrieval, or AI-generated literary reasoning.

The next engineering phase should be `BT-MATCHMAKER-V1-IMPLEMENTATION-001`: a pure MatchMaker V1 engine module with tests and no persistence, retrieval, APIs, or product behavior changes.
