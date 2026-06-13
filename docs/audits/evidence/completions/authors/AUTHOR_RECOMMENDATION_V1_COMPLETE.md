---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-RECOMMENDATION-V1-COMPLETE
title: "Author Recommendation V1 Complete"
status: locked
authority_level: audit
owner: author-platform
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: docs/architecture/authors/AUTHOR_RECOMMENDATION_V1_COMPLETE.md
---

# Author Recommendation V1 Complete

Status: MILESTONE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-V1-CLOSURE-001

Owner: Author Intelligence

## Mission

Author Recommendation V1 establishes a governed, privacy-safe Author recommendation subsystem for BookTown.

The mission of V1 is to allow Discovery to suggest canonical Authors from approved Author intelligence signals without changing entity truth, affinity truth, graph truth, identity truth, Search relevance, Reader behavior, MatchMaker V1, or user-facing authority systems.

## Scope

V1 covers:

- canonical Author recommendation targets
- direct Author affinity from explicit Author follows
- approved input snapshot construction
- pure deterministic recommendation engine execution
- candidate generation and filtering
- scoring
- confidence generation
- privacy-safe explanation generation
- output assembly
- Discovery DTO transformation
- Discovery consumption behind feature flag
- aggregate-only telemetry
- bounded runtime wiring from existing Author follow sources

V1 does not cover:

- Author Details recommendation consumption
- Home recommendation consumption
- Search or Search Results consumption
- Reader or Read Tab consumption
- MatchMaker integration
- graph-derived Author recommendations
- Author pathways
- recommendation feedback systems

## Implemented Components

| Component | Status | Notes |
|---|---:|---|
| Author Recommendation Authority | Complete | Defines purpose, boundaries, approved and rejected signals |
| Candidate Universe | Complete | Defines eligible Author candidates and forbidden sources |
| Scoring Model | Complete | Defines score inputs, weights, penalties, and deterministic ranking |
| Confidence and Explanation Model | Complete | Defines confidence independence, caps, and privacy-safe explanations |
| Output Contract | Complete | Defines Author recommendation output shape |
| Consumption Model | Complete | Approves Discovery as first consumer |
| Implementation Plan | Complete | Defines pure engine topology and tests |
| Pure Engine | Complete | Implemented under `lib/domain/authorRecommendations/` |
| Input Snapshot Builder | Complete | Implemented under `lib/authorRecommendations/` |
| Discovery DTO Adapter | Complete | Strips forbidden fields before UI |
| Discovery Module | Complete | Mounted below Discovery intro/history row and above AI Agents grid |
| Runtime Wiring | Complete | Reads bounded followed Authors and builds approved snapshot sources |
| Feature Flag | Complete | `VITE_AUTHOR_RECOMMENDATIONS_DISCOVERY` / `authorRecommendationsDiscovery` |
| Telemetry | Complete | Aggregate-only event payloads |

## Architecture Summary

The V1 runtime path is:

```text
Author follow
-> UserEntityInteraction
-> direct Author EntityAffinity
-> AuthorRecommendationInput snapshot
-> Author Recommendation Engine
-> AuthorRecommendation output
-> Discovery DTO adapter
-> Recommended Authors module
-> aggregate-only telemetry
```

The engine is pure and deterministic. Discovery runtime orchestration is consumer-side and does not change engine logic, contracts, scoring, confidence, explanations, or output assembly.

## Governance Summary

Author Recommendation V1 is derived literary intelligence.

It must never become:

- canonical Author truth
- graph truth
- identity truth
- affinity truth
- Search truth
- Reader truth
- MatchMaker V1 truth

Discovery is the first approved consumer. Other surfaces require separate authority and implementation approval.

## Privacy Summary

V1 privacy controls include:

- no raw reading history in snapshots, DTOs, UI, or telemetry
- no raw review text
- no raw quote text
- no private shelf names
- no search terms
- no raw affinity payloads in UI
- no evidence IDs in UI or telemetry
- no output IDs in UI or telemetry
- no numeric confidence in UI or telemetry
- no recommendation scores in UI or telemetry

Evidence may appear only as broad source-class labels such as direct author activity or repeated work-level activity.

## Discovery Integration Summary

Discovery consumes Author Recommendations through a dedicated `RecommendedAuthorsModule`.

Placement:

- below the Discovery intro/history row
- above the AI Agents grid

Rules:

- feature flag off suppresses the entire path
- no recommendations suppress the module
- engine errors suppress the module
- invalid DTOs suppress rendering
- maximum 3 visible cards
- maximum 6 renderable DTOs
- navigation opens Author Details by canonical Author ID

AI Librarian author cards remain AI outputs and are not Author Recommendations.

## Telemetry Summary

Telemetry is aggregate-only and consumer-side.

Allowed events:

- `module_rendered`
- `module_suppressed`
- `module_empty`
- `module_error`
- `card_opened`

Allowed metrics:

- output count
- confidence band histogram
- source class histogram
- latency bucket
- fallback reason

