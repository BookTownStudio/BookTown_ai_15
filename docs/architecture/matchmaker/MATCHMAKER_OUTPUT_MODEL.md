---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-OUTPUT-MODEL
title: "MatchMaker Output Model"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MatchMaker Output Model

Status: Architectural Authority
Mode: Contracts Only
Created: June 2026
Request: BT-MATCHMAKER-OUTPUT-CONTRACTS-001

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Output Philosophy

MatchMaker outputs are derived literary intelligence. They are not canonical entity truth, graph truth, affinity truth, interaction truth, search truth, or persistence records.

The authoritative output contracts live in `contracts/entityPlatform/matchmakerOutputs.ts` and are mirrored into `functions/src/contracts/shared/entityPlatform/matchmakerOutputs.ts`.

Every output must carry:

- evidence
- explanation
- confidence
- provenance
- constraints
- privacy boundary
- authority boundary

No output may expose raw private events, raw search text, raw reading history, raw reader positions, raw subsystem records, or hidden authority data. Outputs must summarize bounded, privacy-safe evidence only.

## Output Hierarchy

The output contract layer defines six top-level outputs:

| Output | Purpose | V1 Implementation Status |
|---|---|---|
| `MatchMakerRecommendation` | Recommend a target Work entity. | Contracted for V1 |
| `MatchMakerDiscovery` | Introduce meaningful adjacent literary territory. | Contracted for future use |
| `MatchMakerPathway` | Represent an explainable route through evidence. | Contracted for future use |
| `MatchMakerInsight` | Describe literary identity observations. | Contracted for future use |
| `MatchMakerChallenge` | Introduce productive contrast or difficulty. | Contracted for future use |
| `MatchMakerReflection` | Help users understand literary identity. | Contracted for future use |

The shared supporting model is:

- `MatchMakerOutputMetadata`
- `MatchMakerEvidence`
- `MatchMakerExplanation`
- `MatchMakerConfidence`
- `MatchMakerConstraint`
- `MatchMakerReasonClass`
- `MatchMakerEvidenceSource`

## Recommendation Model

`MatchMakerRecommendation` is the V1-ready output for recommending a target entity. In V1 the target is explicitly scoped to a Work reference through `MatchMakerRecommendationTargetRef`.

Recommendation reasons are intentionally bounded:

- `work_reinforcement`
- `work_graph_adjacent`
- `work_affinity_alignment`
- `work_availability_fit`
- `work_profile_context_fit`
- `work_serendipity_context`

Recommendation output may cite privacy-safe affinity, interaction, graph, entity, profile context, availability, and discovery context evidence. It must not cite raw private source data.

## Discovery Model

`MatchMakerDiscovery` introduces adjacent literary territory. It is not a generic recommendation and must include `adjacencySummary` so the output explains why the target expands the user's literary context.

Discovery reasons are bounded:

- `adjacent_work`
- `underexplored_context`
- `safe_novelty`
- `graph_near_discovery`
- `profile_context_discovery`
- `availability_discovery`

V1 must not implement independent discovery generation unless the required evidence is already available inside `MatchMakerInput`.

## Pathway Model

`MatchMakerPathway` represents an ordered route through literary meaning.

Each `MatchMakerPathwayStep` must include:

- stable `stepId`
- numeric `order`
- `entityRef`
- `reasonClass`
- linked `evidenceIds`

Pathways must be explainable from evidence already present in the bounded input snapshot. Multi-hop graph expansion is outside V1 scope.

## Insight Model

`MatchMakerInsight` describes a privacy-safe observation about literary identity or affinity. It must use summarized evidence and must not reveal raw private activity.

Supported insight classes are:

- `identity`
- `affinity`
- `growth`
- `contrast`

Insights are derived observations only. They do not update identity authority.

## Challenge Model

`MatchMakerChallenge` introduces productive contrast, difficulty, breadth, or growth. It must include a target entity, rationale, evidence, explanation, confidence, and constraints.

Supported challenge classes are:

- `contrast`
- `growth`
- `difficulty`
- `breadth`

Challenge outputs must lower confidence or disclose constraints when evidence is indirect, contradictory, or sparse.

## Reflection Model

`MatchMakerReflection` helps the user understand literary identity patterns or choices. It is a derived explanatory output, not a profile update.

Supported reflection classes are:

- `identity`
- `growth`
- `pattern`
- `choice`

Reflection outputs must cite evidence IDs and preserve privacy boundaries.

## Evidence Model

`MatchMakerEvidence` is a privacy-safe evidence summary. It may reference entity refs, related entity refs, relationship IDs, signal classes, provenance, privacy tier, and confidence.

Evidence sources are:

- `affinity`
- `interaction`
- `graph`
- `entity`
- `profile_context`
- `availability`
- `discovery_context`

Evidence must be sufficient to explain the output without exposing raw subsystem records. Evidence summaries should be concise and sanitized.

## Explanation Model

`MatchMakerExplanation` is mandatory on every output.

It includes:

- primary reason class
- all reason classes
- human-readable summary
- evidence IDs
- source boundaries
- privacy boundary
- authority boundary
- constraint IDs

The authority boundary is explicit: `derived_intelligence_not_canonical_truth`.

## Confidence Model

`MatchMakerConfidence` is mandatory on every output and every evidence item.

Confidence includes:

- `band`: `low`, `medium`, or `high`
- `score`: numeric confidence score
- `rationale`: explanation for the assigned confidence
- optional `evidenceCoverage`

V1 engines should treat confidence scores as bounded numeric values from 0.0 to 1.0 and should reject invalid values in implementation code. This contract phase defines the type surface only.

## Privacy Model

MatchMaker outputs must preserve or narrow input privacy. They must not widen privacy visibility.

Forbidden output data:

- raw private events
- raw search text
- raw reading history
- raw reader positions or anchors
- raw shelves, bookmarks, reviews, or quotes beyond privacy-safe summaries
- subsystem-owned authority payloads
- hidden model inference that cannot be traced to evidence

Every output carries `privacyTier` in metadata and every evidence item carries its own `privacyTier`.

## Governance Rules

1. MatchMaker outputs are derived intelligence.
2. MatchMaker outputs are not canonical truth.
3. MatchMaker outputs do not create entity authority.
4. MatchMaker outputs do not create graph authority.
5. MatchMaker outputs do not create affinity authority.
6. Every output must include evidence, explanation, confidence, provenance, and constraints.
7. Output evidence must be privacy-safe and bounded.
8. Recommendation feedback must not feed into truth layers without a separately audited contract.
9. The output contract layer must remain implementation-neutral.
10. Runtime behavior belongs to future MatchMaker engine phases, not this contract phase.

## V1 Scope

V1 output implementation scope is Work recommendations only.

V1 may emit `MatchMakerRecommendation` for Work targets when a pure MatchMaker engine exists. V1 must not implement independent discovery, multi-hop pathways, insight generation, challenge generation, reflection generation, retrieval, persistence, APIs, embeddings, or AI reasoning in this phase.

The older output-shaped interfaces in `contracts/entityPlatform/matchmaker.ts` remain compatibility surface. New implementation work must use `matchmakerOutputs.ts` as the authoritative output contract.

## Future Evolution

Future phases may implement the contracted output families after the relevant authority layers mature:

- Discovery after bounded entity-aware discovery evidence exists.
- Pathways after non-book graph traversal contracts mature.
- Insights after identity observation governance is defined.
- Challenges after contradiction and difficulty models are implemented.
- Reflections after user-facing literary identity explanation governance is approved.

Any behavior change must add focused tests, preserve mirror contract parity, and update this document when the output contract semantics change.
