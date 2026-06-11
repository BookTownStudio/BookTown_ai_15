# MatchMaker Consumption Model

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-CONSUMPTION-MODEL-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_REGISTER.md`
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER_SCORING_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_EXPLANATION_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_CONFIDENCE_MODEL.md`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Purpose

This document is the permanent architectural authority for how MatchMaker outputs may be consumed throughout BookTown.

It governs downstream consumption only. It does not redefine MatchMaker engine behavior, scoring, confidence, evidence, output contracts, persistence, retrieval, UI implementation, or subsystem authority.

All future MatchMaker integrations must read this document before consuming MatchMaker outputs.

## Consumption Philosophy

MatchMaker outputs are derived literary intelligence products.

They may help a surface choose what to display, how to explain a literary suggestion, and how to preserve the boundary between literary evidence and user identity evidence.

They must not become truth. They must not be treated as search relevance, graph authority, affinity truth, identity truth, catalog truth, popularity, predicted enjoyment, or an LLM answer.

The consumer's job is to display or adapt the output safely. The consumer must not reinterpret the output as a new source of authority.

## Consumption Boundaries

Consumers may:

- display `MatchMakerRecommendation` outputs in approved surfaces
- transform outputs into existing surface DTOs when transformation rules are followed
- display privacy-safe explanation summaries
- display confidence bands
- display evidence source classes
- use output rank as display order within a MatchMaker-owned module
- fall back to existing non-MatchMaker content when MatchMaker output is empty or unavailable

Consumers must not:

- write MatchMaker outputs into entity, graph, affinity, identity, search, reader, shelf, social, or analytics truth stores
- feed recommendation outputs back into future recommendation generation
- infer new entities from output display text
- expose raw private evidence
- reorder Search results using MatchMaker output
- interrupt Reader workflows with MatchMaker suggestions
- send MatchMaker explanations into an LLM as hidden truth
- persist output IDs as permanent recommendation truth without a separate audited contract

## Authority Boundaries

MatchMaker is downstream of authority systems and upstream of derived intelligence display.

Authority direction:

Entity Platform, Identity Graph, Affinity Layer, Literary Graph -> MatchMaker -> Approved consumer surfaces

No reverse authority is allowed in V1.

Permanent rules:

- MatchMaker outputs must never become entity truth.
- MatchMaker outputs must never become graph truth.
- MatchMaker outputs must never become affinity truth.
- MatchMaker outputs must never become identity truth.
- Recommendation outputs must never feed future recommendations directly.
- Graph proximity alone must never create recommendations.
- Raw search history must never be exposed.
- Raw reading history must never be exposed.
- Raw private user activity must never be exposed.
- Explanations must remain privacy-safe.
- Evidence must remain privacy-safe.

## Consumer Eligibility Rules

A surface may consume MatchMaker only when all rules are true:

1. The surface can display derived intelligence without presenting it as truth.
2. The surface can preserve Work-only scope for V1.
3. The surface can show or preserve explanation and confidence.
4. The surface can fall back safely when MatchMaker produces no output.
5. The surface does not mutate Search, Reader, Graph, Identity Graph, Affinity Layer, or Entity Platform authority.
6. The surface can keep outputs user-private unless a future public-consumption authority exists.
7. The surface is behind a feature flag during rollout.

## Consumer Eligibility Matrix

