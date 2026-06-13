# Discovery Consumer Governance

Status: ARCHITECTURE_AUTHORITY

Request: BT-DISCOVERY-RECOMMENDATION-BOUNDARIES-001

Owner: Discovery / Consumer Governance

## Purpose

This document defines what Discovery may consume, what it must not consume, and how future recommendation-producing systems can safely enter Discovery.

It governs consumption. It does not redefine Author Recommendation Engine behavior, MatchMaker behavior, AI Librarian behavior, Search behavior, Reader behavior, persistence, UI implementation, or Firestore schemas.

## Consumer Governance Model

Discovery is a consumer surface, not an authority system.

Discovery may consume outputs only when:

1. the producing system has an approved output contract;
2. Discovery is an approved consumer for that output;
3. a feature flag gates rollout;
4. a surface DTO strips forbidden fields;
5. confidence and explanation rules are preserved;
6. privacy boundaries are testable;
7. fallback behavior preserves existing Discovery;
8. telemetry is aggregate and non-authoritative;
9. outputs cannot feed future recommendation inputs.

## Approved Consumer Matrix

| Producer | Output | Discovery Status | Conditions |
|---|---|---|---|
| AI Librarian | conversational suggestions | Existing | Must remain AI namespace |
| Author Recommendation Engine | `AuthorRecommendation` | Approved first governed recommendation module | Requires flag, DTO, fallback, telemetry, privacy tests |
| MatchMaker V1 | Work recommendations | Not approved | MatchMaker Discovery consumption is deferred |
| Future MatchMaker versions | discoveries/pathways/etc. | Future | Requires specific authority |
| Editorial systems | editorial discovery modules | Conditional future | Requires editorial authority |
| Search | search results | Prohibited as recommendation input | Search remains separate authority |
| Reader | reader state | Prohibited as direct display recommendation source | Reader privacy boundary |

## Prohibited Consumer Matrix

| Source Or Output | Discovery Consumption Rule | Reason |
|---|---|---|
| Raw Search results as recommendations | Prohibited | Search authority contamination |
| Raw reading history | Prohibited | Privacy |
| Raw affinity records | Prohibited for display | Private evidence |
| Raw Identity Graph interactions | Prohibited for display | Private behavior |
| Graph proximity alone | Prohibited | Graph truth confusion |
| Popularity-only rankings | Prohibited | Not literary intelligence |
| AI Librarian author cards as Author Recommendations | Prohibited | Wrong namespace and confidence model |
| MatchMaker V1 as Author Recommendations | Prohibited | V1 Work-only |
| Recommendation output IDs as cache/feedback keys | Prohibited | Feedback-loop risk |

## AI Librarian Consumption Rules

AI Librarian may consume user prompts and agent session context according to AI agent authority.

AI Librarian may not consume Author Recommendation Engine outputs unless a future AI/Recommendation bridge authority defines:

- prompt disclosure rules
- privacy filtering
- confidence translation
- explanation rewriting limits
- output provenance
- no-feedback-loop controls
- user-facing labeling

Until then, AI Librarian and Author Recommendations must remain separate.

## Author Recommendation Consumption Rules

Discovery may consume Author Recommendation Engine outputs only through:

```text
author_recommendations namespace
Recommended Authors module
authorRecommendationsDiscovery feature flag
```

Mandatory transformation:

```text
AuthorRecommendation -> DiscoveryAuthorRecommendationCardDTO
```

DTO may contain:

- `authorId`
- `displayName`
- `subtitle`
- `imageUrl`
- `explanationSummary`
- `confidenceBand`
- `sourceClassLabels`

DTO must not contain:

- `metadata.outputId`
- evidence IDs
- raw evidence
- raw provenance
- raw affinity payloads
- numeric confidence score
- score components
- private activity text

## MatchMaker Consumption Rules

Discovery may not consume MatchMaker V1 outputs.

Future MatchMaker outputs may be consumed only after:

- MatchMaker version authorizes the output;
- Discovery consumer authority is updated;
- module authority is created;
- AI Librarian boundary is preserved;
- Work/Author/entity scope is explicit;
- confidence, evidence, explanation, privacy, telemetry, and fallback rules are defined.

