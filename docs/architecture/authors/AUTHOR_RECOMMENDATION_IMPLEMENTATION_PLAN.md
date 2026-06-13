---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-RECOMMENDATION-IMPLEMENTATION-PLAN
title: "Author Recommendation Implementation Plan"
status: draft
authority_level: architecture
owner: author-platform
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

# Author Recommendation Implementation Plan

Status: IMPLEMENTATION_BLUEPRINT

Request: BT-AUTHOR-RECOMMENDATION-IMPLEMENTATION-PLAN-001

Owner: Author Intelligence

## Purpose

This document defines the complete implementation blueprint for the first Author Recommendation Engine.

It authorizes no production code by itself. It specifies the exact engine topology, files, exports, types, pipeline stages, tests, validation commands, feature flag strategy, privacy checklist, and implementation sequence that a future implementation request must follow.

The engine is a separate pure Author Recommendation engine governed by MatchMaker-style intelligence standards. It is not a MatchMaker V1 expansion. MatchMaker V1 remains Work-only.

## Governing Authorities

- `docs/architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md`
- `docs/architecture/authors/AUTHOR_RECOMMENDATION_CANDIDATE_UNIVERSE.md`
- `docs/architecture/authors/AUTHOR_RECOMMENDATION_SCORING_MODEL.md`
- `docs/architecture/authors/AUTHOR_RECOMMENDATION_CONFIDENCE_EXPLANATION_MODEL.md`
- `docs/architecture/authors/AUTHOR_RECOMMENDATION_OUTPUT_CONTRACT.md`
- `docs/architecture/authors/AUTHOR_RECOMMENDATION_CONSUMPTION_MODEL.md`
- `docs/architecture/authors/AUTHOR_IDENTITY_COMPLETION.md`
- `docs/architecture/authors/AUTHOR_AFFINITY_COMPLETION.md`
- `docs/architecture/authors/WORK_TO_AUTHOR_ROLLUP_COMPLETION.md`
- MatchMaker V1 authorities for boundary preservation only

## Recommended Engine Architecture

Author Recommendations must be implemented as an adjacent pure domain engine:

```text
lib/domain/authorRecommendations/
```

This engine may consume canonical Entity Platform, Identity Graph, and Affinity Layer data already provided to it by callers. It must not retrieve, persist, mutate, or create authority data.

The first product integration target is future Discovery, behind the `authorRecommendationsDiscovery` feature flag. Discovery integration is not part of the engine implementation and requires a separate implementation request.

## Exact Files

The implementation request must create only the engine and test files listed in the directory structure below. Any product integration, UI, Firestore, Functions endpoint, Search, Reader, or MatchMaker V1 file requires separate authority.

## Non-Goals

The implementation must not introduce:

- MatchMaker V1 target changes
- Author recommendations inside MatchMaker V1 outputs
- Firestore reads or writes
- API endpoints
- persistence
- Search changes
- Reader changes
- UI changes
- graph traversal
- popularity fallback
- recommendation feedback loops
- Work recommendations
- social suggestions
- LLM, embedding, vector, or retrieval behavior

## Directory Structure

Create:

```text
lib/domain/authorRecommendations/
  candidateGeneration.ts
  candidateFiltering.ts
  scoring.ts
  confidence.ts
  explanations.ts
  outputAssembly.ts
  ranking.ts
  types.ts
  authorRecommendationEngine.ts
  index.ts

test/domain/authorRecommendations/
  candidateGeneration.test.ts
  candidateFiltering.test.ts
  scoring.test.ts
  confidence.test.ts
  explanations.test.ts
  outputAssembly.test.ts
  authorRecommendationEngine.test.ts
```

Do not place this engine under `lib/domain/matchmaker/v1/`.

## File Matrix

| File | Responsibility | Exports |
|---|---|---|
| `types.ts` | Internal and output types for the pure engine | all Author Recommendation engine types |
| `candidateGeneration.ts` | Build bounded candidate pool from approved Author affinity inputs | `generateAuthorRecommendationCandidates` |
| `candidateFiltering.ts` | Enforce canonical identity, summary, privacy, evidence, lifecycle, and suppression rules | `filterAuthorRecommendationCandidates` |
| `scoring.ts` | Rank eligible candidates using approved scoring inputs only | `scoreAuthorRecommendationCandidate` |
| `confidence.ts` | Generate confidence independently from score and rank | `generateAuthorRecommendationConfidence` |
| `explanations.ts` | Build deterministic privacy-safe explanations | `generateAuthorRecommendationExplanation` |
| `outputAssembly.ts` | Assemble contract-shaped AuthorRecommendation outputs | `assembleAuthorRecommendation` |
| `ranking.ts` | Sort scored candidates deterministically and enforce result bounds | `rankAuthorRecommendationCandidates` |
| `authorRecommendationEngine.ts` | Orchestrate the pure pipeline | `runAuthorRecommendationEngine` |
| `index.ts` | Public module surface | re-export public types and engine functions |

