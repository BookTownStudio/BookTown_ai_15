# MatchMaker V1 Engine

Status: Architecture Design
Mode: Read Only
Request: BT-MATCHMAKER-V1-ENGINE-DESIGN-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`
- `docs/architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md`
- `docs/architecture/entity-platform/ENTITY_GRAPH.md`
- `docs/architecture/entity-platform/MATCHMAKER_ENTITY_LAYER.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Engine Mission

MatchMaker V1 is a pure, deterministic engine that transforms a bounded `MatchMakerInput` snapshot into explainable `MatchMakerRecommendation` outputs for Work entities only.

The engine exists to produce derived literary intelligence. It must not create entity truth, graph truth, affinity truth, user identity truth, search truth, persistence records, or recommendation ledgers.

V1 optimizes for meaningful literary alignment under strict evidence, privacy, and authority boundaries. It is not a search engine, LLM, vector system, graph database, retrieval system, telemetry collector, or product API.

## Engine Inputs

The only engine input is `MatchMakerInput`.

Allowed input surfaces:

- `entityRefs`
- `entitySummaries`
- `graphRelationshipSummaries`
- `userAffinitySummaries`
- `interactionSummaries`
- `searchOrDiscoveryContext`
- `availabilityConstraints`
- `privacySafeProfileContext`
- `contractVersion`

Input handling rules:

1. The engine must never retrieve missing data.
2. The engine must never inspect Firestore, Search indexes, Reader state, Graph storage, Identity Graph storage, or UI state.
3. The engine must reject or ignore raw private context keys if they reach the engine despite upstream filtering.
4. The engine must process only bounded arrays already present on the snapshot.
5. The engine must preserve entity type boundaries and must treat display fields as display metadata only.

## Engine Outputs

The only V1 output is an ordered array of `MatchMakerRecommendation`.

Output rules:

1. `targetEntityRef.entityType` must be `work`.
2. Every recommendation must include metadata, evidence, explanation, confidence, and constraints.
3. Output privacy must be no broader than the most restrictive evidence privacy tier.
4. Output authority boundary must be `derived_intelligence_not_canonical_truth`.
5. Outputs must be deterministic for identical input and engine version.
6. Empty output is valid when evidence is insufficient or constraints block all candidates.

V1 must not emit `MatchMakerDiscovery`, `MatchMakerPathway`, `MatchMakerInsight`, `MatchMakerChallenge`, or `MatchMakerReflection`. Those contracts are reserved for future phases.

## Pipeline Architecture

The exact V1 pipeline is:

1. `MatchMakerInput`
2. Input normalization
3. Candidate pool
4. Candidate filtering
5. Affinity evaluation
6. Graph context evaluation
7. Availability evaluation
8. Evidence assembly
9. Confidence calculation
10. Explanation generation
11. Recommendation ranking
12. `MatchMakerRecommendation` output

Each stage must receive immutable data from the prior stage and return a new bounded structure. No stage may perform external IO, persistence, retrieval, telemetry writes, or hidden mutation.

Target performance for implementation:

- p95 engine latency below 25 ms for the current snapshot bounds.
- O(n + r) processing, where n is bounded entity, affinity, and interaction count, and r is bounded relationship count.
- No unbounded loops, recursive graph traversal, async network calls, or in-memory scans outside the snapshot.

## Candidate Generation

Candidate generation builds a Work-only candidate pool from snapshot data already present in `MatchMakerInput`.

Candidate sources, in priority order:

1. Work `EntitySummary.ref` values.
2. Work `entityRefs`.
3. Work endpoints from `graphRelationshipSummaries`.
4. Work `userAffinitySummaries.entityRef` values only when the candidate is not blocked by negative or withdrawn evidence.
5. Work `interactionSummaries.entityRef` values only when the interaction is not withdrawn, deleted, anonymized, or negative-equivalent.

The engine must not create candidates from:

