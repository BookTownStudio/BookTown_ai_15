---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-CANDIDATE-GENERATION
title: "MatchMaker Candidate Generation"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MatchMaker Candidate Generation

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-CANDIDATE-GENERATION-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_UNIVERSE.md`
- `docs/architecture/entity-platform/ENTITY_GRAPH.md`
- `docs/architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md`
- `docs/architecture/entity-platform/MATCHMAKER_ENTITY_LAYER.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Architecture Authority Decision

MatchMaker candidate generation is a deterministic, snapshot-only process that converts allowed `MatchMakerInput` evidence into a bounded candidate pool before scoring begins.

V1 candidate generation may produce recommendation candidates for Work entities only. It may use other canonical entities as evidence, explanation context, constraints, or future discovery/pathway inputs, but it may not recommend them in V1.

Candidate generation must not retrieve data, query Firestore, call Search, traverse Graph storage, inspect Reader history, read raw Identity Graph events, reuse prior recommendation outputs, or infer entities from display text.

## Candidate Generation Mission

The mission of candidate generation is to answer one question before scoring:

Which canonical Work refs from the bounded snapshot are eligible to be evaluated as MatchMaker V1 recommendations?

Candidate generation is not ranking. It does not decide final recommendation order, user preference, confidence, or explanation text. It only assembles a safe, deduplicated, evidence-linked candidate pool.

## Candidate Acquisition

Allowed V1 candidate-bearing inputs:

- `EntitySummary` when `summary.ref.entityType` is `work`.
- `LiteraryEntityRef` from `entityRefs` when `entityType` is `work`.
- `EntityAffinity` when `entityRef.entityType` is `work` and the signal is not negative-only.
- `UserEntityInteraction` when `entityRef.entityType` is `work` and lifecycle state is active.
- `EntityRelationship` when a provided graph relationship contains a Work endpoint connected to a known Work seed.
- `searchOrDiscoveryContext` only when it contains explicitly structured, privacy-safe, canonical Work refs accepted by implementation guards.

Availability constraints do not create candidates. They constrain, filter, or annotate candidates produced by other allowed sources.

## Candidate Expansion

V1 expansion is bounded to data already inside `MatchMakerInput`.

Allowed V1 expansion:

1. Direct Work candidates from entity refs and summaries.
2. Direct Work candidates from Work affinity and interaction summaries.
3. One-hop Work endpoints from already-provided graph relationships when connected to a known Work seed.
4. Structured discovery-context Work refs when already canonical and privacy-safe.

Forbidden V1 expansion:

- graph traversal beyond relationships already present in the snapshot
- author bibliography expansion
- quote-to-work lookup
- theme or concept inference
- search-result expansion from raw query text
- provider alias resolution
- recommendation-feedback loops

V1 maximum expansion depth is one provided relationship edge. Depth means relationship hops over already supplied graph evidence, not storage traversal.

## Candidate Pool Assembly

Candidate pool assembly follows this lifecycle:

1. Normalize input arrays into source-specific evidence buckets.
2. Reject unsupported entity types for V1 recommendation candidates.
3. Add direct Work candidates from summaries and refs.
4. Add positive or neutral Work candidates from affinity summaries.
5. Add active Work candidates from interaction summaries.
6. Add graph-derived Work candidates from one-hop provided relationship endpoints.
7. Add structured discovery-context Work candidates only when implementation guards prove they are canonical refs.
8. Attach source evidence handles to each candidate.
9. Deduplicate candidates by canonical identity key.
10. Apply hard generation filters.
11. Emit the bounded candidate pool for scoring.

Default V1 maximum candidate pool size should be 100 before scoring and 20 after final recommendation ranking. Implementations may use stricter limits but must not silently increase them without an engine version change.

## Candidate Deduplication

Candidate identity key:

`entityType + ":" + canonicalId-or-entityId`

Rules:

1. Use `canonicalId` when present.
2. Fall back to `entityId` only when `canonicalId` is absent.
3. Never deduplicate by title, author name, display hint, alias, provider ID, or image URL.
4. Preserve all evidence handles from duplicate sources.
5. Prefer the most authoritative ref for output: canonical, then resolved, then enriched, then candidate.
6. Merged refs must resolve to `mergeTarget` before candidate use or be filtered.

