# MatchMaker V1 Implementation Plan

Status: IMPLEMENTATION_BLUEPRINT
Mode: Read Only
Owner: MatchMaker
Request: BT-MATCHMAKER-V1-IMPLEMENTATION-PLAN-001
Implementation Target: BT-MATCHMAKER-V1-IMPLEMENTATION-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_REGISTER.md`
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_UNIVERSE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_GENERATION.md`
- `docs/architecture/matchmaker/MATCHMAKER_SCORING_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_EXPLANATION_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_CONFIDENCE_MODEL.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`
- `lib/domain/matchmaker/matchmakerSnapshotAdapter.ts`

## Architecture Authority Decision

BT-MATCHMAKER-V1-IMPLEMENTATION-001 must implement a pure, deterministic, side-effect-free MatchMaker V1 engine under `lib/domain/matchmaker/`.

The engine must consume only `MatchMakerInput` and explicit deterministic options. It must return `readonly MatchMakerRecommendation[]`. It must not access Firestore, Functions, APIs, Search, Reader, Graph storage, Identity Graph storage, Affinity Layer storage, UI state, schemas, indexes, or raw data.

The existing `matchmakerSnapshotAdapter.ts` remains unchanged. It is an upstream compatibility adapter, not the engine.

## Engine Overview

MatchMaker V1 is a Work-only recommendation engine.

Core flow:

1. Normalize bounded `MatchMakerInput`.
2. Generate Work candidates.
3. Filter candidates.
4. Assemble evidence.
5. Score candidates.
6. Generate confidence.
7. Generate explanations.
8. Assemble `MatchMakerRecommendation` outputs.
9. Sort deterministically.
10. Return bounded output.

The implementation must be synchronous and pure.

## Directory Structure

Target directory:

```text
lib/domain/matchmaker/
  index.ts
  matchmakerSnapshotAdapter.ts
  v1/
    constants.ts
    types.ts
    identity.ts
    candidates.ts
    filtering.ts
    evidence.ts
    scoring.ts
    confidence.ts
    explanations.ts
    output.ts
    engine.ts
```

Test directory:

```text
test/domain/matchmaker/
  matchmakerSnapshotAdapter.test.ts
  matchmakerV1Engine.test.ts
  matchmakerV1Candidates.test.ts
  matchmakerV1Scoring.test.ts
  matchmakerV1Confidence.test.ts
  matchmakerV1Explanations.test.ts
  matchmakerV1Privacy.test.ts
  matchmakerV1Determinism.test.ts
```

## File Inventory

| File | Responsibility | Exports |
|---|---|---|
| `lib/domain/matchmaker/v1/constants.ts` | Versioned V1 limits, weights, caps, reason constants, deterministic output limits. | `MATCHMAKER_V1_ENGINE_VERSION`, `MATCHMAKER_V1_LIMITS`, `MATCHMAKER_V1_WEIGHTS`, `MATCHMAKER_V1_CONFIDENCE` |
| `lib/domain/matchmaker/v1/types.ts` | Internal readonly engine types. Not contract replacements. | `MatchMakerV1Options`, `MatchMakerV1Candidate`, `MatchMakerV1CandidateEvidence`, `MatchMakerV1ScoredCandidate`, `MatchMakerV1SuppressionReason` |
| `lib/domain/matchmaker/v1/identity.ts` | Stable candidate keys, authority-state checks, Work ref guards. | `toMatchMakerV1EntityKey`, `isV1WorkRef`, `isActiveV1AuthorityState`, `preferV1OutputRef` |
| `lib/domain/matchmaker/v1/candidates.ts` | Candidate acquisition, one-hop snapshot graph expansion, deduplication. | `generateMatchMakerV1Candidates` |
| `lib/domain/matchmaker/v1/filtering.ts` | Hard and soft generation filters before scoring. | `filterMatchMakerV1Candidates` |
| `lib/domain/matchmaker/v1/evidence.ts` | Source-specific `MatchMakerEvidence` assembly from candidate evidence handles. | `assembleMatchMakerV1Evidence` |
| `lib/domain/matchmaker/v1/scoring.ts` | Deterministic fixed-weight score calculation and tie-sort values. | `scoreMatchMakerV1Candidate`, `rankMatchMakerV1Candidates` |
| `lib/domain/matchmaker/v1/confidence.ts` | Confidence score, band, caps, and rationale. | `calculateMatchMakerV1Confidence`, `toMatchMakerV1ConfidenceBand` |
| `lib/domain/matchmaker/v1/explanations.ts` | Deterministic `MatchMakerExplanation` assembly. | `buildMatchMakerV1Explanation` |
| `lib/domain/matchmaker/v1/output.ts` | `MatchMakerRecommendation` output assembly and output IDs. | `toMatchMakerV1Recommendation`, `toMatchMakerV1OutputId` |
| `lib/domain/matchmaker/v1/engine.ts` | Orchestrates the V1 pipeline. | `runMatchMakerV1` |
| `lib/domain/matchmaker/index.ts` | Barrel export for existing adapter and V1 engine. | existing adapter exports plus V1 public exports |