- raw search text
- display strings
- author names
- inferred themes or concepts
- external IDs
- recommendations previously shown
- graph expansion beyond provided `graphRelationshipSummaries`

Candidate identity key:

`entityType + ":" + canonicalId-or-entityId`

If both `canonicalId` and `entityId` exist, `canonicalId` is the dedupe key. The original `LiteraryEntityRef` remains the output reference.

Candidate generation must also build a seed set of known user evidence refs from affinity and interaction summaries. Graph endpoints are candidate-eligible only when the relationship includes at least one Work seed or an explicitly supplied Work candidate in the snapshot.

## Candidate Filtering

Candidate filtering is mandatory before scoring.

Hard filters:

1. Exclude non-Work candidates.
2. Exclude candidates without a stable `entityId`.
3. Exclude candidates with `authorityState` of `unresolved`, `deprecated`, `merged`, or `archived`.
4. Exclude candidates whose only evidence is raw or unsafe context.
5. Exclude candidates with only negative affinity and no positive, graph, or availability evidence.
6. Exclude candidates with withdrawn, deleted, expired, or anonymized interaction evidence when that evidence is the primary reason for inclusion.
7. Exclude candidates that violate availability constraints marked as hard.
8. Exclude candidates whose output would require widening privacy beyond the caller-visible boundary.

Soft constraints:

- weak evidence
- sparse snapshot
- contradictory signals
- low graph relationship confidence
- missing summary
- limited availability
- single-source domination

Soft constraints do not automatically remove candidates. They reduce confidence and must be surfaced in `MatchMakerConstraint`.

## Affinity Evaluation

Affinity evaluation treats `EntityAffinity` as input authority from the Affinity Layer. MatchMaker may score with it but must not rewrite it.

V1 uses weighted scoring. The default implementation must use fixed weights, not learned weights.

Affinity class weights:

| Affinity class | Weight |
|---|---:|
| `explicit` | 1.00 |
| `expressive` | 0.90 |
| `behavioral` | 0.55 |
| `derived_graph_near` | 0.35 |
| `negative` | -0.85 |

Strength band multipliers:

| Strength band | Multiplier |
|---|---:|
| `weak` | 0.35 |
| `moderate` | 0.60 |
| `strong` | 0.85 |
| `very_strong` | 1.00 |

Affinity contribution:

`affinityScore = classWeight * strengthMultiplier * affinity.confidence`

Rules:

1. Positive affinity can directly support a Work recommendation.
2. Negative affinity is not averaged away; it creates a negative evidence item and lowers score and confidence.
3. Multiple positive affinity items for the same candidate are capped at 1.0 before graph and availability effects.
4. Affinity for non-Work entities may explain context only in V1. It must not become a Work target unless the Work is already a candidate through allowed Work sources.

## Graph Context Evaluation

Graph context is contextual evidence, not affinity.

Graph contribution must be weaker than direct affinity. It can boost ranking only when a candidate already has Work evidence or when the candidate is a Work endpoint in a provided relationship connected to a Work seed.

Graph relationship source weights:

| Source class | Weight |
|---|---:|
| `editorial` | 0.30 |
| `seeded` | 0.25 |
| `derived_ontology` | 0.18 |
| `derived_identity_graph` | 0.15 |
| `provider_derived` | 0.12 |
| `migration` | 0.08 |
| `ai_assisted` | 0.05 |

Graph contribution:

`graphScore = sourceWeight * relationship.confidence`

Rules:

1. Graph context cannot exceed 30 percent of the final base score.
2. Graph context must produce `graph` evidence and `graph_context` reason class.
3. Graph context must not create or imply canonical graph truth.
4. Directional relationships must be interpreted according to their direction and relationship type.
5. Weak graph evidence may support explanation but should not materially rank above strong affinity evidence.

## Availability Evaluation

Availability affects both filtering and ranking.

Decision:

- Hard availability constraints filter candidates.
- Soft availability constraints modify score and confidence.

