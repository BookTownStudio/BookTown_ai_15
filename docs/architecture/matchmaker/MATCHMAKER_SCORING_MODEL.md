# MatchMaker Scoring Model

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-SCORING-MODEL-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_UNIVERSE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_GENERATION.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Architecture Authority Decision

MatchMaker scoring is a deterministic, bounded, evidence-first evaluation step that ranks already-generated Work candidates from `MatchMakerInput`. It does not create candidates, retrieve data, update affinity, mutate graph truth, write recommendation state, or infer literary meaning from raw text.

V1 scoring uses fixed weighted constants. Direct positive affinity is the strongest score contributor. Interaction evidence supports affinity and confidence. Graph context is contextual, capped, and weaker than direct affinity. Availability modifies ranking and confidence but never creates literary relevance. Negative, contradictory, sparse, and withdrawn evidence must remain visible through penalties, confidence caps, and constraints.

## Scoring Mission

The scoring mission is to answer:

Which eligible Work candidates from the candidate pool are most strongly supported by privacy-safe, explainable evidence?

Scoring is not recommendation generation by itself. It produces ranked candidate evaluations that later become `MatchMakerRecommendation` outputs with evidence, explanation, confidence, provenance, and constraints.

## Scoring Inputs

Allowed scoring inputs:

- candidate identity key
- candidate `LiteraryEntityRef`
- candidate `EntitySummary`
- candidate evidence handles from candidate generation
- `EntityAffinity` summaries
- `UserEntityInteraction` summaries
- provided `EntityRelationship` graph summaries
- `availabilityConstraints`
- privacy-safe profile context
- structured discovery context
- candidate constraints from generation

Forbidden scoring inputs:

- embeddings
- vectors
- LLM reasoning
- graph traversal
- retrieval results
- recommendation feedback loops
- raw search text
- raw search history
- raw reader history
- raw Firestore documents
- display strings as identity
- provider aliases as identity
- Theme inference
- Concept inference
- Author rollups
- hidden scoring features

## Evidence Assembly

Scoring must evaluate source-specific evidence. It may not collapse all evidence into one opaque score.

Evidence groups:

1. Affinity evidence from `EntityAffinity`.
2. Interaction evidence from `UserEntityInteraction`.
3. Graph evidence from provided `EntityRelationship`.
4. Entity evidence from `LiteraryEntityRef` and `EntitySummary`.
5. Availability evidence from `availabilityConstraints`.
6. Profile or discovery context evidence when privacy-safe and structured.
7. Constraint evidence from candidate generation.

Each evidence group must produce:

- normalized signal value from 0.0 to 1.0 where applicable
- source confidence
- privacy tier
- provenance
- positive, negative, neutral, contradictory, or withdrawn classification

## Affinity Weighting

Affinity is the strongest V1 scoring input because it is already derived by the Affinity Layer. MatchMaker consumes it; it does not rewrite it.

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

1. Positive affinity can directly raise candidate rank.
2. Explicit and expressive affinity dominate behavioral evidence.
3. Behavioral evidence is moderate and must not overpower strong explicit or expressive signals.
4. Derived graph-near affinity is weak and must preserve provenance.
5. Negative affinity contributes a penalty and must generate negative evidence.
6. Positive affinity contribution is capped at 1.0 before graph and availability effects.

## Interaction Weighting

Interaction evidence supports scoring when it is active, privacy-safe, and summarized. It must not expose raw history.

Interaction class weights:

| Interaction class | Weight |
|---|---:|
| expressive interaction: reviewing, quoting, discussing | 0.45 |
| explicit library action: shelving, bookmarking, following | 0.40 |
| reading interaction | 0.30 |
| discovery or searching summary | 0.15 |
| publishing context | 0.15 |
| withdrawn, deleted, expired, anonymized | 0.00 positive contribution |

Interaction contribution:

`interactionScore = interactionWeight * lifecycleMultiplier * provenanceConfidence`

Lifecycle multipliers:

| Lifecycle state | Multiplier |
|---|---:|
| `recorded` | 1.00 |
| `superseded` | 0.50 |
| `withdrawn` | 0.00 |
| `expired` | 0.00 |
| `anonymized` | 0.00 |
| `deleted` | 0.00 |

Interaction contribution is capped at 0.45. It may strengthen evidence diversity and confidence, but it should not outrank direct high-confidence affinity alone.

