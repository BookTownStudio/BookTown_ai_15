# Author Recommendation Consumer Model

Status: ARCHITECTURE_AUDIT

Audit: BT-AUTHOR-RECOMMENDATION-CONSUMPTION-AUDIT-001

Owner: Author Intelligence

## Purpose

This document audits how Author Recommendation outputs may be safely consumed inside BookTown after the pure Author Recommendation Engine has been implemented and validated.

It does not implement product integration. It defines the approved consumption posture, prohibited surfaces, future surface order, display transformation rules, confidence exposure rules, explanation exposure rules, privacy boundaries, feature flag behavior, telemetry rules, fallback behavior, caching expectations, and feedback-loop prevention requirements.

## Governing Authorities

- `AUTHOR_RECOMMENDATION_AUTHORITY.md`
- `AUTHOR_RECOMMENDATION_CANDIDATE_UNIVERSE.md`
- `AUTHOR_RECOMMENDATION_SCORING_MODEL.md`
- `AUTHOR_RECOMMENDATION_CONFIDENCE_EXPLANATION_MODEL.md`
- `AUTHOR_RECOMMENDATION_OUTPUT_CONTRACT.md`
- `AUTHOR_RECOMMENDATION_CONSUMPTION_MODEL.md`
- `AUTHOR_RECOMMENDATION_IMPLEMENTATION_PLAN.md`

## Current State

| Subsystem | State |
|---|---|
| Author Recommendation Engine | Implemented and validated |
| Author Identity | Implemented |
| Direct Author Affinity | Implemented |
| Work-to-Author Rollups | Implemented |
| User-facing Author Recommendations | Not exposed |
| MatchMaker V1 | Work-only |
| Discovery integration | Not implemented |

## Consumption Decision

The first approved consumer is **Discovery** behind the dedicated feature flag:

```text
authorRecommendationsDiscovery
```

Discovery is the safest first surface because it is exploratory, does not own Search authority, does not interrupt Reader workflows, and can present recommendations as derived literary intelligence without implying canonical truth.

Home, Author Details, Book Details, and AI Librarian remain future consumers only. Search, Search Results, Reader, Social, and Notifications are prohibited.

## Consumption Matrix

| Surface | Status | Consumption Rule | Rationale |
|---|---|---|---|
| Discovery | Approved first | May consume after separate integration implementation and validation | Exploratory surface with lowest authority contamination risk |
| Home | Future | May consume only after Discovery validation | High visibility; requires stronger fallback and performance validation |
| Author Details | Future | Defer until related-Author governance matures | Risk of appearing as graph or identity truth |
| Book Details | Future | Defer; prefer Author-context Work modules first | Must avoid converting Work context into Author recommendation authority |
| AI Librarian | Future | Requires conversational privacy authority | Natural-language disclosure risks are higher |
| Admin Diagnostics | Diagnostics only | May inspect counts, bands, fallback states, and source classes | No user-facing recommendation consumption |
| Search | Prohibited | Must not consume | Search remains independent relevance authority |
| Search Results | Prohibited | Must not blend recommendation outputs with search ranking | Prevents Search contamination |
| Reader | Prohibited | Must not consume | Reader must remain independent and non-intrusive |
| Read Tab | Deferred | No Phase 1 consumption | Strong privacy sensitivity |
| Social | Prohibited | Must not consume | Prevents social-suggestion and feedback-loop confusion |
| Notifications | Prohibited | Must not consume | Too intrusive for derived intelligence |

## Consumer Readiness Matrix

| Consumer | Ready Now | Required Before Exposure |
|---|---:|---|
| Discovery | Yes for integration planning | Feature flag, adapter, fallback, cache, telemetry, privacy tests |
| Home | No | Discovery validation, stronger latency and placement governance |
| Author Details | No | Related Author authority and graph-context boundaries |
| Book Details | No | Book-context consumption authority |
| AI Librarian | No | Conversational explanation and privacy governance |
| Admin Diagnostics | Partial | Debug-only contract and access control |
| Search/Search Results | No | Prohibited |
| Reader/Read Tab | No | Prohibited or deferred |
| Social/Notifications | No | Prohibited |

## Display Transformation Rules

Author Recommendation outputs must be transformed into a surface DTO before display.

Allowed display fields:

- Author display name from `targetSummary`
- Author image from `targetSummary`, if available
- short safe subtitle from `targetSummary`
- privacy-safe explanation summary
- confidence band label only
- navigation target derived from canonical Author ref

Forbidden display fields:

- `metadata.outputId`
- evidence IDs
- raw evidence
- raw provenance evidence
- numeric confidence score
- hidden weights
- scoring components
- private activity details
- Search terms
- raw reading history
- raw review, quote, or shelf text

## Confidence Exposure Matrix