| Consumer | V1 Eligibility | Status | Notes |
|---|---|---|---|
| Home | Yes | First approved consumer | May consume Work recommendations in a bounded discovery rail. |
| Discovery | Later | Deferred | Must preserve distinction from AI Librarian and future discovery outputs. |
| Book Details | Later | Deferred until Home integration audit passes | May consume contextual Work recommendations near an existing Work. |
| Read Tab | Later | Deferred | High value but privacy-sensitive because reading and shelf signals are salient. |
| Search | No | Prohibited for V1 | Search authority must remain query relevance. |
| Search Results | No | Prohibited for V1 | Must not reorder or inject MatchMaker-ranked intent results. |
| Reader | No | Prohibited for V1 | Reader must remain focused, low-latency, and non-interruptive. |
| AI Librarian | Later | Deferred | Requires LLM/MatchMaker boundary governance. |
| Quotes | Later | Deferred | V1 emits Work recommendations only; Quote recommendations are out of scope. |
| Author Details | Later | Deferred | Author recommendations are prohibited in V1; Work-only modules may be future-approved. |
| Publications | Later | Deferred | Publication recommendations are out of V1 scope. |
| Writing | Later | Deferred | Requires writer-intent and privacy governance. |
| Social | No | Prohibited for V1 | Public/social context creates privacy and feedback-loop risk. |
| Notifications | No | Prohibited for V1 | Push-style recommendations require separate consent and safety authority. |
| Admin | Later | Deferred | May inspect diagnostics only after privacy and role governance. |
| Analytics | No direct consumption | Prohibited for V1 | Aggregates require anonymization and separate analytics authority. |

## Consumer Restriction Matrix

| Consumer | Restriction | Reason |
|---|---|---|
| Home | Must remain a bounded optional rail | Avoids turning MatchMaker into global Home ranking. |
| Discovery | Must not mix with LLM answer authority | Prevents hidden reasoning and source confusion. |
| Book Details | Must anchor to current Work context | Prevents unrelated recommendation injection. |
| Read Tab | Must not reveal private shelf or reading details | Library state is privacy-sensitive. |
| Search | Must not consume directly | Search is intent retrieval, not derived literary alignment. |
| Search Results | Must not reorder results | Avoids authority conflict with Search. |
| Reader | Must not interrupt reading | Protects attention, performance, and privacy. |
| AI Librarian | Must not treat MatchMaker output as LLM ground truth | Prevents opaque answer synthesis. |
| Social | Must not expose personalized outputs | Prevents private inference leakage. |
| Notifications | Must not push recommendations | Requires separate opt-in and safety review. |
| Analytics | Must not store per-output raw evidence | Prevents reconstruction of private activity. |

## Output Transformation Rules

Consumers may transform MatchMaker outputs only into surface-local display DTOs.

Mandatory transformation rules:

1. Preserve `metadata.outputId` as diagnostic metadata only.
2. Preserve `targetEntityRef.entityType === "work"` in V1.
3. Treat `targetSummary` as display data only.
4. Preserve explanation availability in the display model.
5. Preserve confidence band in the display model.
6. Preserve evidence source classes without raw evidence details.
7. Do not transform output rank into global popularity or search relevance.
8. Do not persist transformed output as a durable recommendation record without separate authority.

## Output Transformation Matrix

| MatchMaker Field | Consumer Field | Required Rule |
|---|---|---|
| `targetEntityRef.entityId` | Work/book navigation ID | Use only as Work target identity. |
| `targetEntityRef` | Entity reference | Preserve entity type and authority state. |
| `targetSummary.title` | Display title | Display only; never identity. |
| `targetSummary.subtitle` | Display subtitle/author | Display only; never Author authority. |
| `reason` | Display reason category | Map only to approved copy. |
| `explanation.summary` | Reason text | Truncate safely; do not add hidden rationale. |
| `confidence.band` | Confidence label | Approved for user display. |
| `confidence.score` | Internal ordering/diagnostic | Do not expose as precision unless approved. |
| `evidence[].source` | Source labels | Approved as broad classes only. |
| `evidence[].summary` | Detail text | Show only in surfaces approved for evidence detail. |
| `metadata.outputId` | Diagnostic ID | Not user-facing by default. |

## Explanation Display Rules

Explanations are mandatory for every MatchMaker output, but consumers may choose how much to display.

Rules:

1. Home may show one concise explanation summary.
2. Book Details may show a richer explanation when the recommendation is clearly adjacent to the current Work.
3. Read Tab may show explanation only with privacy-safe wording.
4. Search, Search Results, Reader, Social, Notifications, and Analytics may not display MatchMaker explanations in V1.
5. Consumers must not rewrite explanations to reveal raw evidence, hidden weights, formulas, private shelves, private reading events, raw searches, or subsystem internals.