## Graph Context Weighting

Graph context is relationship evidence, not affinity.

Graph source weights:

| Relationship source | Weight |
|---|---:|
| `editorial` | 0.30 |
| `seeded` | 0.25 |
| `derived_ontology` | 0.18 |
| `derived_identity_graph` | 0.15 |
| `provider_derived` | 0.12 |
| `migration` | 0.08 |
| `ai_assisted` | 0.05 |

Graph contribution:

`graphScore = relationshipSourceWeight * relationship.confidence`

Rules:

1. Graph context cannot exceed 0.30 of base score.
2. Graph context cannot create high-confidence recommendations by itself.
3. Graph-only candidates are capped at medium confidence and 0.60 confidence score.
4. Graph evidence must be labeled as `graph_context` in explanation.
5. Directional relationships must preserve direction semantics.
6. No graph traversal is allowed in scoring.

## Availability Weighting

Availability is a delivery and constraint signal, not literary affinity.

Availability effects:

| Availability state | Score effect | Confidence effect |
|---|---:|---:|
| clearly available | +0.10 | +0.05 |
| available with limits | +0.03 | +0.00 |
| unknown | +0.00 | -0.05 when evidence is weak |
| temporarily unavailable | -0.15 | -0.10 |
| hard blocked | candidate already filtered | candidate already filtered |

Rules:

1. Availability may break ties and modestly boost deliverable recommendations.
2. Availability must never create a candidate.
3. Availability must never override strong negative evidence.
4. Hard availability constraints belong in candidate filtering, not scoring.
5. Soft availability constraints must appear as constraints in output.

## Negative Signals

Negative evidence is never ignored or averaged away.

Negative scoring effects:

- negative affinity: direct score penalty
- negative-equivalent interaction: score and confidence penalty
- withdrawn/deleted evidence: no positive contribution and confidence penalty when relevant
- negative-only candidate: should already be filtered before scoring

Penalty defaults:

| Negative pattern | Score penalty | Confidence penalty |
|---|---:|---:|
| weak negative evidence | 0.10 | 0.05 |
| moderate negative evidence | 0.20 | 0.10 |
| strong negative affinity | 0.35 | 0.20 |
| withdrawn/deleted conflict | 0.25 | 0.35 |

## Contradictory Signals

Contradiction means positive and negative evidence both apply to the same candidate or the evidence direction is materially unclear.

Rules:

1. Preserve both sides as evidence.
2. Add contradiction constraint.
3. Lower confidence before suppressing rank unless the negative side dominates.
4. Suppress the candidate when contradiction makes explanation unsafe.
5. Do not convert contradiction into a neutral middle score without explanation.

Contradiction penalties:

- minor contradiction: `0.10`
- direct positive and negative conflict: `0.20`
- withdrawn or deleted conflict: `0.35`

## Sparse Snapshots

Sparse snapshots reduce confidence and may reduce output count. They do not authorize hidden retrieval.

Sparse snapshot rules:

1. If only one weak evidence source exists, confidence is capped at low.
2. If no direct positive affinity exists, confidence band is capped at medium.
3. If graph-only evidence exists, confidence score is capped at 0.60.
4. If availability is unknown and evidence is weak, confidence score is capped at 0.50.
5. If all evidence is forbidden, raw, private, unresolved, or negative-only, the candidate must not score.

## Cold Start Users

Cold start users have no usable user affinity and no usable user interaction summaries.

Cold-start scoring rules:

1. Score only canonical Work candidates already supplied by the snapshot.
2. Do not use global popularity, ratings, catalog scans, provider feeds, or hidden retrieval.
3. Treat direct entity evidence as weak unless supported by structured discovery context.
4. Cap confidence at medium.
5. Prefer fewer recommendations or empty output over fabricated certainty.
6. Add cold-start constraint to evidence and explanation.

## Confidence Generation

Confidence measures trust in the recommendation evidence, not predicted user enjoyment.

Confidence formula:

`confidenceScore = clamp(0.45 * affinityConfidence + 0.20 * graphConfidence + 0.15 * availabilityConfidence + 0.10 * evidenceDiversity + 0.10 * snapshotCompleteness - penalties, 0, 1)`

Confidence bands:

| Score range | Band |
|---|---|
| `0.00 <= score < 0.45` | `low` |
| `0.45 <= score < 0.75` | `medium` |
| `0.75 <= score <= 1.00` | `high` |