Forbidden telemetry:

- author IDs
- evidence IDs
- output IDs
- raw evidence
- raw affinity payloads
- search terms
- review text
- quote text
- shelf names
- reading history
- numeric confidence
- recommendation score

Telemetry does not influence recommendation generation, ranking, confidence, candidate generation, affinity, identity, graph state, or future recommendation inputs.

## Testing Summary

Validated areas:

- Author follow interaction adapter
- direct Author affinity adapter
- Work-to-Author rollup adapter
- input snapshot builder
- candidate generation
- candidate filtering
- scoring
- confidence
- explanations
- output assembly
- engine determinism
- Discovery DTO transformation
- Discovery UI rendering
- feature flag suppression
- empty and error suppression
- AI Librarian namespace isolation
- aggregate-only telemetry
- cache fingerprint behavior
- runtime typecheck
- Functions typecheck

Latest relevant validation:

```text
npm run typecheck:runtime
npm run typecheck:functions
node functions/scripts/syncContracts.cjs
npx vitest run test/domain/authorRecommendations/*.test.ts test/ui/discoveryAuthorRecommendations.test.tsx lib/featureFlags.test.ts
```

All listed validations passed at V1 closure.

## Validation Summary

| Validation Area | Status |
|---|---:|
| Pure engine tests | Passed |
| Discovery integration tests | Passed |
| Feature flag tests | Passed |
| Telemetry tests | Passed |
| Runtime typecheck | Passed |
| Functions typecheck | Passed |
| Contract sync | Passed |
| Privacy boundary tests | Passed |
| AI Librarian boundary tests | Passed |

## Known Limitations

- Runtime Discovery wiring currently uses direct Author follows as the live source path.
- Work-to-Author rolled affinity is supported by architecture, engine, snapshot builder, and tests, but runtime Discovery expansion for rolled affinity is deferred.
- Telemetry is aggregate-only and intentionally not a recommendation feedback system.
- Discovery renders a compact V1 module, not a full Author recommendation exploration surface.
- V1 recommends canonical Authors only; it does not recommend Works, Quotes, Themes, Concepts, pathways, or related Authors.

## Deferred Work

Deferred beyond V1:

- Author Details recommendation consumption
- Home recommendation consumption
- Graph-derived author recommendations
- Author pathways
- MatchMaker integration
- Work-to-Author rolled affinity runtime expansion
- Recommendation feedback systems

## Future Phases

Future phases require separate authority and validation.

Recommended future sequence:

1. Runtime rolled Author affinity expansion for Discovery.
2. Discovery beta validation and metrics review.
3. Author Details consumption authority.
4. Author Details recommendation module.
5. Home consumption authority.
6. Author pathway authority.
7. Future MatchMaker Author target authority.

## Rollout Status

Author Recommendation V1 is approved for the current beta cycle behind:

```text
VITE_AUTHOR_RECOMMENDATIONS_DISCOVERY
```

Recommended rollout posture:

- default off
- internal beta only
- small controlled cohort first
- monitor rendered, suppressed, empty, error, and card-open events
- do not use telemetry for ranking, candidate generation, affinity, graph, identity, or future recommendation input

## Success Criteria Achieved

| Criterion | Status |
|---|---:|
| Canonical Author targets only | Achieved |
| Direct Author follow can produce Discovery recommendation | Achieved |
| Pure deterministic engine | Achieved |
| Privacy-safe DTO transformation | Achieved |
| Confidence separated from score | Achieved |
| Explanations are privacy-safe | Achieved |
| Feature flag default-off behavior | Achieved |
| Empty/error suppression | Achieved |
| Aggregate-only telemetry | Achieved |
| AI Librarian namespace separation | Achieved |
| Search and Reader contamination prevention | Achieved |
| MatchMaker V1 remains Work-only | Achieved |
| Runtime and Functions typechecks pass | Achieved |

## Permanent Boundaries

- Author Recommendation outputs must never become entity truth.
- Author Recommendation outputs must never become graph truth.
- Author Recommendation outputs must never become affinity truth.
- Author Recommendation outputs must never become identity truth.
- Author Recommendation outputs must never feed future recommendations directly.
- Discovery may consume V1 only through approved DTO transformation.
- Search must not consume Author Recommendation outputs.
- Reader must not consume Author Recommendation outputs.
- Home must not consume Author Recommendation outputs in V1.
- Author Details must not consume Author Recommendation outputs in V1.
- AI Librarian outputs are not Author Recommendation outputs.
- MatchMaker V1 remains Work-only.
- Future phases require separate authority.

## Final Architectural Verdict

Author Recommendation V1 is complete.

Discovery is the first approved consumer.

The subsystem is ready for the current internal beta cycle behind the dedicated feature flag, subject to normal rollout controls and monitoring.

Recommendation outputs are derived intelligence only and are not authority truth.

MatchMaker V1 remains Work-only.

Future Author Recommendation expansion requires separate authority, implementation, validation, and rollout approval.