## Export Inventory

Public exports from `lib/domain/matchmaker/v1/engine.ts`:

```ts
export function runMatchMakerV1(
  input: MatchMakerInput,
  options?: MatchMakerV1Options
): readonly MatchMakerRecommendation[];
```

Public exports from `lib/domain/matchmaker/v1/types.ts`:

```ts
export interface MatchMakerV1Options {
  readonly generatedAt: string;
  readonly maxRecommendations?: number;
}
```

Public exports from `lib/domain/matchmaker/index.ts` after implementation:

```ts
export * from "./matchmakerSnapshotAdapter";
export { runMatchMakerV1 } from "./v1/engine";
export type { MatchMakerV1Options } from "./v1/types";
```

Internal helpers may be exported for direct tests, but they must remain under `v1/` and must not become product API surface.

## Pipeline Stages

| Stage | Input | Output |
|---|---|---|
| Normalize options | `MatchMakerInput`, `MatchMakerV1Options` | resolved deterministic options |
| Candidate generation | `MatchMakerInput` | readonly `MatchMakerV1Candidate[]` |
| Candidate filtering | candidates, input constraints | eligible candidates plus suppressed diagnostics for tests |
| Evidence assembly | candidate, input | readonly `MatchMakerEvidence[]` |
| Scoring | candidate, evidence | `MatchMakerV1ScoredCandidate` |
| Confidence | scored candidate, evidence, constraints | `MatchMakerConfidence` |
| Explanation | scored candidate, evidence, confidence, constraints | `MatchMakerExplanation` |
| Output assembly | candidate, evidence, confidence, explanation | `MatchMakerRecommendation` |
| Ranking | recommendations and scored candidates | deterministic order |
| Bounding | ranked recommendations | max 20 by default |

## Function Signatures

```ts
export function toMatchMakerV1EntityKey(ref: LiteraryEntityRef): string;
```

```ts
export function isV1WorkRef(
  ref: LiteraryEntityRef
): ref is MatchMakerRecommendationTargetRef;
```

```ts
export function isActiveV1AuthorityState(ref: LiteraryEntityRef): boolean;
```

```ts
export function preferV1OutputRef(
  refs: readonly LiteraryEntityRef[]
): MatchMakerRecommendationTargetRef | undefined;
```

```ts
export function generateMatchMakerV1Candidates(
  input: MatchMakerInput
): readonly MatchMakerV1Candidate[];
```

```ts
export function filterMatchMakerV1Candidates(
  candidates: readonly MatchMakerV1Candidate[],
  input: MatchMakerInput
): readonly MatchMakerV1Candidate[];
```

```ts
export function assembleMatchMakerV1Evidence(
  candidate: MatchMakerV1Candidate,
  input: MatchMakerInput
): readonly MatchMakerEvidence[];
```