## Export Inventory

`lib/domain/authorRecommendations/index.ts` must export:

```ts
export * from "./types";
export * from "./authorRecommendationEngine";
export * from "./candidateGeneration";
export * from "./candidateFiltering";
export * from "./scoring";
export * from "./confidence";
export * from "./explanations";
export * from "./outputAssembly";
export * from "./ranking";
```

The public engine entry point is:

```ts
runAuthorRecommendationEngine(input: AuthorRecommendationInput): AuthorRecommendationResult
```

No default exports.

## Type Definitions Required

Define in `types.ts`.

```ts
export interface AuthorRecommendationInput {
  readonly uid: string;
  readonly generatedAt: string;
  readonly maxResults?: number;
  readonly authorSummaries: readonly EntitySummary[];
  readonly authorAffinities: readonly EntityAffinity[];
  readonly constraints?: readonly AuthorRecommendationInputConstraint[];
}
```

```ts
export interface AuthorRecommendation {
  readonly metadata: AuthorRecommendationMetadata;
  readonly targetAuthorRef: LiteraryEntityRef;
  readonly targetSummary: EntitySummary;
  readonly reason: AuthorRecommendationReason;
  readonly evidence: readonly AuthorRecommendationEvidence[];
  readonly explanation: AuthorRecommendationExplanation;
  readonly confidence: AuthorRecommendationConfidence;
  readonly constraints: readonly AuthorRecommendationConstraint[];
}
```

Required supporting types:

- `AuthorRecommendationMetadata`
- `AuthorRecommendationReason`
- `AuthorRecommendationEvidence`
- `AuthorRecommendationEvidenceSource`
- `AuthorRecommendationExplanation`
- `AuthorRecommendationConfidence`
- `AuthorRecommendationConfidenceBand`
- `AuthorRecommendationConstraint`
- `AuthorRecommendationConstraintType`
- `AuthorRecommendationInputConstraint`
- `AuthorRecommendationCandidate`
- `EligibleAuthorRecommendationCandidate`
- `ScoredAuthorRecommendationCandidate`
- `AuthorRecommendationResult`

## Type Rules

1. `targetAuthorRef.entityType` must be `"author"`.
2. `targetAuthorRef.authorityState` must be `"canonical"`.
3. `targetAuthorRef.authoritySource` must be `"author_authority"`.
4. Every output must include at least one evidence item.
5. Every output must include explanation, confidence, constraints, metadata, and target summary.
6. Numeric confidence scores are internal by default.
7. Output IDs must be deterministic and must not become entity, graph, affinity, identity, search, or feedback-loop keys.

## Pipeline Architecture

```text
AuthorRecommendationInput
  -> Candidate Generation
  -> Candidate Filtering
  -> Scoring
  -> Confidence Generation
  -> Explanation Generation
  -> Output Assembly
  -> Deterministic Ranking
  -> AuthorRecommendationResult
```

## Pipeline Matrix

| Stage | Input | Output |
|---|---|---|
| Candidate Generation | `AuthorRecommendationInput` | `AuthorRecommendationCandidate[]` |
| Candidate Filtering | candidates + input | `EligibleAuthorRecommendationCandidate[]` |
| Scoring | eligible candidate | `ScoredAuthorRecommendationCandidate` |
| Confidence Generation | eligible candidate evidence, lifecycle, privacy, contradictions | `AuthorRecommendationConfidence` |
| Explanation Generation | eligible candidate, confidence | `AuthorRecommendationExplanation` |
| Output Assembly | scored candidate, confidence, explanation | `AuthorRecommendation` |
| Deterministic Ranking | recommendations | bounded `AuthorRecommendation[]` |

## Function Matrix