## Explanation Exposure Matrix

| Consumer | Exposure | V1 Rule |
|---|---|---|
| Home | Summary | Show concise `explanation.summary`. |
| Book Details | Summary plus source labels | Future-approved after Home rollout. |
| Read Tab | Summary only | Future-approved after privacy review. |
| Discovery | Summary only | Deferred. |
| AI Librarian | None in V1 | Requires LLM boundary authority. |
| Search/Search Results | None | Prohibited. |
| Reader | None | Prohibited. |
| Social/Notifications | None | Prohibited. |
| Admin | Diagnostics only | Future role-gated review. |
| Analytics | Aggregate only | Future anonymization authority. |

## Confidence Display Rules

Confidence communicates evidence support, not predicted enjoyment.

Rules:

1. Consumers may display `low`, `medium`, or `high`.
2. Consumers must not describe confidence as rating, quality, popularity, certainty, or likelihood of enjoyment.
3. Numeric confidence scores are internal by default.
4. Numeric scores may be used for diagnostics and bounded ordering inside a MatchMaker-owned module.
5. Confidence must remain attached to the output if the output is transformed.

## Confidence Exposure Matrix

| Consumer | Band | Score | Notes |
|---|---|---|---|
| Home | Yes | No | Display simple confidence label if shown. |
| Book Details | Yes | No | May explain evidence support. |
| Read Tab | Yes | No | Must avoid private inference. |
| Discovery | Yes | No | Deferred. |
| Search/Search Results | No | No | Prohibited. |
| Reader | No | No | Prohibited. |
| AI Librarian | No in V1 | No | Requires governance. |
| Admin | Yes | Yes | Future role-gated diagnostics only. |
| Analytics | Aggregate only | Aggregate only | Future anonymized metrics only. |

## Evidence Display Rules

Evidence is privacy-safe by contract, but display must remain conservative.

Rules:

1. Consumers may display evidence source classes such as affinity, interaction, graph, entity, availability, and discovery context.
2. Consumers may display sanitized evidence summaries only in approved surfaces.
3. Consumers must not display raw private activity, raw search history, raw reading history, private shelf names, private review text, private bookmarks, private quotes, DM activity, hidden weights, embeddings, vectors, or LLM traces.
4. Evidence IDs are internal unless a diagnostics surface is approved.

## Evidence Exposure Matrix

| Consumer | Source Classes | Evidence Summaries | Evidence IDs |
|---|---|---|---|
| Home | Optional | Optional concise summary | No |
| Book Details | Yes | Future-approved | No |
| Read Tab | Limited | Future-approved after privacy review | No |
| Discovery | Limited | Deferred | No |
| Search/Search Results | No | No | No |
| Reader | No | No | No |
| AI Librarian | No in V1 | No | No |
| Admin | Yes | Yes, role-gated | Yes, diagnostics only |
| Analytics | Aggregate only | No | No |

## Privacy Rules

MatchMaker outputs must preserve or narrow privacy.

Rules:

1. User-personalized MatchMaker outputs are private by default.
2. Public surfaces must not directly consume personalized outputs in V1.
3. No consumer may expose raw private source data.
4. No consumer may infer a private user state from explanation wording.
5. A consumer must not widen an output's privacy tier.
6. Consumer telemetry must not log raw evidence summaries when they could reveal private behavior.

## Privacy Matrix

| Privacy Concern | Rule | Enforcement |
|---|---|---|
| Raw search history | Never expose | Snapshot adapter and display review. |
| Raw reading history | Never expose | Use summarized interactions only. |
| Private shelves | Never name unless separately authorized | Use source class only. |
| Private reviews | Never quote or summarize raw text | Use interaction source class only. |
| Private quotes/bookmarks | Never expose raw content | Use source class only. |
| Output privacy tier | Never widen | Consumer must respect output metadata. |
| Public sharing | Prohibited in V1 | No social/public consumption. |

## Caching Rules

Caching must improve performance without creating persistent truth.