```ts
export function scoreMatchMakerV1Candidate(
  candidate: MatchMakerV1Candidate,
  evidence: readonly MatchMakerEvidence[]
): MatchMakerV1ScoredCandidate;
```

```ts
export function calculateMatchMakerV1Confidence(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[]
): MatchMakerConfidence;
```

```ts
export function toMatchMakerV1ConfidenceBand(score: number): MatchMakerConfidenceBand;
```

```ts
export function buildMatchMakerV1Explanation(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[],
  confidence: MatchMakerConfidence
): MatchMakerExplanation;
```

```ts
export function toMatchMakerV1OutputId(
  candidateKey: string,
  evidenceIds: readonly string[]
): string;
```

```ts
export function toMatchMakerV1Recommendation(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[],
  confidence: MatchMakerConfidence,
  explanation: MatchMakerExplanation,
  options: MatchMakerV1Options
): MatchMakerRecommendation;
```

```ts
export function rankMatchMakerV1Candidates(
  candidates: readonly MatchMakerV1ScoredCandidate[]
): readonly MatchMakerV1ScoredCandidate[];
```

```ts
export function runMatchMakerV1(
  input: MatchMakerInput,
  options?: MatchMakerV1Options
): readonly MatchMakerRecommendation[];
```

## Candidate Processing Flow

Candidate generation must:

1. Read only `MatchMakerInput`.
2. Accept Work refs from `entityRefs`.
3. Accept Work refs from `entitySummaries`.
4. Accept positive or neutral Work refs from `userAffinitySummaries`.
5. Accept active Work refs from `interactionSummaries`.
6. Accept one-hop Work graph endpoints only from provided `graphRelationshipSummaries` connected to a known Work seed.
7. Accept structured discovery-context Work refs only if implementation guards prove canonical refs.
8. Deduplicate by `entityType + ":" + canonicalId-or-entityId`.
9. Preserve evidence handles.
10. Apply hard filters before scoring.

Candidate generation must not use raw search text, raw reader history, display strings, provider aliases, graph proximity alone, recommendation outputs, Theme inference, Concept inference, retrieval, or traversal.

## Scoring Flow

Scoring must:

1. Calculate affinity contribution from `EntityAffinity`.
2. Calculate interaction contribution from active `UserEntityInteraction`.
3. Calculate graph contribution from provided relationships only.
4. Apply availability effect.
5. Apply negative, withdrawn, contradiction, sparse, and privacy penalties.
6. Clamp base score to `[0, 1]`.
7. Calculate confidence separately.
8. Apply bounded confidence adjustment.
9. Preserve tie-break fields for deterministic ranking.

No hidden score inputs are allowed.

## Confidence Flow

Confidence must:

1. Read source confidence from evidence.
2. Measure evidence diversity.
3. Measure snapshot completeness.
4. Apply penalties.
5. Apply caps.
6. Assign low, medium, or high band.
7. Produce privacy-safe rationale.
8. Attach to every output and evidence item.

Confidence must not mean predicted enjoyment, predicted rating, canonical truth, popularity, graph importance, recommendation score, or affinity strength.

## Explanation Flow

Explanation assembly must:

1. Select primary reason class deterministically.
2. Preserve all applicable reason classes.
3. Reference evidence IDs.
4. Reference constraint IDs.
5. Include source boundaries.
6. Include privacy boundary.
7. Include authority boundary `derived_intelligence_not_canonical_truth`.
8. Include confidence rationale.
9. Avoid raw private data, hidden weights, formulas, embeddings, vectors, LLM traces, and raw scoring internals.

V1 explanations are deterministic template assembly, not LLM generation.

## Output Assembly Flow

Output assembly must:

1. Use `MatchMakerRecommendation`.
2. Set `metadata.outputType` to `recommendation`.
3. Set `metadata.contractVersion` from `ENTITY_PLATFORM_CONTRACT_VERSION`.
4. Use injected `generatedAt`.
5. Use deterministic output ID from engine version, candidate key, and evidence IDs.
6. Use Work-only `targetEntityRef`.
7. Include optional `targetSummary` only when safe summary exists.
8. Include `evidence`, `explanation`, `confidence`, and `constraints`.
9. Set privacy tier no broader than included evidence.
10. Return no more than `maxRecommendations`, default 20.

## Test Strategy

Tests must use existing contract factories and adapter fixtures where possible. They must not mock Firestore, APIs, Search, Reader, or UI because the engine must not depend on them.

## Test Inventory

| Test Suite | Coverage |
|---|---|
| `test/domain/matchmaker/matchmakerV1Engine.test.ts` | End-to-end pure engine: empty input, Work recommendation, output contract shape, bounded output. |
| `test/domain/matchmaker/matchmakerV1Candidates.test.ts` | Candidate sources, Work-only filtering, dedupe, graph one-hop snapshot expansion, forbidden sources. |
| `test/domain/matchmaker/matchmakerV1Scoring.test.ts` | Affinity weights, interaction weights, graph cap, availability effects, negative penalties, tie fields. |
| `test/domain/matchmaker/matchmakerV1Confidence.test.ts` | Confidence formula, bands, caps, sparse snapshot, cold start, contradiction, negative signals. |
| `test/domain/matchmaker/matchmakerV1Explanations.test.ts` | Evidence IDs, reason class selection, privacy boundary, authority boundary, no raw private text. |
| `test/domain/matchmaker/matchmakerV1Privacy.test.ts` | No raw search text, no raw reading history, no private event leakage, privacy tier narrowing. |
| `test/domain/matchmaker/matchmakerV1Determinism.test.ts` | Same input produces identical output, stable ordering, no Date dependency except injected `generatedAt`. |
| `test/domain/matchmaker/matchmakerSnapshotAdapter.test.ts` | Existing adapter tests remain unchanged. |

## Function Matrix

| Function | Input | Output |
|---|---|---|
| `runMatchMakerV1` | `MatchMakerInput`, `MatchMakerV1Options` | readonly `MatchMakerRecommendation[]` |
| `generateMatchMakerV1Candidates` | `MatchMakerInput` | readonly `MatchMakerV1Candidate[]` |
| `filterMatchMakerV1Candidates` | candidates, `MatchMakerInput` | readonly `MatchMakerV1Candidate[]` |
| `assembleMatchMakerV1Evidence` | candidate, `MatchMakerInput` | readonly `MatchMakerEvidence[]` |
| `scoreMatchMakerV1Candidate` | candidate, evidence | `MatchMakerV1ScoredCandidate` |
| `rankMatchMakerV1Candidates` | scored candidates | readonly `MatchMakerV1ScoredCandidate[]` |
| `calculateMatchMakerV1Confidence` | scored candidate, evidence | `MatchMakerConfidence` |
| `buildMatchMakerV1Explanation` | scored candidate, evidence, confidence | `MatchMakerExplanation` |
| `toMatchMakerV1Recommendation` | scored candidate, evidence, confidence, explanation, options | `MatchMakerRecommendation` |
| `toMatchMakerV1EntityKey` | `LiteraryEntityRef` | string |
| `isV1WorkRef` | `LiteraryEntityRef` | type guard |
| `toMatchMakerV1OutputId` | candidate key, evidence IDs | string |

## File Matrix