## Confidence And Explanation Boundaries

Discovery must preserve the producer's confidence semantics.

| Producer | Display Rule |
|---|---|
| AI Librarian | Conversational explanation only; no governed confidence band unless AI authority permits |
| Author Recommendations | Band only; no numeric score |
| MatchMaker | Follow MatchMaker confidence model |
| Editorial | Do not mimic algorithmic confidence |

Explanations must not be rewritten across namespaces.

Author Recommendation explanations may be shortened for UI, but must not add claims not present in the output.

## Privacy Boundaries

Discovery must apply the strictest privacy boundary of the consumed output.

Display must never expose:

- private shelves
- private reviews
- private quotes
- raw reading history
- raw search history
- raw interaction events
- raw affinity payloads
- evidence IDs
- output IDs
- numeric confidence scores
- hidden weights

If privacy-safe display is impossible, suppress the output.

## Telemetry Boundaries

Allowed telemetry:

- namespace
- module name
- feature flag state
- output count
- confidence band histogram
- broad evidence source class histogram
- fallback reason
- latency bucket
- card open count
- follow click count if follow UI is present

Forbidden telemetry:

- raw evidence
- evidence IDs
- output IDs
- raw affinity data
- raw private activity
- Search terms
- numeric confidence
- score components
- generated explanation text when it contains private-derived details

Telemetry is observability only. It is not recommendation input.

## Caching Rules

Discovery may cache only:

- transformed DTOs; or
- bounded engine outputs if a later implementation authority proves privacy safety.

Phase 1 requirement:

- cache transformed DTOs only
- per user
- TTL 2-5 minutes
- no raw input snapshots
- no raw evidence
- no output IDs as cache authority
- feature flag off bypasses cache

## Feedback Loop Prevention

Discovery recommendation consumption must be acyclic.

Allowed:

- aggregate observability
- fallback counts
- card open counts
- confidence band histograms

Forbidden without separate authority:

- using impressions as future evidence
- using clicks as future affinity
- using follows as recommendation feedback
- using dismissals as negative recommendation evidence
- using AI chat responses as candidate seeds
- using Author Recommendation outputs as MatchMaker input

## Future Discovery Evolution

Discovery should evolve toward a module registry model:

```text
Discovery Surface
  AI Namespace
    AI Agent Grid
    AI Librarian Conversation
  Author Recommendation Namespace
    Recommended Authors
  Future MatchMaker Namespace
    Work Discovery / Pathways / Challenges
  Editorial Namespace
    Curated modules
```

Each namespace must have independent:

- contracts
- feature flags
- telemetry
- privacy tests
- fallback behavior
- UI labeling
- no-feedback-loop guarantees

## Implementation Sequence

1. Establish namespace files and tests.
2. Add feature flag.
3. Quarantine AI Librarian author card behavior as AI namespace.
4. Add Author Recommendation DTO adapter.
5. Add Discovery module.
6. Add fallback and privacy suppression.
7. Add telemetry.
8. Validate with Discovery readiness audit.
9. Canary only after validation passes.

## Risk Matrix

| Risk | Severity | Required Governance |
|---|---:|---|
| Discovery becomes an untyped recommendation sink | High | Namespace and module authority |
| AI suggestions treated as governed recommendations | High | AI namespace quarantine |
| Author Recommendation confidence leaks as score | High | Band-only DTO |
| Feedback loops emerge through clicks/follows | High | Telemetry-only events |
| MatchMaker outputs mixed with Author outputs | High | Producer separation |
| Search relevance contaminated | High | Search prohibition |
| Private evidence exposure | High | DTO whitelist and tests |

## Architecture Authority Decision

Discovery may consume Author Recommendations only as a governed module in the `author_recommendations` namespace.

Discovery must not treat AI Librarian outputs, Search results, MatchMaker V1 outputs, graph proximity, or popularity rankings as Author Recommendation outputs.

The next implementation request may add Author Recommendations to Discovery only if it preserves this consumer governance model.