Availability contribution:

| Availability state | Score effect | Rule |
|---|---:|---|
| clearly available | +0.10 | Boost ranking and confidence. |
| available with limits | +0.03 | Minor boost and soft constraint. |
| unknown | 0.00 | No boost; add weak availability constraint when needed. |
| temporarily unavailable | -0.15 | Keep only if evidence is otherwise strong. |
| blocked by hard constraint | filter | Do not output. |

Availability must never override strong negative evidence. Availability is a delivery constraint, not literary affinity.

## Confidence Model

Confidence answers how trustworthy the recommendation is, not how much the user will like it.

V1 confidence must combine:

- evidence strength
- evidence diversity
- affinity confidence
- graph confidence
- availability certainty
- contradiction penalty
- privacy and authority constraints
- snapshot sparsity

Base confidence:

`confidenceScore = clamp(0.45 * affinityConfidence + 0.20 * graphConfidence + 0.15 * availabilityConfidence + 0.10 * evidenceDiversity + 0.10 * snapshotCompleteness - penalties, 0, 1)`

Required bands:

| Score range | Band |
|---|---|
| `0.00 <= score < 0.45` | `low` |
| `0.45 <= score < 0.75` | `medium` |
| `0.75 <= score <= 1.00` | `high` |

Sparse snapshot rule:

When no direct positive affinity exists, the maximum confidence band is `medium`. When graph-only evidence exists, the maximum confidence score is `0.60`. When availability is unknown and evidence is weak, the maximum confidence score is `0.50`.

Contradiction penalty:

- minor contradiction: `0.10`
- direct positive and negative conflict: `0.20`
- withdrawn or deleted signal affecting the same candidate: `0.35`

The engine must preserve contradictions in evidence and constraints instead of hiding them in a blended score.

## Evidence Model

Evidence assembly creates `MatchMakerEvidence` items after filtering and evaluation.

Evidence IDs must be deterministic:

`candidateKey + ":" + source + ":" + stableSourceId-or-index`

Evidence source mapping:

| Input | Evidence source |
|---|---|
| `EntityAffinity` | `affinity` |
| `UserEntityInteraction` | `interaction` |
| `EntityRelationship` | `graph` |
| `EntitySummary` or `LiteraryEntityRef` | `entity` |
| `privacySafeProfileContext` | `profile_context` |
| `availabilityConstraints` | `availability` |
| `searchOrDiscoveryContext` | `discovery_context` |

Evidence rules:

1. Evidence summaries must be sanitized and must not quote raw private source data.
2. Evidence must include provenance and privacy tier.
3. Evidence confidence must be calculated independently from output confidence.
4. Evidence must remain source-specific; do not merge graph and affinity into one evidence item.
5. Every output must reference evidence by ID from the explanation.

## Explanation Model

Explanation generation is deterministic template assembly over evidence. It is not LLM generation.

Explanation must include:

- primary reason class
- all applicable reason classes
- summary
- evidence IDs
- source boundaries
- privacy boundary
- authority boundary
- constraint IDs

Primary reason selection:

1. `reinforcement` when positive explicit or expressive affinity dominates.
2. `affinity` when direct affinity is present but not dominant enough for reinforcement.
3. `graph_context` when graph context is the strongest positive explanation.
4. `availability` only when availability meaningfully differentiates otherwise similar candidates.
5. `exploration` when evidence indicates controlled movement away from known affinity.
6. `serendipity` only when indirect evidence is explainable and confidence is at least medium.

The explanation summary must state why the Work is recommended using only evidence present in the output. It must not mention raw searches, raw reading history, hidden profile data, or subsystem internals.

## Constraint Model

Every recommendation must include constraints, even when all constraints are satisfied.

Required baseline constraints:

- privacy boundary constraint
- authority boundary constraint
- V1 Work-only scope constraint
- bounded snapshot constraint

Conditional constraints:

- hard availability block
- soft availability limit
- sparse evidence
- weak graph context
- contradictory signals
- negative evidence
- withdrawn evidence
- missing summary
- diversity tie-break applied

Constraint IDs must be deterministic and referenced from `MatchMakerExplanation.constraintIds`.

## Privacy Enforcement

Privacy is enforced at four points:

1. Input normalization rejects unsafe context keys and values.
2. Candidate filtering removes candidates that require unauthorized evidence.
3. Evidence assembly emits only privacy-safe summaries.
4. Output metadata sets the most restrictive required privacy tier.

Forbidden output content:

- raw private events
- raw search text
- raw reading history
- raw reader positions or anchors
- raw shelves, bookmarks, reviews, or quotes beyond summarized evidence
- notification data
- subsystem-owned authority payloads
- hidden inference that cannot be traced to evidence

Privacy tier rule:

Output privacy tier must be the maximum restriction of all included evidence tiers. V1 should default user-personal recommendations to `private` unless all evidence is public and the caller explicitly requested a public-safe output mode through a separately approved contract.

## Tie Breaking

Tie breaking must be deterministic and stable.

Sort order:

1. Higher final score.
2. Higher confidence score.
3. Higher direct affinity score.
4. Higher evidence diversity count.
5. Clearly available before limited or unknown availability.
6. Fewer contradiction and negative constraints.
7. Canonical authority before resolved or enriched authority.
8. Lexicographic candidate key.

No randomization is allowed in V1. Serendipity must be explainable adjacency, not randomness.

## Candidate Scoring

V1 should use weighted scoring with fixed constants.

Base score:

`baseScore = clamp(affinityScore + min(graphScore, 0.30) + availabilityEffect - penalties, 0, 1)`

Final score:

`finalScore = baseScore * confidenceAdjustment`

Confidence adjustment:

`confidenceAdjustment = 0.70 + (confidenceScore * 0.30)`

This allows confidence to affect ranking without letting low-confidence graph-only candidates outrank strong direct affinity by accident.

Scoring decisions:

| Question | V1 decision |
|---|---|
| Should MatchMaker use weighted scoring? | Yes, fixed deterministic weights. |
| Should affinity classes have different weights? | Yes. Explicit and expressive dominate; behavioral is moderate; graph-near is weak; negative is penalizing. |
| Should confidence affect ranking? | Yes, as a bounded multiplier, not as the primary score. |
| Should availability affect ranking or filtering only? | Both. Hard constraints filter; soft constraints rank and constrain. |
| Should graph context boost ranking or explanation only? | Both, but capped at 30 percent of base score and always labeled as graph context. |
| How should weak evidence behave? | It may explain low-confidence output but must not produce high-confidence recommendations. |
| How should sparse snapshots behave? | Return fewer recommendations, lower confidence, or empty output. Do not invent candidates. |

## Contradictory Signals

Contradictory signals are first-class evidence.

Examples:

- positive affinity plus negative affinity for the same Work
- completed interaction plus negative review-derived affinity
- saved then withdrawn
- repeated search/discovery context without direct reading or expressive signal

Rules:

1. Preserve both sides as evidence.
2. Add a contradiction constraint.
3. Lower confidence before lowering rank unless the negative signal is dominant.
4. Do not average conflict into a neutral signal without explanation.
5. If contradiction creates unsafe ambiguity, suppress the candidate.

## Negative Signals

Negative affinity and negative-equivalent interactions must never be ignored.

Rules:

1. Negative-only candidates are filtered.
2. Negative evidence on otherwise strong candidates remains visible.
3. Strong negative evidence applies a rank penalty and confidence penalty.
4. Recommending through negative evidence requires explicit positive or graph evidence and a clear explanation.
5. Negative signals must not mutate affinity authority.

## Withdrawn Signals

Withdrawn, deleted, expired, and anonymized interaction summaries are authority signals about lifecycle state.

Rules:

1. Withdrawn or deleted evidence cannot be used as positive support.
2. A candidate whose primary evidence is withdrawn or deleted must be filtered.
3. Withdrawn evidence may appear only as a privacy-safe constraint when needed to explain suppression or reduced confidence.
4. Anonymized evidence must not identify a user, source record, raw event, or private content.

## Deterministic Behavior Rules

Implementation must follow these rules:

1. Pure function from `MatchMakerInput` and explicit options to output array.
2. No Date calls inside core ranking except for an injected deterministic `generatedAt`.
3. No random numbers.
4. No external IO.
5. Stable sorting with lexicographic final fallback.
6. Fixed numeric weights stored as versioned constants.
7. Bounded output count with a default maximum of 20 recommendations.
8. Stable generated output IDs from engine version, candidate key, and evidence IDs.
9. No silent fallback to raw strings, display labels, or external identifiers.
10. Structured diagnostics returned only in test/debug surfaces, not persisted by the engine.

## Failure Modes

| Failure mode | Required behavior |
|---|---|
| Empty snapshot | Return empty output with no side effects. |
| No Work candidates | Return empty output with no side effects. |
| Unsafe context present | Ignore unsafe context and add an internal validation diagnostic in tests. |
| Invalid confidence value | Clamp only if contract compatibility requires it; otherwise reject in validation. |
| Candidate lacks stable ID | Filter candidate. |
| All candidates filtered | Return empty output. |
| Graph-only weak evidence | Cap confidence at low or medium according to evidence quality. |
| Strong negative evidence | Filter or heavily penalize with visible constraint. |
| Contradiction | Preserve evidence, lower confidence, add constraint. |
| Privacy widening required | Filter output. |
| Contract version mismatch | Reject input unless explicitly compatible. |

Production implementation must test each failure mode.

## Future Expansion Points

Future versions may add:

- `MatchMakerDiscovery` generation.
- single-step and multi-hop `MatchMakerPathway` generation.
- identity `MatchMakerInsight` outputs.
- challenge and reflection outputs.
- bounded author and quote recommendations.
- theme and concept reasoning after canonical authority exists.
- versioned learned ranking after deterministic behavior, privacy, deletion semantics, governance, and explainability are proven.

Future expansion must not change V1 behavior silently. Any change to scoring, filtering, confidence bands, or evidence semantics requires an engine version bump and focused contract tests.

## Implementation Boundary For BT-MATCHMAKER-V1-IMPLEMENTATION-001

The implementation phase should contain:

- a pure engine module that consumes `MatchMakerInput`
- deterministic candidate generation from snapshot-only data
- Work-only candidate filtering
- fixed weighted scoring constants
- confidence calculation
- evidence assembly
- explanation assembly
- deterministic ranking and output ID generation
- tests for filtering, scoring, confidence, evidence, explanations, privacy, contradictions, negative signals, withdrawn signals, sparse snapshots, and tie breaking

The implementation phase must not contain:

- APIs
- Firestore collections
- persistence
- retrieval
- Search changes
- Reader changes
- Graph writes
- Identity Graph writes
- Affinity Layer writes
- UI changes
- LLM calls
- vector search
- background jobs
- telemetry writes from the pure engine

## Final Architecture Answers

MatchMaker V1 is fully specified as a pure deterministic Work recommendation engine over `MatchMakerInput`.

Implementation can begin immediately after this document if it remains inside the implementation boundary above.

Unresolved architectural risks:

- Existing legacy MatchMaker weighting code is not contract-native and should be isolated rather than extended.
- Affinity and interaction snapshots may be sparse until Identity Graph adoption deepens.
- Availability context is currently generic and needs strict implementation-side validation.
- Public-safe recommendation output requires a separate approved contract; V1 should default to private user-personal output.

`BT-MATCHMAKER-V1-IMPLEMENTATION-001` should implement only the pure engine and tests. It should not add product integration, storage, API routing, retrieval, graph traversal, UI rendering, or subsystem writes.