Confidence must be calculated before final rank and then used as a bounded multiplier:

`confidenceAdjustment = 0.70 + (confidenceScore * 0.30)`

This allows confidence to affect ranking without letting weak evidence dominate relevance.

## Candidate Score Formula

V1 base score:

`baseScore = clamp(affinityScore + min(interactionScore, 0.45) + min(graphScore, 0.30) + availabilityEffect - penalties, 0, 1)`

V1 final score:

`finalScore = baseScore * confidenceAdjustment`

Score interpretation:

- score is for deterministic ranking only
- confidence is for trust in the evidence
- explanation must cite source evidence, not numeric internals alone
- constraints must disclose meaningful penalties and caps

## Tie Breaking

Tie breaking must be stable and deterministic.

Sort order:

1. Higher final score.
2. Higher confidence score.
3. Higher direct affinity score.
4. Higher interaction score.
5. Higher evidence diversity count.
6. Clearly available before limited or unknown availability.
7. Fewer contradiction constraints.
8. Fewer negative constraints.
9. Canonical authority before resolved or enriched authority.
10. Lexicographic candidate identity key.

## Deterministic Rules

Scoring must follow these rules:

1. Pure function over candidate pool, `MatchMakerInput` evidence, and versioned constants.
2. No embeddings.
3. No vectors.
4. No LLM reasoning.
5. No graph traversal.
6. No retrieval.
7. No recommendation feedback loops.
8. No Theme inference.
9. No Concept inference.
10. No Author rollups.
11. No hidden scoring.
12. No randomization.
13. No Date calls.
14. Stable decimal rounding policy.
15. Versioned constants for every weight, cap, and penalty.

## Scoring Signal Matrix

| Signal | Allowed | Weight Class | V1 | Notes |
|---|---|---|---|---|
| Explicit Work affinity | Yes | Strong positive | Yes | Highest direct support. |
| Expressive Work affinity | Yes | Strong positive | Yes | Reviews, quotes, discussions via affinity summary. |
| Behavioral Work affinity | Yes | Moderate positive | Yes | Useful but lower trust than explicit/expressive. |
| Derived graph-near affinity | Yes | Weak positive | Yes | Must preserve provenance and remain weak. |
| Negative affinity | Yes | Strong penalty | Yes | Penalizes score and confidence. |
| Active Work interaction | Yes | Moderate support | Yes | Supports diversity and confidence. |
| Withdrawn/deleted interaction | Limited | Penalty/constraint | Yes | No positive contribution. |
| Provided Work graph relationship | Yes | Weak context | Limited | Capped at 0.30 base score. |
| Availability clear | Yes | Small positive | Yes | Delivery boost only. |
| Availability unknown | Yes | Neutral/weak penalty | Yes | Penalizes weak evidence only. |
| Privacy-safe profile context | Yes | Constraint/modulator | Yes | Does not create hidden preference score. |
| Structured discovery context | Conditional | Weak context | Limited | Canonical Work refs only. |
| Raw search text | No | Forbidden | No | Private intent and not evidence. |
| Raw reader history | No | Forbidden | No | Must be summarized before MatchMaker. |
| Recommendation feedback | No | Forbidden | No | Prevents feedback loops. |
| Theme inference | No | Forbidden | No | Blocked until canonical authority. |
| Concept inference | No | Forbidden | No | Blocked until canonical authority. |
| Author rollup | No | Forbidden | No | No Work score from display author aggregation. |

## Confidence Matrix

| Evidence Pattern | Confidence Band | V1 | Notes |
|---|---|---|---|
| Strong explicit or expressive affinity plus entity summary | High | Yes | Requires high source confidence and no major contradiction. |
| Strong affinity plus graph and availability evidence | High | Yes | Best-supported V1 pattern. |
| Moderate affinity plus interaction evidence | Medium | Yes | Good but not high unless source confidence is strong. |
| Behavioral-only evidence | Low to medium | Yes | Cap according to confidence and diversity. |
| Graph-only evidence | Low to medium | Limited | Score cap 0.60 and explanation must say graph context. |
| Availability-only evidence | None | Yes | Availability alone cannot score a candidate. |
| Structured discovery-context-only Work ref | Low | Limited | May rank only when explicitly canonical and privacy-safe. |
| Cold-start direct Work ref | Low to medium | Yes | No hidden popularity fallback. |
| Sparse single-source evidence | Low | Yes | Return fewer recommendations. |
| Positive and negative contradiction | Low to medium | Yes | Preserve contradiction and penalize. |
| Negative-only evidence | None | Yes | Candidate should be filtered before scoring. |

