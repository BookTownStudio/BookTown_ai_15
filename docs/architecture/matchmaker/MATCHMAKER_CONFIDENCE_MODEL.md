---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-CONFIDENCE-MODEL
title: "MatchMaker Confidence Model"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MatchMaker Confidence Model

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-CONFIDENCE-MODEL-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_UNIVERSE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_GENERATION.md`
- `docs/architecture/matchmaker/MATCHMAKER_SCORING_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_EXPLANATION_MODEL.md`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Architecture Authority Decision

MatchMaker confidence is a deterministic statement of trust in the evidence supporting a MatchMaker output. It is mandatory on every output and every evidence item through `MatchMakerConfidence`.

Confidence is not score, affinity, preference, predicted enjoyment, canonical truth, literary quality, popularity, graph importance, or predicted rating. Confidence answers how well the output is supported by bounded, privacy-safe, provenance-aware evidence.

## Confidence Mission

The mission of confidence is to prevent MatchMaker from overstating certainty.

Confidence must:

- disclose evidence strength
- disclose evidence limits
- preserve uncertainty from sparse snapshots
- preserve uncertainty from contradictions
- preserve uncertainty from negative or withdrawn signals
- remain deterministic
- remain explainable without exposing hidden scoring internals

## Confidence Definition

Confidence is the evidence trust level assigned to:

- a `MatchMakerEvidence` item
- a `MatchMakerRecommendation`
- future `MatchMakerDiscovery`
- future `MatchMakerPathway`
- future `MatchMakerInsight`
- future `MatchMakerChallenge`
- future `MatchMakerReflection`

Confidence consists of:

- `band`: `low`, `medium`, or `high`
- `score`: bounded numeric value from 0.0 to 1.0
- `rationale`: privacy-safe explanation of why the confidence was assigned
- optional `evidenceCoverage`: summary of evidence breadth

## What Confidence Is Not

Confidence must never be interpreted as:

- predicted enjoyment
- predicted rating
- canonical truth
- literary quality
- popularity
- graph importance
- recommendation score
- affinity strength
- probability that the user will click
- probability that the user will finish a Work
- proof that an entity relationship is true
- proof that a user has a stable preference

Score ranks candidates. Affinity describes a user-to-entity relationship produced by the Affinity Layer. Confidence describes trust in MatchMaker's evidence for the output.

## Confidence Sources

Allowed confidence sources:

- affinity source confidence
- interaction lifecycle and provenance
- graph relationship confidence and source class
- entity ref authority state
- entity summary availability
- evidence diversity
- availability certainty
- snapshot completeness
- privacy and authority constraints
- negative evidence
- contradiction evidence
- cold-start state
- sparse snapshot state

Forbidden confidence sources:

- hidden model state
- embeddings
- vectors
- LLM reasoning
- raw private events
- raw search text
- raw reading history
- raw Firestore documents
- popularity shortcuts
- recommendation feedback loops

## Confidence Generation

V1 confidence is generated separately from score.

Canonical formula:

`confidenceScore = clamp(0.45 * affinityConfidence + 0.20 * graphConfidence + 0.15 * availabilityConfidence + 0.10 * evidenceDiversity + 0.10 * snapshotCompleteness - penalties, 0, 1)`

Inputs:

- `affinityConfidence`: confidence from direct affinity evidence.
- `graphConfidence`: confidence from provided relationship evidence.
- `availabilityConfidence`: certainty of availability constraints.
- `evidenceDiversity`: count and breadth of source classes.
- `snapshotCompleteness`: how much of the expected bounded snapshot is present.
- `penalties`: contradiction, negative, withdrawn, sparse, privacy, or authority penalties.

Confidence must be generated before final ranking and may influence rank only through the bounded scoring adjustment defined by the scoring model.

## Confidence Bands

Bands are user-facing trust categories.

| Band | Range | Meaning | User Communication |
|---|---|---|---|
| `low` | `0.00 <= score < 0.45` | Evidence is weak, sparse, indirect, mixed, or constrained. | "Low confidence: evidence is limited or mixed." |
| `medium` | `0.45 <= score < 0.75` | Evidence is usable but has limits, missing sources, or moderate uncertainty. | "Medium confidence: evidence supports this, with some limits." |
| `high` | `0.75 <= score <= 1.00` | Evidence is strong, diverse, provenance-aware, and not materially contradicted. | "High confidence: evidence is strong and consistent." |

High confidence requires strong evidence and low contradiction. It must not be assigned to graph-only, cold-start, sparse, negative-conflicted, or availability-only outputs.

## Confidence Caps

Confidence caps prevent overstated certainty.

Caps apply after the formula. When multiple caps apply, use the most restrictive cap.

| Condition | Cap | Reason |
|---|---:|---|
| No direct positive affinity | `medium` band | Evidence does not show direct user-entity support. |
| Graph-only evidence | `0.60` | Graph context is not preference. |
| Availability-only evidence | no confidence output | Availability cannot support an output alone. |
| Structured discovery-context-only Work ref | `low` band | Context is weak without affinity or interaction support. |
| Cold start direct Work ref | `medium` band | No user affinity or interaction evidence. |
| Single weak evidence source | `low` band | Evidence breadth is insufficient. |
| Unknown availability with weak evidence | `0.50` | Delivery uncertainty lowers trust. |
| Moderate contradiction | `medium` band | Evidence is mixed. |
| Direct positive/negative conflict | `0.55` | Trust must remain bounded. |
| Withdrawn or deleted conflict | `0.45` | Lifecycle conflict materially reduces trust. |
| Privacy withholding is material | `medium` band | Explanation cannot fully disclose support. |
| Candidate uses non-canonical but resolved ref | `medium` band | Authority is usable but not strongest. |

## Contradictions

Contradictions lower confidence and must be explained as mixed evidence.

Contradiction penalties:

- minor contradiction: `0.10`
- direct positive and negative conflict: `0.20`
- withdrawn or deleted conflict: `0.35`

Rules:

1. Preserve both evidence directions when privacy-safe.
2. Apply penalty before caps.
3. Apply the relevant confidence cap after penalty.
4. Add contradiction constraint.
5. Explain contradiction without raw private details.

## Negative Signals

Negative signals reduce confidence because they weaken trust in a positive recommendation claim.

Negative confidence effects:

- weak negative evidence: `-0.05`
- moderate negative evidence: `-0.10`
- strong negative affinity: `-0.20`
- withdrawn or deleted conflict: `-0.35`

Rules:

1. Negative-only candidates should be filtered before confidence generation.
2. Negative evidence must remain visible as evidence or constraint when privacy-safe.
3. Confidence rationale must mention reduced confidence at source-class level.
4. Negative signals must not mutate Affinity Layer truth.

## Sparse Evidence

Sparse evidence means the snapshot provides too few source classes or too little direct support.

Sparse evidence effects:

| Snapshot State | Confidence Effect | Cap |
|---|---|---|
| One weak source only | Lower confidence substantially. | `low` |
| Entity summary only | Treat as weak support. | `low` |
| Direct Work ref only | Treat as weak support. | `low` |
| No direct positive affinity | Confidence cannot be high. | `medium` |
| Graph-only evidence | Explain as context only. | `0.60` |
| Missing summary but other evidence exists | Lower confidence moderately. | `medium` |
| Evidence exists but cannot be disclosed | Lower confidence and mark withholding. | `medium` |

Sparse evidence must never trigger hidden retrieval.

## Cold Start

Cold start means the snapshot has no usable user affinity and no usable user interaction summaries.

Cold-start effects:

| State | Confidence Effect | Cap |
|---|---|---|
| No eligible Work candidate | No confidence output. | none |
| Direct canonical Work ref only | Low trust. | `low` |
| Work summary plus structured discovery context | Usable but limited. | `medium` |
| Work graph context without affinity | Contextual only. | `0.60` |
| Availability-only signal | Not sufficient. | none |
| Cold start plus contradiction | Strongly reduced. | `low` |

Cold start is an input limitation, not permission to use popularity, global ratings, provider feeds, or retrieval.

## Confidence Communication

Confidence must be communicated as a band and rationale.

Required communication:

- band
- privacy-safe rationale
- material caps, when relevant
- evidence coverage, when available
- uncertainty caused by sparse, cold-start, graph-only, negative, or contradictory evidence

Do not communicate:

- hidden scoring formulas
- raw weights
- raw private events
- predicted enjoyment
- canonical truth claims
- precise psychological claims

Allowed wording:

- "High confidence: evidence is strong and consistent."
- "Medium confidence: evidence supports this, with some limits."
- "Low confidence: evidence is limited or mixed."
- "Confidence is lower because the evidence is graph context rather than direct affinity."

## Trust Rules

Trust rules:

1. Confidence must be deterministic.
2. Confidence must be evidence-based.
3. Confidence must be generated separately from score.
4. Confidence must not be predicted enjoyment.
5. Confidence must not be canonical truth.
6. Confidence must not hide contradictions.
7. Confidence must not hide negative evidence.
8. Confidence must not exceed caps.
9. Confidence rationale must be privacy-safe.
10. Confidence must not expose hidden formulas or weights in user-facing explanations.
11. Confidence must be present on every output and evidence item.
12. Confidence changes require versioned constants and tests.

## Governance

Confidence governance rules:

1. Any change to formula, band threshold, cap, penalty, or communication semantics requires a MatchMaker engine version bump.
2. Confidence must remain compatible with `MatchMakerConfidence`.
3. Confidence is output metadata, not persistence truth.
4. Confidence must not feed back into the Affinity Layer, Graph, Search, Reader, or Entity Platform without a separate audited contract.
5. Public aggregate confidence requires separate anonymization and privacy architecture.

## Confidence Source Matrix

| Source | Allowed | V1 | Impact | Notes |
|---|---|---|---|---|
| Direct affinity confidence | Yes | Yes | Strong positive | Primary confidence source. |
| Interaction provenance | Yes | Yes | Positive or limiting | Active lifecycle improves trust; withdrawn/deleted lowers trust. |
| Graph relationship confidence | Yes | Limited | Moderate/weak positive | Context only; cannot produce high confidence alone. |
| Entity authority state | Yes | Yes | Positive or limiting | Canonical refs support higher confidence. |
| Entity summary presence | Yes | Yes | Positive | Improves evidence coverage. |
| Availability certainty | Yes | Yes | Small positive or limiting | Delivery certainty, not literary support. |
| Evidence diversity | Yes | Yes | Positive | Multiple source classes improve trust. |
| Snapshot completeness | Yes | Yes | Positive or limiting | Sparse snapshots cap confidence. |
| Negative evidence | Yes | Yes | Negative | Reduces confidence and may cap band. |
| Contradiction evidence | Yes | Yes | Negative | Preserved as uncertainty. |
| Privacy withholding | Yes | Yes | Limiting | May cap confidence when material. |
| Popularity | No | No | None | Not evidence trust. |
| Predicted enjoyment | No | No | None | Forbidden interpretation. |
| Recommendation score | No | No | None | Score ranks; confidence measures trust. |

## Confidence Band Matrix

| Band | Range | Meaning | User Communication |
|---|---|---|---|
| `low` | `0.00 <= score < 0.45` | Weak, sparse, indirect, mixed, or constrained evidence. | "Low confidence: evidence is limited or mixed." |
| `medium` | `0.45 <= score < 0.75` | Supported but bounded by missing evidence, context-only evidence, or uncertainty. | "Medium confidence: evidence supports this, with some limits." |
| `high` | `0.75 <= score <= 1.00` | Strong, diverse, privacy-safe evidence with no material contradiction. | "High confidence: evidence is strong and consistent." |

## Confidence Cap Matrix

| Condition | Cap | Reason |
|---|---|---|
| No direct positive affinity | `medium` | Cannot claim strong trust without direct support. |
| Graph-only evidence | `0.60` | Graph context is not preference. |
| Availability-only evidence | none | Cannot support output alone. |
| Cold start direct ref | `low` | No user evidence. |
| Cold start with structured context | `medium` | Usable but limited. |
| Single weak source | `low` | Evidence breadth insufficient. |
| Direct positive/negative conflict | `0.55` | Mixed evidence bounds trust. |
| Withdrawn/deleted conflict | `0.45` | Lifecycle conflict materially weakens trust. |
| Material privacy withholding | `medium` | Explanation cannot fully disclose support. |

## Contradiction Impact Matrix

| Condition | Impact | Explanation |
|---|---|---|
| Minor contradiction | `-0.10` penalty | Evidence has small conflict. |
| Direct positive and negative conflict | `-0.20` penalty and `0.55` cap | Evidence is materially mixed. |
| Withdrawn/deleted conflict | `-0.35` penalty and `0.45` cap | Lifecycle state undermines trust. |
| Contradiction with weak positive evidence | likely low confidence | Positive support is not strong enough. |
| Contradiction with strong positive evidence | medium cap unless safely explained | Preserve support but disclose uncertainty. |

## Sparse Snapshot Matrix

| Snapshot State | Confidence Effect | Cap |
|---|---|---|
| Empty snapshot | No output confidence. | none |
| One weak source only | Strong reduction. | `low` |
| Entity ref only | Weak support. | `low` |
| Entity summary only | Weak support. | `low` |
| Graph-only | Context-only confidence. | `0.60` |
| No direct positive affinity | Cannot be high. | `medium` |
| Missing summary | Moderate reduction. | `medium` |

## Cold Start Matrix

| State | Confidence Effect | Cap |
|---|---|---|
| No candidate | No confidence output. | none |
| Direct Work ref only | Low trust. | `low` |
| Work summary only | Low trust. | `low` |
| Work summary plus structured discovery context | Usable but limited. | `medium` |
| Work graph context only | Contextual trust only. | `0.60` |
| Availability-only | Not sufficient. | none |
| Cold start plus contradiction | Strong reduction. | `low` |

## Confidence Lifecycle

| Stage | Responsibility |
|---|---|
| `evidence_collected` | Gather source-specific evidence from candidate generation and scoring. |
| `source_confidence_read` | Read confidence already present on affinity, graph, and evidence inputs. |
| `coverage_measured` | Measure evidence diversity and snapshot completeness. |
| `penalties_applied` | Apply negative, contradiction, sparse, cold-start, privacy, and authority penalties. |
| `caps_applied` | Apply the strictest relevant cap. |
| `band_assigned` | Convert bounded score to low, medium, or high. |
| `rationale_generated` | Produce privacy-safe rationale. |
| `attached_to_output` | Attach `MatchMakerConfidence` to evidence and output. |
| `explained` | Communicate band, rationale, and material caps through explanation. |

## Future Expansion

Future confidence architecture may support:

- output-type-specific confidence formulas
- discovery confidence
- pathway confidence
- insight, challenge, and reflection confidence
- admin-only debug confidence inspection under separate contract
- learned confidence calibration after deterministic V1 behavior is proven

Future expansion must not weaken privacy, convert confidence into predicted enjoyment, or turn confidence into canonical truth.

## Final Answers

The canonical MatchMaker confidence architecture is deterministic evidence-trust calculation over bounded, privacy-safe evidence, represented by `MatchMakerConfidence`.

Confidence is generated from affinity confidence, graph confidence, availability certainty, evidence diversity, snapshot completeness, and penalties for negative, contradictory, sparse, cold-start, privacy, and authority limits.

Confidence is communicated as `low`, `medium`, or `high` with privacy-safe rationale and material caps when relevant.

Confidence is capped by missing direct affinity, graph-only evidence, availability-only evidence, sparse evidence, cold start, contradictions, withdrawn/deleted conflicts, privacy withholding, and weaker authority states.

Contradictions lower confidence, apply penalties and caps, and must be explained as mixed evidence without raw private details.

Sparse snapshots reduce confidence, cap confidence, reduce output count, or produce no output. They do not authorize retrieval.

Cold start caps confidence at low or medium and never permits popularity, global ratings, provider feeds, or hidden retrieval.

Confidence architecture is fully specified after this document.