| File | Responsibility | Exports |
|---|---|---|
| `v1/constants.ts` | Engine constants | `MATCHMAKER_V1_ENGINE_VERSION`, limits, weights, confidence caps |
| `v1/types.ts` | Internal engine types | options, candidate, scored candidate, suppression reason types |
| `v1/identity.ts` | Ref keys and type guards | entity key, Work guard, authority guard |
| `v1/candidates.ts` | Candidate generation | `generateMatchMakerV1Candidates` |
| `v1/filtering.ts` | Candidate filters | `filterMatchMakerV1Candidates` |
| `v1/evidence.ts` | Evidence assembly | `assembleMatchMakerV1Evidence` |
| `v1/scoring.ts` | Score and ranking | `scoreMatchMakerV1Candidate`, `rankMatchMakerV1Candidates` |
| `v1/confidence.ts` | Confidence | `calculateMatchMakerV1Confidence`, `toMatchMakerV1ConfidenceBand` |
| `v1/explanations.ts` | Explanations | `buildMatchMakerV1Explanation` |
| `v1/output.ts` | Recommendation assembly | `toMatchMakerV1Recommendation`, `toMatchMakerV1OutputId` |
| `v1/engine.ts` | Orchestration | `runMatchMakerV1` |
| `index.ts` | Domain barrel | snapshot adapter exports, `runMatchMakerV1`, `MatchMakerV1Options` |

## Pipeline Matrix

| Stage | Input | Output |
|---|---|---|
| Options normalization | input, options | deterministic options |
| Candidate generation | `MatchMakerInput` | candidates |
| Candidate filtering | candidates | eligible candidates |
| Evidence assembly | eligible candidate | evidence |
| Scoring | candidate and evidence | scored candidate |
| Confidence | scored candidate and evidence | confidence |
| Explanation | scored candidate, evidence, confidence | explanation |
| Output assembly | scored candidate, evidence, confidence, explanation | recommendation |
| Ranking | recommendations and scored data | deterministic ordered recommendations |
| Bounding | ordered recommendations | final output |

## Implementation Order

1. Add `v1/constants.ts` and `v1/types.ts`.
2. Add `v1/identity.ts` with entity key, Work ref guard, and authority-state guard.
3. Add `matchmakerV1Candidates.test.ts`.
4. Add `v1/candidates.ts` and `v1/filtering.ts`.
5. Add `matchmakerV1Scoring.test.ts`.
6. Add `v1/evidence.ts` and `v1/scoring.ts`.
7. Add `matchmakerV1Confidence.test.ts`.
8. Add `v1/confidence.ts`.
9. Add `matchmakerV1Explanations.test.ts`.
10. Add `v1/explanations.ts`.
11. Add `matchmakerV1Engine.test.ts`.
12. Add `v1/output.ts` and `v1/engine.ts`.
13. Add privacy and determinism tests.
14. Update `lib/domain/matchmaker/index.ts` barrel exports.
15. Run focused matchmaker tests.
16. Run runtime typecheck.
17. Run full relevant domain tests if runtime typecheck is clean.

## Architecture Compliance Check

Implementation must satisfy these boundaries:

- Pure functions only.
- No persistence.
- No Firestore access.
- No API calls.
- No retrieval.
- No graph mutation.
- No affinity mutation.
- No identity mutation.
- No side effects.
- Deterministic execution only.
- No embeddings.
- No vectors.
- No LLM reasoning.
- No Search access.
- No Reader access.
- No UI dependencies.
- No changes to contracts.
- No changes to `matchmakerSnapshotAdapter.ts`.

## Final Answers

BT-MATCHMAKER-V1-IMPLEMENTATION-001 should create the `lib/domain/matchmaker/v1/` files listed in the Directory Structure and File Matrix, plus focused tests under `test/domain/matchmaker/`.

The exact public exports should be `runMatchMakerV1` and `MatchMakerV1Options`, re-exported from `lib/domain/matchmaker/index.ts`. Internal helpers may be exported from `v1/` files for direct unit tests only.

The exact tests should cover engine output shape, candidate generation, filtering, scoring, confidence, explanations, privacy, determinism, sparse snapshots, cold start, negative signals, withdrawn signals, contradictions, graph context, availability, and bounded output.

The implementation order is constants/types, identity helpers, candidate tests and implementation, scoring tests and implementation, confidence tests and implementation, explanation tests and implementation, engine/output tests and implementation, privacy/determinism tests, barrel export, then verification.

The engine is ready to build after this plan.