## Candidate Filtering

Candidate filtering happens before scoring.

Hard filters remove candidates. Soft filters keep candidates but add constraints, reduce confidence, or lower scoring influence in later stages.

Hard V1 filters:

- non-Work entity type
- missing stable `entityId`
- `authorityState` of `unresolved`, `deprecated`, `merged`, or `archived`
- only negative evidence and no positive or graph evidence
- primary evidence is withdrawn, deleted, expired, or anonymized
- violates hard availability constraints
- requires privacy widening
- only source is raw or unsafe context
- only source is graph proximity without a known Work seed

Soft V1 filters:

- missing `EntitySummary`
- weak single-source evidence
- graph-only evidence
- unknown availability
- contradictory positive and negative evidence
- low relationship confidence
- sparse snapshot
- discovery-context-only evidence

## Negative Signal Handling

Negative evidence prevents unsafe candidate inflation.

Rules:

1. Negative-only Work candidates are not added to the candidate pool.
2. Candidates with positive evidence and negative evidence may remain, but they must carry a negative-signal marker into scoring and explanation.
3. Strong negative affinity suppresses weak graph-derived expansion.
4. Negative evidence must never be discarded during deduplication.
5. MatchMaker must not rewrite negative affinity truth; it only consumes it.

## Withdrawal Handling

Withdrawn, deleted, expired, and anonymized interaction summaries are not positive candidate sources.

Rules:

1. A withdrawn signal cannot create a candidate.
2. A deleted or anonymized signal cannot create a candidate.
3. If a candidate has other positive evidence, withdrawn evidence may be retained only as privacy-safe suppression or confidence context.
4. Withdrawn evidence must not expose raw event details.

## Availability Constraints

Availability constraints are not candidate sources.

They affect generation in three ways:

1. Hard availability constraints remove candidates before scoring.
2. Soft availability constraints remain attached for scoring and explanation.
3. Unknown availability never creates a candidate and never blocks a candidate by itself.

Availability must not override identity, affinity, or graph authority. A readily available Work with no eligible literary evidence is not a MatchMaker candidate.

## Cold Start Users

Cold start means the snapshot contains no usable user affinity and no usable user interaction summaries.

V1 cold-start behavior:

- Use only canonical Work refs or summaries already supplied in `MatchMakerInput`.
- Allow structured discovery-context Work refs only when canonical and privacy-safe.
- Do not infer candidates from raw search text, popularity, global ratings, provider lists, or Firestore data.
- Return an empty candidate pool when the snapshot contains no eligible Work candidates.
- Mark cold-start candidates as low or medium confidence during later scoring.

Cold start is a product input problem, not permission for MatchMaker to retrieve or invent candidates.

## Sparse Snapshots

Sparse snapshot means the input has one or more candidate sources but insufficient evidence diversity.

Sparse snapshot behavior:

1. Keep eligible Work candidates.
2. Do not expand beyond provided snapshot relationships.
3. Attach sparse-evidence constraints.
4. Cap confidence in later scoring.
5. Return fewer candidates when evidence is weak.
6. Return empty output when only forbidden or unsafe sources are present.

Sparse evidence should reduce certainty, not trigger hidden retrieval.

## Privacy Enforcement

Privacy enforcement occurs during candidate generation before evidence assembly.

Forbidden candidate identity material:

- raw search text
- raw search history
- raw reader history
- raw Firestore documents
- raw shelves, bookmarks, reviews, quotes, or private events
- notification data
- display labels without refs
- provider aliases without canonical refs

Candidate generation may retain only privacy-safe evidence handles needed for downstream `MatchMakerEvidence`. The pool must not carry raw private payloads forward.

## Deterministic Rules

Candidate generation must be deterministic.

Rules:

1. Identical `MatchMakerInput` and engine version must produce identical candidate pools.
2. No randomization.
3. No Date calls.
4. No external IO.
5. Stable iteration order by source priority and candidate identity key.
6. Stable dedupe rules.
7. Stable pool limits.
8. Stable filtering rules.
9. No silent fallback from canonical refs to display text.
10. No candidate creation from prior MatchMaker outputs.

## Candidate Source Matrix