| Function | Input | Output |
|---|---|---|
| `runAuthorRecommendationEngine` | `AuthorRecommendationInput` | `AuthorRecommendationResult` |
| `generateAuthorRecommendationCandidates` | `AuthorRecommendationInput` | `AuthorRecommendationCandidate[]` |
| `filterAuthorRecommendationCandidates` | candidates, input | `EligibleAuthorRecommendationCandidate[]` |
| `scoreAuthorRecommendationCandidate` | eligible candidate | `ScoredAuthorRecommendationCandidate` |
| `generateAuthorRecommendationConfidence` | eligible or scored candidate | `AuthorRecommendationConfidence` |
| `generateAuthorRecommendationExplanation` | eligible candidate, confidence | `AuthorRecommendationExplanation` |
| `assembleAuthorRecommendation` | scored candidate, confidence, explanation | `AuthorRecommendation` |
| `rankAuthorRecommendationCandidates` | recommendations, max results | `AuthorRecommendation[]` |

## Candidate Generation Design

Candidate generation may create candidates only from approved Author affinity inputs:

- direct Author affinity
- Work-to-Author rolled Author affinity
- direct and rolled Author affinity agreement

Candidate generation must not create candidates from:

- Work affinity directly
- Work interaction directly
- single Work behavior
- graph proximity
- popularity
- search behavior
- display-name matching
- provider metadata alone
- MatchMaker outputs

Generation rules:

1. Group `authorAffinities` by canonical Author entity ID.
2. Ignore non-Author affinity records.
3. Ignore non-canonical Author refs.
4. Ignore inactive, withdrawn, deleted, anonymized, expired, or suppressive affinity when detectable from input.
5. Attach matching `EntitySummary` by canonical Author ID.
6. Deduplicate by canonical `authorRef.entityId`.
7. Preserve evidence source classes without raw private evidence.
8. Bound the candidate pool before scoring.

V1 implementation limit:

```text
MAX_AUTHOR_RECOMMENDATION_CANDIDATES = 100
DEFAULT_AUTHOR_RECOMMENDATION_RESULTS = 10
MAX_AUTHOR_RECOMMENDATION_RESULTS = 20
```

## Filtering Design

Hard reject any candidate when:

- target is not `entityType === "author"`
- target is not canonical
- target authority source is not `author_authority`
- no display-safe Author summary exists
- no approved active evidence exists
- evidence is search-only
- evidence is graph-only
- evidence is popularity-only
- evidence is display-name-only
- evidence is single-Work-only
- privacy tier cannot be preserved
- privacy-safe explanation cannot be produced
- negative evidence count is greater than or equal to positive evidence count
- direct Author follow is withdrawn and no eligible non-suppressed evidence remains
- Author identity conflicts exist

Filtering must happen before scoring. Scoring must never rescue an ineligible candidate.

## Scoring Design

Scoring applies only to eligible candidates.

Use the approved formula:

```text
baseScore =
  0.45 * directAffinityScore +
  0.30 * rolledAffinityScore +
  0.10 * evidenceDiversityScore +
  0.07 * recencyScore +
  0.08 * agreementScore

finalScore = clamp(baseScore - penalties, 0, scoreCap)
```

Approved scoring inputs:

- direct Author affinity
- rolled-up Author affinity
- direct and rolled agreement
- evidence diversity
- recency of approved affinity
- negative evidence as penalty
- withdrawn evidence as penalty or suppression
- privacy limitation as small penalty

Forbidden scoring inputs:

- popularity
- follower count
- graph proximity alone
- search behavior
- display names
- provider metadata alone
- one Work read/completed
- raw reading history
- raw review text
- raw quote text
- MatchMaker output feedback
- randomness

Score must not read confidence, output rank, UI state, or surface state.

## Confidence Design

Confidence is generated independently from score and rank.

Use the approved formula:

```text
confidence =
  0.40 * directEvidenceTrust +
  0.25 * rolledEvidenceTrust +
  0.15 * evidenceDiversity +
  0.10 * lifecycleTrust +
  0.10 * explanationCompleteness
  - penalties
```

Then apply caps:

| Condition | Cap |
|---|---:|
| Direct + rolled evidence, no contradiction | 0.90 |
| Direct Author affinity only | 0.74 |
| Rolled Author affinity only | 0.70 |
| Rolled evidence with private withholding | 0.60 |
| Contradictory evidence | 0.55 |
| Withdrawn direct Author follow present | 0.50 |
| Negative-heavy evidence | 0.44 or suppress |

Confidence must not read:

- final score
- base score
- rank
- position
- popularity
- UI surface
- predicted enjoyment

Confidence band mapping:

| Band | Range |
|---|---:|
| `low` | `0.00-0.44` |
| `medium` | `0.45-0.74` |
| `high` | `0.75-1.00` |

High confidence requires direct Author affinity plus reinforcing evidence. Rolled evidence alone cannot produce high confidence.

## Explanation Design

Every recommendation must include a deterministic privacy-safe explanation.

Mandatory explanation components:

- primary reason class
- evidence source classes
- confidence band
- confidence rationale
- privacy boundary
- authority boundary
- contradiction note when applicable

Allowed explanation patterns:

- direct Author affinity
- rolled Author affinity
- direct and rolled Author affinity
- mixed or contradictory evidence
- privacy-limited evidence

Forbidden explanation content:

- raw reading history
- raw shelf names
- raw review text
- raw quotes
- raw search text
- private activity details
- evidence IDs in user-facing text
- output IDs in user-facing text
- hidden scoring formulas
- popularity claims
- display-name identity claims
- predicted enjoyment claims

The explanation must only describe evidence actually used by the engine.

## Output Assembly Design

Assemble `AuthorRecommendation` outputs exactly according to `AUTHOR_RECOMMENDATION_OUTPUT_CONTRACT.md`.

Required output fields:

- `metadata`
- `targetAuthorRef`
- `targetSummary`
- `reason`
- `evidence`
- `explanation`
- `confidence`
- `constraints`

Output assembly must suppress a candidate if:

- evidence is empty
- explanation is missing
- confidence is missing
- target summary is missing
- target ref is non-canonical
- privacy constraints cannot be represented
- reason class is forbidden

Allowed reason classes:

- `direct_author_affinity`
- `rolled_author_affinity`
- `direct_and_rolled_author_affinity`
- `author_identity_reinforcement`
- `author_exploration`

Required constraints on every output:

- no popularity-only recommendation
- no graph-only recommendation
- no display-name identity
- no single-Work recommendation
- preserve privacy tier
- derived intelligence, not canonical truth

## Deterministic Ranking Rules

Apply tie breaks in this order:

1. higher `finalScore`
2. direct plus rolled evidence beats single-source evidence
3. higher confidence band
4. fewer contradictions
5. more distinct approved evidence classes
6. more recent approved evidence
7. lexicographic `targetAuthorRef.entityId`

No randomness, current-time tie breakers, insertion-order tie breakers, or unstable sort behavior are allowed.

`generatedAt` must come from input. The engine must not call `Date.now()` or `new Date()` internally.

## Feature Flag Strategy

The pure engine does not read feature flags.

Feature flag enforcement belongs to future consumption/integration code. The first approved consumer must use:

```text
authorRecommendationsDiscovery
```

Required behavior for future Discovery integration:

- default off
- when off, preserve existing Discovery behavior
- when on, call the engine only for the approved Discovery module
- empty result falls back to no module
- errors fall back to no module
- no popular Author fallback
- no Search fallback
- no graph-near fallback

## Future Discovery Integration Boundary

Discovery integration must be separate from engine implementation.

Future Discovery adapter responsibilities:

- build `AuthorRecommendationInput` from already-authorized Author summaries and affinities
- invoke `runAuthorRecommendationEngine`
- transform outputs into existing or approved Discovery DTOs
- display only privacy-safe fields
- preserve navigation to Author Details
- preserve confidence band only
- omit raw evidence, evidence IDs, output IDs, and numeric confidence
- maintain per-user caching if caching is introduced
- log telemetry as counts, bands, source classes, latency buckets, fallback reason, and flag state only

Discovery integration must not:

- query Search as fallback
- create new authority data
- persist recommendation outputs
- feed recommendation outputs back into affinity or candidate generation
- mutate Identity Graph, Affinity Layer, Literary Graph, or MatchMaker

## Privacy Validation Checklist

Implementation tests must prove:

- no raw reading history appears in output display text
- no raw shelf name appears in output display text
- no raw review text appears in output display text
- no raw quote text appears in output display text
- no raw search text appears in output display text
- no evidence IDs appear in user-facing explanation text
- no output IDs appear in user-facing explanation text
- numeric confidence is marked internal and is not required for default display
- privacy tier is preserved or narrowed from contributing evidence
- private evidence is summarized only as aggregate source classes
- privacy-unsafe candidates are suppressed

## Test Inventory