Rules:

1. Cache transformed display payloads, not raw MatchMaker input snapshots.
2. Cache per user and per surface.
3. Use short TTLs for V1.
4. Do not cache raw evidence beyond the output payload.
5. Do not use cache contents as future recommendation input.
6. Cache misses must fall back without blocking the surface.

## Caching Matrix

| Consumer | Cache Allowed | TTL Guidance | Notes |
|---|---|---|---|
| Home | Yes | 2-5 minutes | First approved cache target. |
| Book Details | Later | 2-5 minutes | Key by user and Work. |
| Read Tab | Later | 2-5 minutes | Privacy review required. |
| Discovery | Later | 2-5 minutes | Avoid LLM blending. |
| Search/Search Results | No | None | Prohibited. |
| Reader | No in V1 | None | Avoid runtime interruption. |
| Admin | Later | Short diagnostics cache | Role-gated only. |
| Analytics | Later | Aggregate only | Separate authority required. |

## Feature Flag Rules

All MatchMaker consumers must launch behind explicit feature flags.

Rules:

1. Feature flags are required for every new consumer.
2. Flags must be scoped by surface.
3. Flags must support immediate disablement.
4. Flags must not change engine behavior.
5. Disabled flags must fall back to existing surface behavior.

## Feature Flag Matrix

| Surface | Required Flag | Default |
|---|---|---|
| Home | `matchmakerHomeDiscovery` | Off until integration audit passes. |
| Book Details | `matchmakerBookDetails` | Off. |
| Read Tab | `matchmakerReadTab` | Off. |
| Discovery | `matchmakerDiscoverySurface` | Off. |
| AI Librarian | `matchmakerLibrarianBridge` | Off. |
| Admin | `matchmakerAdminDiagnostics` | Off. |
| Search/Search Results/Reader/Social/Notifications | No flag authorizes V1 direct consumption | Prohibited. |

## Fallback Rules

Consumers must degrade quietly.

Rules:

1. Empty MatchMaker output must not break the surface.
2. Errors must fall back to existing non-MatchMaker content.
3. Consumers must not synthesize fake MatchMaker explanations.
4. Consumers must not invent recommendation reasons.
5. Consumers must not retry unboundedly.

## Fallback Matrix

| Consumer | Fallback |
|---|---|
| Home | Existing Home Discovery Console row or editorial/algorithmic content. |
| Book Details | Existing semantic graph connections or related works. |
| Read Tab | Existing shelves and Continue Reading. |
| Discovery | Existing AI Librarian/discovery behavior without MatchMaker injection. |
| Admin | Empty diagnostics state. |
| Prohibited surfaces | No MatchMaker fallback because no consumption is allowed. |

## Telemetry Rules

Telemetry must measure integration health without creating feedback loops.

Allowed telemetry:

- output count
- consumer surface
- confidence band counts
- evidence source class counts
- fallback reason
- latency bucket
- feature flag state

Forbidden telemetry:

- raw evidence summaries
- raw search text
- raw reading history
- raw private activity
- hidden scoring internals
- complete private MatchMaker input snapshots
- durable per-output acceptance signals used as future recommendation input

## Telemetry Matrix

| Metric | Allowed | Notes |
|---|---|---|
| Output count | Yes | Surface-scoped. |
| Confidence band histogram | Yes | Aggregate by request/surface. |
| Evidence source class histogram | Yes | No evidence text. |
| Latency bucket | Yes | Performance only. |
| Output ID | Diagnostics only | Do not use as feedback truth. |
| Click/open event | Limited | Product telemetry only; not recommendation input. |
| Acceptance/rejection loop | No in V1 | Requires separate feedback authority. |
| Raw evidence | No | Permanently forbidden. |

## Feedback Loop Prevention Rules

MatchMaker consumption must never create direct self-training loops in V1.

Rules:

1. Recommendation outputs must not be included in future `MatchMakerInput`.
2. Output clicks must not become `EntityAffinity` without a separate Affinity Layer authority update.
3. Output impressions must not become identity truth.
4. Output ordering must not become popularity.
5. Output IDs must not be treated as entity, graph, affinity, identity, or search keys.
6. A future feedback system must define consent, privacy, lifecycle, idempotency, deletion, and audit semantics before use.

## Feedback Loop Prevention Matrix

| Signal | V1 Use | Future Requirement |
|---|---|---|
| Output impression | Diagnostics only | Feedback contract and privacy review. |
| Output click | Navigation/product telemetry only | Affinity authority update before use. |
| Output dismissal | Diagnostics only | Negative signal governance. |
| Save after output | Existing shelf behavior only | Must not be attributed to MatchMaker without authority. |
| Read after output | Existing Reader behavior only | Must not feed MatchMaker directly. |
| Share output | Prohibited | Public sharing authority required. |

## Rollout Rules

Rollout must proceed from lowest-risk optional consumption to higher-context surfaces.

Required rollout gates:

1. Consumption model approved.
2. Surface adapter designed.
3. Feature flag added.
4. Privacy review passed.
5. Explanation display review passed.
6. Performance budget passed.
7. Fallback verified.
8. No feedback-loop path verified.

## Rollout Matrix

| Phase | Consumer | Status | Gate |
|---|---|---|---|
| 1 | Home Dynamic Discovery | Approved first | `BT-MATCHMAKER-HOME-INTEGRATION-001`. |
| 2 | Book Details contextual Work recommendations | Future | Home integration audit must pass. |
| 3 | Read Tab library suggestions | Future | Privacy review and shelf/reading display rules. |
| 4 | Discovery surface | Future | Separate LLM/discovery boundary authority. |
| 5 | Admin diagnostics | Future | Role-gated diagnostics authority. |
| Deferred | Search/Search Results | Prohibited in V1 | Search authority conflict. |
| Deferred | Reader | Prohibited in V1 | Runtime and attention risk. |
| Deferred | Social/Notifications | Prohibited in V1 | Privacy and push-risk. |
| Deferred | Analytics | Prohibited direct consumption in V1 | Anonymization authority required. |

## Future Expansion Rules

Future consumers require authority updates when they:

- consume non-recommendation MatchMaker outputs
- display discoveries, pathways, insights, challenges, or reflections
- consume non-Work targets
- expose evidence details beyond source classes
- bridge MatchMaker to AI Librarian or LLM surfaces
- use output engagement as feedback
- publish or share MatchMaker-derived intelligence
- aggregate outputs for analytics

Future expansion must update this document and the relevant concern-specific authority document before implementation.

## Governance Rules

1. This document is the first authority for downstream MatchMaker consumption.
2. `MATCHMAKER_OUTPUT_MODEL.md` remains the authority for output contract semantics.
3. `MATCHMAKER_EXPLANATION_MODEL.md` remains the authority for explanation generation and privacy-safe explanation content.
4. `MATCHMAKER_CONFIDENCE_MODEL.md` remains the authority for confidence meaning.
5. Consumer surfaces may not redefine MatchMaker terms.
6. Consumer adapters must be pure transformations unless a separate service authority permits otherwise.
7. All integrations must include regression tests for privacy, fallback, feature flag behavior, and no feedback loops.
8. Any new consumer not listed here is prohibited until this document is updated.

## Architecture Authority Decision

Home Dynamic Discovery is the first approved MatchMaker consumer.

Book Details and Read Tab are future eligible consumers after Home integration is implemented, validated, and audited.

Search, Search Results, Reader, Social, Notifications, and direct Analytics consumption are prohibited in V1.

AI Librarian, Discovery, Admin, Quotes, Author Details, Publications, and Writing remain deferred until separate authority work defines their consumption boundary.

MatchMaker consumption governance is complete for V1 Work recommendation exposure. `BT-MATCHMAKER-HOME-INTEGRATION-001` may begin after this document is approved, provided it follows this consumption model and does not modify contracts, engine internals, authority systems, Search, Reader, Graph, Identity Graph, Affinity Layer, persistence, or UI routes outside the approved Home integration scope.