| Confidence Field | User Display | Admin Diagnostics | Rule |
|---|---:|---:|---|
| Band | Allowed | Allowed | Display as low, medium, or high confidence only |
| Numeric score | Forbidden | Conditional future debug only | Must not appear in product UI |
| Rationale | Allowed if privacy-safe | Allowed | Must not claim certainty, rating, quality, or predicted enjoyment |
| Score formula | Forbidden | Forbidden by default | Hidden weights must not be exposed |
| Rank position | Forbidden | Aggregate only | Must not become user-facing confidence proxy |

Confidence must never be described as:

- predicted enjoyment
- rating
- certainty
- popularity
- literary quality
- graph importance
- canonical truth

## Explanation Exposure Matrix

| Explanation Element | Exposure | Rule |
|---|---|---|
| Summary | Allowed | Must be short and privacy-safe |
| Evidence source classes | Allowed in broad terms | Examples: direct author activity, repeated work-level activity |
| Contradiction note | Allowed when material | Must stay generic |
| Privacy limitation note | Allowed when material | Must not reveal hidden private details |
| Authority boundary | Optional product copy, diagnostics recommended | Must preserve derived-intelligence status |
| Evidence IDs | Forbidden | Internal only |
| Output IDs | Forbidden | Internal only |
| Raw evidence text | Forbidden | Never display |
| Hidden formulas | Forbidden | Never display |

## Privacy Matrix

| Boundary | Rule | Enforcement |
|---|---|---|
| Private evidence | Display aggregate source classes only | Adapter transformation |
| Raw reading history | Never expose | Tests and DTO review |
| Private shelves | Never expose | Tests and DTO review |
| Private reviews | Never expose | Tests and DTO review |
| Private quotes | Never expose | Tests and DTO review |
| Search terms | Never expose | No Search consumption |
| Output IDs | Never display | DTO omission |
| Evidence IDs | Never display | DTO omission |
| Numeric confidence | Do not expose by default | DTO omission |
| Privacy tier | Preserve or narrow | Adapter validation |
| Telemetry | Counts/classes/bands only | Structured logging rules |

## Evidence Exposure Rules

Evidence may be exposed only as broad, privacy-safe classes:

- direct author activity
- repeated activity across several works
- canonical Author summary available
- mixed evidence note
- privacy-limited evidence note

Evidence must never expose:

- raw reading history
- raw Work IDs in product text
- private shelf names
- private review text
- private quote text
- raw search text
- provenance evidence arrays
- evidence IDs
- output IDs
- scoring internals

## Feature Flag Matrix

| Flag | Default | Scope | Required Behavior |
|---|---:|---|---|
| `authorRecommendationsDiscovery` | Off | Discovery only | Enables first approved consumer |
| `authorRecommendationsHome` | Off | Future Home | Must remain unavailable until Discovery validation |
| `authorRecommendationsAuthorDetails` | Off | Future Author Details | Requires separate authority |
| `authorRecommendationsDebug` | Off | Admin diagnostics | Must not expose to users |

Feature flags must be evaluated before invoking product display logic. When disabled, the surface must behave exactly as it does without Author Recommendations.

## Telemetry Matrix

| Telemetry Field | Allowed | Notes |
|---|---:|---|
| Feature flag state | Yes | Boolean or rollout cohort |
| Output count | Yes | Aggregate count only |
| Confidence band histogram | Yes | No numeric confidence scores |
| Evidence source class histogram | Yes | Broad classes only |
| Fallback reason | Yes | Enum only |
| Latency bucket | Yes | Bucketed, not raw payload |
| Candidate count bucket | Yes | Bucketed |
| Surface name | Yes | Discovery/Home/etc. |
| User ID | Existing platform policy only | Do not create new identity tracking |
| Raw evidence | No | Forbidden |
| Evidence IDs | No | Forbidden |
| Output IDs | No | Forbidden for analytics keys |
| Raw private activity | No | Forbidden |
| Search terms | No | Forbidden |

## Fallback Matrix

| Condition | Required Behavior |
|---|---|
| Feature flag off | Do not call display path; preserve existing surface behavior |
| Empty engine output | Do not render Author Recommendation module |
| Engine error | Suppress module and preserve existing surface behavior |
| Privacy block | Suppress affected recommendation or module |
| Missing Author summary | Suppress affected recommendation |
| No eligible candidates | Do not render module |
| Cache miss | Compute only through authorized adapter |
| Cache stale | Recompute or omit module |

Fallback must not:

- insert popular Authors
- query Search
- degrade to graph-near Authors
- create synthetic recommendations
- persist failed recommendation state as truth

## Caching Strategy

Phase 1 Discovery consumption may use per-user caching only after integration authority defines the storage mechanism.

Required caching rules:

1. Cache transformed display DTOs or bounded engine outputs only when privacy policy permits.
2. Do not cache raw `AuthorRecommendationInput` snapshots.
3. Do not cache raw evidence.
4. Use short TTL: 2-5 minutes for beta/canary.
5. Invalidate or bypass cache when feature flag is off.
6. Cache keys must not use output IDs as authority or feedback-loop identifiers.