## Negative Signal Matrix

| Signal | Effect | Severity | Notes |
|---|---|---|---|
| Negative affinity | Score and confidence penalty | High | Never averaged away. |
| Strong negative affinity | Suppress weak positives | Critical | Candidate may be filtered if explanation is unsafe. |
| Withdrawn interaction | No positive contribution; confidence penalty | High | May remain only as privacy-safe constraint. |
| Deleted interaction | No positive contribution; suppression context | Critical | Must not identify raw event. |
| Anonymized interaction | No positive contribution | Critical | Must preserve anonymity. |
| Contradictory review/reading pattern | Confidence penalty | Medium | Preserve both evidence sides. |
| Dismissal or rejection summary | Penalty | High | If present as privacy-safe summary. |
| Negative-only candidate | Filter before scoring | Critical | No score should be emitted. |

## Tie Break Matrix

| Rule | Priority | Notes |
|---|---:|---|
| Higher final score | 1 | Primary deterministic order. |
| Higher confidence score | 2 | More trustworthy evidence wins. |
| Higher direct affinity score | 3 | Direct affinity beats contextual support. |
| Higher interaction score | 4 | Active user evidence beats graph context. |
| Higher evidence diversity count | 5 | Multiple safe sources beat single source. |
| Better availability | 6 | Clearly available beats limited or unknown. |
| Fewer contradiction constraints | 7 | Cleaner evidence wins. |
| Fewer negative constraints | 8 | Lower risk wins. |
| Stronger authority state | 9 | Canonical beats resolved or enriched. |
| Lexicographic candidate key | 10 | Final stable fallback. |

## Scoring Lifecycle

| Stage | Responsibility |
|---|---|
| `candidate_received` | Accept eligible candidate from candidate generation. |
| `evidence_grouped` | Group source-specific evidence without merging authority domains. |
| `signals_normalized` | Convert allowed signals into bounded numeric values. |
| `penalties_applied` | Apply negative, contradiction, withdrawal, sparse, and availability penalties. |
| `confidence_generated` | Produce confidence score and band. |
| `base_score_generated` | Produce deterministic base score. |
| `final_score_generated` | Apply bounded confidence adjustment. |
| `ranked` | Sort with deterministic tie-break rules. |
| `ready_for_output` | Pass ranked candidates to output assembly. |

## Future Expansion

Future scoring may add:

- Author scoring after author recommendations are authorized.
- Quote scoring after quote attribution and graph maturity.
- Publication scoring after publication bridge authority.
- Movement and Period scoring after traversal/navigation maturity.
- Theme and Concept scoring after canonical authority and anti-hallucination controls.
- Learned ranking only after deterministic V1 behavior, deletion semantics, privacy controls, and explainability are proven.

Any future change to weights, caps, penalties, confidence bands, or ranking order requires an engine version bump and focused tests.

## Final Answers

The canonical MatchMaker scoring architecture is deterministic weighted scoring over eligible Work candidates, using source-specific evidence from `MatchMakerInput` and fixed versioned constants.

Candidates are scored by combining capped affinity, interaction, graph context, and availability contributions, then subtracting penalties for negative, contradictory, withdrawn, sparse, and privacy-constrained evidence.

Confidence is generated separately from score using evidence strength, evidence diversity, source confidence, availability certainty, snapshot completeness, and penalties. Confidence then modifies final rank through a bounded multiplier.

Ties are broken by final score, confidence, direct affinity, interaction support, evidence diversity, availability, fewer contradictions, fewer negative constraints, authority state, and candidate key.

Negative signals are preserved as evidence, penalties, confidence reductions, and constraints. Negative-only candidates should be filtered before scoring.

Sparse snapshots cap confidence, reduce output count, or produce empty output. They never trigger hidden retrieval.

Cold-start users may score only canonical Work candidates already present in the snapshot, with confidence capped at low or medium.

Scoring is fully specified after this document.

MatchMaker implementation can begin after this document if it remains pure, deterministic, snapshot-only, and does not add APIs, persistence, retrieval, contract changes, graph traversal, LLM reasoning, embeddings, vectors, or subsystem writes.