| Test Suite | Coverage |
|---|---|
| `candidateGeneration.test.ts` | approved sources, deduplication, canonical Author refs, candidate bounds, forbidden sources |
| `candidateFiltering.test.ts` | hard rejects, missing summaries, withdrawn/suppressed evidence, privacy unsafe evidence, single-Work-only rejection |
| `scoring.test.ts` | approved formula, forbidden inputs ignored, penalties, caps, no confidence dependency |
| `confidence.test.ts` | evidence-trust formula, caps, bands, no score/rank dependency, contradiction handling |
| `explanations.test.ts` | mandatory components, privacy-safe summaries, forbidden raw evidence, contradiction/privacy notes |
| `outputAssembly.test.ts` | required fields, evidence non-empty, constraints present, deterministic output IDs, canonical target |
| `authorRecommendationEngine.test.ts` | end-to-end pipeline, deterministic execution, bounded outputs, empty/failure-safe behavior |

## Required Regression Tests

- direct Author affinity creates eligible candidate
- rolled Author affinity creates eligible candidate
- direct plus rolled evidence deduplicates into one candidate
- non-Author affinity cannot create candidate
- non-canonical Author cannot create candidate
- missing Author summary suppresses candidate
- withdrawn direct affinity suppresses or caps according to evidence state
- negative evidence greater than or equal to positive evidence suppresses candidate
- graph-only input cannot create recommendation
- popularity-only input cannot create recommendation
- search-only input cannot create recommendation
- single-Work-only input cannot create recommendation
- score does not read confidence
- confidence does not read score, rank, or position
- repeated identical input produces identical output
- output count is bounded
- every output has evidence, explanation, confidence, constraints, metadata, and provenance
- no raw private evidence appears in explanation text
- deterministic tie breaks use lexicographic Author ID last

## Validation Commands

Required targeted validation:

```bash
npx vitest run test/domain/authorRecommendations/*.test.ts
```

Required adjacent validation:

```bash
npx vitest run test/domain/affinity/*.test.ts test/domain/identityGraph/userEntityInteractionAdapter.test.ts test/domain/authorRecommendations/*.test.ts
```

Required contract sync validation:

```bash
node functions/scripts/syncContracts.cjs
```

Required TypeScript validation:

```bash
npm run typecheck:functions
```

If repo-wide typecheck failures unrelated to Author Recommendations exist, report them separately with file references and do not hide them.

## Implementation Sequence

1. Create `types.ts` with strict internal and output types.
2. Create `candidateGeneration.ts` and candidate generation tests.
3. Create `candidateFiltering.ts` and filtering tests.
4. Create `scoring.ts` and scoring tests.
5. Create `confidence.ts` and confidence tests.
6. Create `explanations.ts` and explanation tests.
7. Create `outputAssembly.ts` and output assembly tests.
8. Create `ranking.ts` and deterministic tie-break coverage.
9. Create `authorRecommendationEngine.ts` and end-to-end tests.
10. Create `index.ts` exports.
11. Run targeted Author Recommendation tests.
12. Run adjacent affinity and identity tests.
13. Run contract sync validation.
14. Run TypeScript validation.
15. Produce implementation report with files, exports, tests, validation results, known risks, and boundary confirmation.

## Architecture Compliance Requirements

The implementation is compliant only if:

- engine is pure and deterministic
- engine has no side effects
- engine performs no retrieval
- engine performs no persistence
- engine imports no Firestore, Functions runtime, Search, Reader, UI, or MatchMaker V1 engine modules
- candidates are Author-only
- outputs are AuthorRecommendation-only
- every recommendation is explainable
- every recommendation has evidence
- confidence is independent from score
- score is independent from confidence
- no popularity, graph-only, search-only, display-name-only, or single-Work-only candidate can be produced
- no recommendation output feeds future recommendation input

## Future Expansion Rules

Future phases may add:

- Discovery integration
- Home integration after Discovery validation
- Author Details integration after separate authority
- additional Author-specific evidence sources after new authority
- MatchMaker Author target participation only through a future versioned MatchMaker expansion

Future phases must not reinterpret this engine as:

- Search
- social suggestions
- popularity ranking
- MatchMaker V1 output
- entity authority
- affinity authority
- identity authority
- graph authority

## Implementation Readiness Verdict

Author Recommendations are ready for a bounded engine implementation request after this plan is approved.

The next request should be:

```text
BT-AUTHOR-RECOMMENDATION-ENGINE-IMPLEMENTATION-001
```

That request must create only the files listed in this plan, add only the tests listed in this plan, preserve MatchMaker V1 as Work-only, and defer Discovery product integration to a separate request.
