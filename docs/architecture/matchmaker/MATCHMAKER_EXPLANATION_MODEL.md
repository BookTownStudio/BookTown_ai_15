# MatchMaker Explanation Model

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-EXPLANATION-MODEL-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_UNIVERSE.md`
- `docs/architecture/matchmaker/MATCHMAKER_CANDIDATE_GENERATION.md`
- `docs/architecture/matchmaker/MATCHMAKER_SCORING_MODEL.md`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Architecture Authority Decision

MatchMaker explanations are mandatory, deterministic, privacy-safe summaries of why a derived intelligence output exists. They connect output reason classes, evidence IDs, confidence, constraints, privacy boundary, and authority boundary without exposing raw private data or hidden subsystem internals.

Explanations must be generated from bounded `MatchMakerEvidence` and `MatchMakerConstraint` records. They must not be generated from raw events, raw search text, raw reading history, raw Firestore documents, embeddings, vectors, LLM reasoning traces, or undisclosed scoring features.

## Explanation Mission

The mission of an explanation is to make MatchMaker output inspectable and trustworthy.

An explanation must answer:

- what the output is about
- why this output was produced
- what evidence supports it
- how confident MatchMaker is
- what constraints or uncertainty apply
- what privacy and authority boundaries govern the output

An explanation is not a proof of truth. It is a derived account of bounded evidence.

## Evidence Sources

Allowed explanation evidence sources are the contracted `MatchMakerEvidenceSource` values:

- `affinity`
- `interaction`
- `graph`
- `entity`
- `profile_context`
- `availability`
- `discovery_context`

Each explanation must reference evidence by `evidenceIds`. Human-readable explanation text must be assembled from sanitized evidence summaries, not from raw source records.

## Evidence Disclosure Rules

Disclosure levels:

| Level | Meaning |
|---|---|
| `summary` | Privacy-safe human-readable evidence summary. |
| `source_class` | Evidence source type such as affinity, graph, or availability. |
| `entity_ref` | Canonical entity ref or display-safe entity summary. |
| `constraint` | Privacy-safe reason a limitation applies. |
| `withheld` | Evidence exists but cannot be disclosed beyond a boundary statement. |

Disclosure rules:

1. Explain using summaries, not raw data.
2. Preserve source boundaries. Do not merge affinity, interaction, graph, and availability into one opaque claim.
3. Use canonical entity refs or `EntitySummary` display only when already present and safe.
4. Disclose confidence band and rationale, not hidden numeric internals unless a debug contract separately permits it.
5. Disclose contradictions and negative evidence as bounded uncertainty, not private details.
6. Never widen privacy visibility.
7. Never imply canonical truth from derived intelligence.

## Recommendation Explanations

V1 recommendation explanations are required for every `MatchMakerRecommendation`.

Required elements:

- target Work reference
- primary reason class
- reason classes
- evidence IDs
- confidence band and rationale
- source boundaries
- privacy boundary
- authority boundary
- constraint IDs

Recommendation explanations should use deterministic templates:

- reinforcement: "Recommended because privacy-safe evidence shows strong direct affinity."
- affinity: "Recommended because affinity evidence supports this Work."
- graph context: "Recommended because this Work is connected to evidence already in the snapshot."
- availability: "Recommended because it fits the evidence and availability constraints."
- exploration or serendipity: "Recommended as explainable adjacent territory with bounded confidence."

V1 must not mention raw search terms, raw reading behavior, private shelf names, private review text, private quotes, hidden weights, or internal score formulas.

## Discovery Explanations

Discovery explanations must explain adjacency and novelty.

Required elements:

- target entity
- adjacency summary
- reason class
- evidence IDs
- confidence band
- privacy and authority boundaries
- constraints

Discovery explanations should answer why the entity is worth attention now without claiming it is a preference. V1 must not independently generate discovery outputs, but future discovery explanations must follow these rules.

## Pathway Explanations

Pathway explanations must explain route structure.

Required elements:

- start context
- ordered pathway steps
- evidence IDs per step
- relationship or identity context per step
- confidence band
- constraints
- privacy and authority boundaries

Pathway explanations must not imply canonical graph creation. They explain an evidence route through already-governed refs and relationships.

## Insight Explanations

Insight explanations describe derived observations about literary identity, affinity, growth, or contrast.

Required elements:

- insight class
- statement
- subject entity refs
- evidence IDs
- evidence limits
- confidence band
- privacy boundary

Insights must be phrased as observations from bounded evidence. They must not update profile truth, affinity truth, or identity authority.

## Challenge Explanations

Challenge explanations must disclose productive contrast, difficulty, breadth, or growth rationale.

Required elements:

- target entity
- challenge class
- rationale
- contrast or difficulty evidence
- confidence band
- negative or contradictory evidence when relevant
- safety and privacy constraints

Challenge explanations must not shame users, reveal private history, or overstate certainty from weak evidence.

## Reflection Explanations

Reflection explanations help users understand literary identity patterns or choices.

Required elements:

- reflection class
- prompt
- subject entity refs
- evidence IDs
- confidence band
- privacy boundary
- constraints

Reflection explanations should encourage understanding, not assert hidden psychological truth. They must cite evidence IDs and preserve privacy boundaries.

## Confidence Communication

Confidence communicates trust in the evidence, not predicted enjoyment or canonical truth.

Required communication:

- show or carry confidence band: `low`, `medium`, or `high`
- include rationale
- include evidence coverage when available
- disclose meaningful confidence caps caused by sparse, graph-only, cold-start, negative, or contradictory evidence

Do not expose hidden scoring internals, raw weights, or full formulas in user-facing explanations unless a future debug/admin contract explicitly authorizes it. Architecture and tests may verify formulas; user-facing output should communicate confidence plainly.

## Contradictions

Contradictions must be explained as uncertainty or mixed evidence.

Rules:

1. Preserve both sides as evidence when privacy-safe.
2. Add contradiction constraints.
3. Lower confidence and disclose that evidence is mixed.
4. Do not expose private events that caused the contradiction.
5. Do not average contradiction into a neutral claim without explanation.

Allowed wording pattern:

"The evidence is mixed, so confidence is lower."

Forbidden wording pattern:

"You read this exact private item and then privately disliked it."

## Negative Evidence

Negative evidence may be disclosed only as privacy-safe constraint or uncertainty.

Rules:

1. Negative-only candidates should be filtered before output.
2. Negative evidence on otherwise supported outputs must lower confidence.
3. Explain negative evidence at source-class level unless disclosure is explicitly safe.
4. Never disclose private review content, private shelf names, private bookmark changes, private quote text, or raw dismissal events.
5. Do not make judgmental claims about the user.

Allowed wording:

"Some privacy-safe evidence reduces confidence."

Allowed when source class is safe:

"A negative affinity signal lowered confidence."

## Privacy Enforcement

Explanation privacy is enforced at four points:

1. Evidence assembly emits only sanitized `MatchMakerEvidence`.
2. Explanation assembly uses only evidence IDs and summaries.
3. Output metadata preserves or narrows privacy tier.
4. User-facing rendering must respect the output privacy tier and disclosure level.

Forbidden explanation evidence:

- raw search text
- raw search history
- raw reading history
- raw Firestore data
- private reviews
- private shelves
- private bookmarks
- private quotes
- DM activity
- internal scoring internals
- hidden weights
- embeddings
- vectors
- LLM reasoning traces

## Trust Rules

Trust rules:

1. Every output must explain itself.
2. Every explanation must cite evidence IDs.
3. Every explanation must preserve source boundaries.
4. Every explanation must include confidence.
5. Every explanation must include privacy and authority boundaries.
6. Explanations must be deterministic for identical output evidence.
7. Explanations must not claim canonical truth.
8. Explanations must not reveal raw private data.
9. Explanations must disclose meaningful uncertainty.
10. Explanations must not hide material negative or contradictory evidence.
11. Explanations must not expose hidden weights or reasoning traces.
12. Explanations must remain understandable without revealing internals.

## Explanation Evidence Matrix

| Evidence Source | Allowed | V1 | Disclosure Level | Notes |
|---|---|---|---|---|
| `affinity` | Yes | Yes | summary/source_class | Strong V1 explanation source; no raw affinity internals. |
| `interaction` | Yes | Yes | summary/source_class | Summarized only; no raw history. |
| `graph` | Yes | Yes | summary/entity_ref | Context, not preference. |
| `entity` | Yes | Yes | entity_ref/summary | Entity refs and summaries may be displayed when safe. |
| `profile_context` | Conditional | Limited | summary/withheld | Only privacy-safe context; no private profile internals. |
| `availability` | Yes | Yes | constraint/summary | Delivery constraint, not affinity. |
| `discovery_context` | Conditional | Limited | summary/withheld | Structured, privacy-safe context only. |
| negative evidence | Conditional | Yes | constraint/source_class | Disclose as uncertainty or reduced confidence. |
| contradiction evidence | Conditional | Yes | constraint/summary | Preserve mixed evidence without raw details. |
| withdrawn evidence | Conditional | Yes | constraint/withheld | No raw event disclosure. |

## Explanation Type Matrix

| Output Type | Required | Optional | V1 | Notes |
|---|---|---|---|---|
| Recommendation | target, reason class, evidence IDs, confidence, constraints, boundaries | target summary, availability note | Yes | Only Work recommendations in V1. |
| Discovery | target, adjacency summary, reason, evidence IDs, confidence, boundaries | novelty note | No output in V1 | Future output; explanation rules are defined now. |
| Pathway | start context, ordered steps, evidence IDs, confidence, constraints | destination entity | No output in V1 | Must preserve graph authority boundary. |
| Insight | insight class, statement, subject refs, evidence IDs, confidence | evidence limits | No output in V1 | Must not update identity truth. |
| Challenge | target, challenge class, rationale, evidence IDs, confidence | difficulty/breadth note | No output in V1 | Must be respectful and privacy-safe. |
| Reflection | reflection class, prompt, subject refs, evidence IDs, confidence | pattern context | No output in V1 | Must not claim hidden psychological truth. |

## Forbidden Explanation Matrix

| Evidence | Reason | Severity |
|---|---|---|
| Raw search text | Private intent and not explanation-safe. | Critical |
| Raw search history | Private event stream. | Critical |
| Raw reading history | Private behavior stream. | Critical |
| Raw Firestore data | Violates snapshot and subsystem boundaries. | Critical |
| Private reviews | Private expressive content. | Critical |
| Private shelves | Private organization and intent. | Critical |
| Private bookmarks | Private interaction history. | Critical |
| Private quotes | Private saved or created text. | Critical |
| DM activity | Private communication. | Critical |
| Internal scoring internals | Hidden implementation detail, not user evidence. | High |
| Hidden weights | Can mislead and expose implementation internals. | High |
| Embeddings | Non-explainable vector internals. | High |
| Vectors | Non-explainable vector internals. | High |
| LLM reasoning traces | Non-authoritative and unsafe chain-of-thought style data. | Critical |
| Provider aliases | Not canonical identity. | High |
| Display strings as identity | Not authority. | High |

## Explanation Lifecycle

| Stage | Responsibility |
|---|---|
| `evidence_selected` | Select evidence IDs used by the output. |
| `evidence_sanitized` | Confirm each evidence summary is privacy-safe. |
| `reason_selected` | Select primary and secondary reason classes. |
| `constraints_attached` | Attach privacy, authority, scope, confidence, negative, or contradiction constraints. |
| `confidence_attached` | Attach confidence band and rationale. |
| `summary_generated` | Assemble deterministic human-readable explanation summary. |
| `boundaries_declared` | Include privacy and authority boundaries. |
| `output_validated` | Verify no forbidden evidence or hidden logic appears. |

## Future Expansion

Future explanation architecture may add:

- user-facing inspection of selected evidence summaries
- admin/debug explanation views under a separate contract
- discovery-specific explanation templates
- pathway visualization explanations
- challenge and reflection tone governance
- public aggregate explanation rules after anonymization architecture

Future expansion must not weaken privacy, expose raw evidence, or turn derived explanations into authority.

## Final Answers

The canonical MatchMaker explanation architecture is deterministic, evidence-ID-driven, privacy-safe explanation assembly over `MatchMakerEvidence`, `MatchMakerConfidence`, and `MatchMakerConstraint`.

Evidence that may be disclosed includes sanitized summaries from affinity, interaction, graph, entity, profile context, availability, and discovery context sources according to disclosure level.

Evidence that may never be disclosed includes raw search text, raw search history, raw reading history, raw Firestore data, private reviews, private shelves, private bookmarks, private quotes, DM activity, internal scoring internals, hidden weights, embeddings, vectors, and LLM reasoning traces.

Explanations are generated by deterministic templates that cite evidence IDs, reason classes, confidence, constraints, privacy boundary, and authority boundary.

Contradictions are explained as mixed evidence and lower confidence without exposing raw private details.

Confidence is communicated as a band and rationale. It reflects trust in evidence, not predicted enjoyment or canonical truth.

Privacy is protected by sanitized evidence, disclosure levels, evidence IDs, output privacy tiers, and explicit forbidden-evidence rules.

Explanation architecture is fully specified after this document.