## Feedback-Loop Prevention

Author Recommendation outputs must never become:

- Entity truth
- Identity Graph truth
- Affinity truth
- Literary Graph truth
- Search relevance input
- Reader behavior input
- future candidate source
- future scoring source
- social suggestion input

Permitted telemetry may record aggregate display and fallback behavior only. Recommendation impressions, clicks, or dismissals must not feed future Author Recommendation input without a separate feedback-loop authority.

## Discovery Readiness

Discovery is approved for the first integration request, but not yet product-ready.

Discovery integration must define:

- input snapshot builder from authorized Author summaries and Author affinities
- feature flag gate
- pure engine invocation
- display DTO transformation
- empty/error fallback
- privacy-safe field whitelist
- confidence band-only display
- no raw evidence exposure
- no recommendation persistence
- no recommendation feedback loop
- targeted integration tests

## Home Readiness

Home is not approved for Phase 1.

Home may be reconsidered only after Discovery canary validation because Home has higher visibility, stronger latency expectations, more personalization expectations, and greater risk that users interpret the module as canonical platform judgment.

## Author Details Readiness

Author Details is not approved for Phase 1.

Author Details requires separate related-Author governance before showing Author recommendations on an Author page. The risk is that recommendations may be interpreted as graph truth, influence truth, similarity truth, or canonical relationship truth.

## Book Details Readiness

Book Details is not approved for Phase 1.

Book Details should first use Author-context Work modules, not direct Author recommendation modules. Direct Author recommendations from Book Details risk collapsing Work context into Author affinity or recommendation eligibility.

## Future Expansion Matrix

| Phase | Surface | Status | Preconditions |
|---|---|---|---|
| Phase 1 | Discovery | Approved for integration planning | This audit, feature flag, fallback, telemetry, privacy tests |
| Phase 2 | Home | Future | Discovery validation and latency review |
| Phase 3 | Author Details | Future | Related Author authority |
| Phase 4 | Book Details | Future | Book-context consumption authority |
| Phase 5 | AI Librarian | Future | Conversational privacy authority |
| Never/Prohibited | Search/Search Results | Prohibited | None |
| Never/Prohibited | Reader | Prohibited | None |
| Never/Prohibited | Social/Notifications | Prohibited | None |

## Risk Matrix

| Risk | Severity | Mitigation |
|---|---:|---|
| Raw evidence leaks into UI | High | Strict DTO whitelist and tests |
| Numeric confidence treated as user-facing score | High | Expose band only |
| Search contamination | High | Prohibit Search/Search Results consumption |
| Recommendation feedback loop | High | Do not persist outputs as future inputs |
| Graph or identity authority confusion | High | Authority boundary copy and no graph mutation |
| Home exposure before Discovery validation | Medium | Discovery-first rollout only |
| Cache retains private raw evidence | Medium | Do not cache raw inputs/evidence |
| Telemetry captures sensitive evidence | Medium | Log counts, bands, classes, and fallback enums only |
| Empty output creates blank UI | Medium | Suppress module and preserve existing behavior |
| AI Librarian overexplains evidence | Medium | Defer until conversational privacy governance |

## Required Questions

| Question | Decision |
|---|---|
| What should be the first approved consumer? | Discovery |
| Which surfaces are prohibited? | Search, Search Results, Reader, Social, Notifications |
| Should Discovery be the first rollout surface? | Yes |
| How should confidence be displayed? | Confidence band only by default |
| How should explanations be displayed? | Short privacy-safe summary plus broad source classes when appropriate |
| What evidence may be exposed? | Broad source classes only |
| What evidence must never be exposed? | Raw private activity, evidence IDs, output IDs, hidden weights, raw search/reading/review/quote/shelf data |
| How should empty output behave? | Do not render module; preserve existing surface behavior |
| How should feature flags operate? | Default off, surface-specific, evaluated before display |
| How should telemetry operate? | Aggregate counts, bands, classes, latency buckets, fallback enums only |
| How are feedback loops prevented? | Outputs, impressions, and clicks cannot feed future recommendations without separate authority |

## Final Rollout Recommendation

Proceed to a bounded Discovery integration planning request.

Recommended next request:

```text
BT-AUTHOR-RECOMMENDATION-DISCOVERY-INTEGRATION-PLAN-001
```

That request must define the exact Discovery files, adapter boundaries, DTO transformation, feature flag implementation, fallback behavior, telemetry events, cache policy, privacy tests, and validation commands.

Do not expose Author Recommendations to beta users until Discovery integration is implemented, tested, and separately validated.

## Audit Verdict

Author Recommendation consumption governance is sufficient to begin Discovery integration planning.

It is not yet sufficient for user exposure. Product exposure requires a separate Discovery implementation, targeted privacy/fallback/feature-flag validation, and canary readiness audit.