| Source | Allowed | V1 | Weight | Notes |
|---|---|---|---:|---|
| `EntitySummary` | Yes | Yes | 1.00 | Direct candidate source only when `ref.entityType` is `work`. |
| `entityRefs` | Yes | Yes | 0.95 | Direct Work refs may create candidates without display metadata. |
| `EntityAffinity` | Yes | Yes | 0.90 | Positive Work affinity creates candidates; negative-only affinity blocks. |
| `UserEntityInteraction` | Yes | Yes | 0.70 | Active Work interactions create candidates; withdrawn/deleted/anonymized do not. |
| Graph Relationships | Yes | Limited | 0.35 | May add one-hop Work endpoints from provided relationships connected to Work seeds. |
| Entity Summaries | Yes | Yes | 1.00 | Same authority as `EntitySummary`; display fields are not identity. |
| Availability Constraints | Constraint only | Yes | 0.00 | Filters or annotates candidates; never creates candidates. |
| Discovery Context | Conditional | Limited | 0.20 | Only structured canonical Work refs; raw intent text is forbidden. |
| Profile Context | Context only | Yes | 0.00 | May constrain or explain later; does not create candidates. |
| Recommendation Outputs | No | No | 0.00 | Prevents recommendation loops and derived-output authority leakage. |

Weight means candidate acquisition strength before scoring. It is not final recommendation score.

## Candidate Expansion Matrix

| Expansion Type | Allowed | V1 | Maximum Depth | Notes |
|---|---|---|---:|---|
| Direct Work ref | Yes | Yes | 0 | Candidate already exists in snapshot. |
| Work summary ref | Yes | Yes | 0 | Preferred source when summary is present. |
| Work affinity ref | Yes | Yes | 0 | Positive/neutral affinity only. |
| Work interaction ref | Yes | Yes | 0 | Active lifecycle only. |
| Work -> Work graph edge | Yes | Limited | 1 | Only over provided relationship evidence; no graph retrieval. |
| Work -> Author -> Work | Future | No | 0 | Requires author bibliography and bounded traversal authority. |
| Quote -> Work | Future/context | No candidate expansion | 0 | V1 may use quote as context only when already linked. |
| Theme/Concept bridge | Future | No | 0 | Blocked by canonical theme/concept authority. |
| Search text to entity | No | No | 0 | Search authority must resolve entities before MatchMaker. |
| Provider alias to entity | No | No | 0 | Entity authority must resolve aliases before MatchMaker. |

## Candidate Filtering Matrix

| Filter | Hard | Soft | V1 | Notes |
|---|---|---|---|---|
| Non-Work entity | Yes | No | Yes | V1 recommendation candidates are Work-only. |
| Missing stable ID | Yes | No | Yes | Candidate identity must be deterministic. |
| Unresolved authority state | Yes | No | Yes | Unresolved refs are not MatchMaker candidates. |
| Deprecated/archived state | Yes | No | Yes | Not active discovery material. |
| Merged ref without resolution | Yes | No | Yes | Must resolve to surviving ref before use. |
| Negative-only evidence | Yes | No | Yes | Prevents harmful recommendation creation. |
| Withdrawn/deleted primary evidence | Yes | No | Yes | Cannot create positive candidate. |
| Hard availability violation | Yes | No | Yes | Constraint blocks output. |
| Privacy widening required | Yes | No | Yes | Candidate must be suppressed. |
| Missing summary | No | Yes | Yes | Candidate may remain but lower downstream confidence. |
| Graph-only source | No | Yes | Yes | Allowed only with Work seed; cap downstream confidence. |
| Sparse evidence | No | Yes | Yes | Add sparse-snapshot constraint. |
| Contradictory evidence | No | Yes | Yes | Preserve evidence; lower confidence later. |

## Forbidden Candidate Source Matrix

| Source | Reason | Severity |
|---|---|---|
| Raw search text | Private intent and not entity authority. | Critical |
| Raw search history | Private event stream and not candidate identity. | Critical |
| Raw reader history | Private activity stream; must be summarized first. | Critical |
| Raw Firestore documents | Violates snapshot-only and authority boundaries. | Critical |
| Recommendation outputs | Creates feedback loops and derived-output truth leakage. | Critical |
| Display strings | Not canonical identity. | High |
| Provider aliases | Resolution evidence only; Entity Platform must resolve first. | High |
| Graph proximity alone | Context is not preference and cannot create candidates without seed evidence. | High |
| Theme inference | Blocked by canonical theme authority and hallucination risk. | High |
| Concept inference | Blocked by canonical concept authority and hallucination risk. | High |
| Global popularity | Retrieval/ranking shortcut outside MatchMaker input. | High |
| UI state | Product state is not literary entity authority. | High |

## Candidate Pool Lifecycle

Candidate pool lifecycle states:

| State | Meaning |
|---|---|
| `observed` | A candidate-bearing ref was found in an allowed input source. |
| `normalized` | Candidate identity key was built from entity type and canonical ID or entity ID. |
| `deduplicated` | Duplicate refs were merged while preserving source evidence handles. |
| `expanded` | Candidate was admitted through bounded provided graph or structured discovery context. |
| `filtered` | Hard filters were applied. |
| `eligible_for_scoring` | Candidate may enter scoring with evidence and constraints attached. |
| `suppressed` | Candidate was removed by hard filter, privacy rule, lifecycle state, or negative-only evidence. |

Suppressed candidates must not be returned as recommendations. Implementations may expose suppression diagnostics only in tests or internal debug surfaces, never as user-facing recommendation output without a separate contract.

## Cold Start Strategy

Cold-start candidate generation should be conservative:

1. Accept canonical Work refs and summaries already supplied in the snapshot.
2. Accept structured discovery-context Work refs only under strict guards.
3. Do not use global popularity, top-rated books, public catalog scans, raw search text, or provider feeds.
4. Prefer empty candidate pools over fabricated recommendations.
5. Carry a cold-start constraint into downstream evidence/confidence when candidates exist.

## Sparse Snapshot Strategy

Sparse snapshots should produce bounded, lower-certainty candidate pools:

1. Use direct eligible candidates first.
2. Avoid graph expansion unless the relationship evidence is already provided and connected to a Work seed.
3. Do not broaden from Work to Author, Quote, Theme, Concept, Movement, Period, or Place in V1.
4. Preserve weak evidence markers for scoring and explanation.
5. Return empty when sparse evidence is only forbidden, raw, private, unresolved, or negative-only.

## Future Expansion

Future candidate generation may add:

- Author candidates after author graph/search authority matures.
- Quote candidates after quote attribution and graph maturity.
- Publication candidates after publication bridge authority matures.
- Movement and Period candidates after navigation and traversal contracts mature.
- Theme and Concept candidates after canonical authority and anti-hallucination controls.
- Place candidates after literary place authority matures.

Any future expansion requires:

- Entity Platform authority support.
- Candidate Universe update if entity eligibility changes.
- Versioned engine constants.
- Focused candidate-generation tests.
- Privacy and deletion semantics review.
- No silent broadening of V1 candidate behavior.

## Final Answers

The canonical MatchMaker Candidate Generation architecture is deterministic, snapshot-only, Work-only for V1 recommendation candidates, and bounded by `MatchMakerInput`.

Sources that may create V1 candidates are Work `EntitySummary`, Work `entityRefs`, positive Work `EntityAffinity`, active Work `UserEntityInteraction`, one-hop provided Work graph endpoints connected to Work seeds, and structured canonical Work refs in discovery context.

Sources that may never create candidates are raw search text, raw search history, raw reader history, raw Firestore documents, recommendation outputs, display strings, provider aliases, graph proximity alone, theme inference, and concept inference.

Candidates expand only through direct snapshot refs and one provided graph edge in V1. There is no retrieval, traversal, alias resolution, bibliography expansion, or inference.

Candidates are filtered by entity type, stable identity, authority state, lifecycle state, negative-only evidence, hard availability constraints, privacy boundaries, and forbidden source use.

Cold-start users should receive candidates only when canonical Work refs are already supplied in the snapshot. Otherwise the candidate pool is empty.

Sparse snapshots should produce fewer candidates, lower confidence downstream, or empty output. Sparse evidence must not trigger hidden retrieval.

Candidate generation is fully specified after this document.

MatchMaker implementation can begin after this document if it remains inside the documented pure-engine boundary and does not add APIs, persistence, retrieval, contract changes, or subsystem writes.
