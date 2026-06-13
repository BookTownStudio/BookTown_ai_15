---
id: BT-DOCS-ARCHITECTURE-DISCOVERY-DISCOVERY-RECOMMENDATION-BOUNDARIES
title: "Discovery Recommendation Boundaries"
status: active
authority_level: architecture
owner: discovery-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Discovery Recommendation Boundaries

Status: ARCHITECTURE_AUTHORITY

Request: BT-DISCOVERY-RECOMMENDATION-BOUNDARIES-001

Owner: Discovery / Literary Intelligence

## Purpose

This document defines the canonical boundaries for recommendation-producing systems inside Discovery.

Discovery may eventually host multiple literary intelligence systems, but those systems must remain architecturally distinct. Outputs from AI Librarian, Author Recommendations, MatchMaker, and future engines must never be merged into a single implicit recommendation namespace.

## Discovery Mission

Discovery is BookTown's exploratory literary surface.

Discovery helps users encounter books, authors, ideas, agents, conversations, and future literary intelligence modules. It is not Search, not Reader, not Home, not a canonical graph authority, and not a single recommendation engine.

Discovery may display derived intelligence, but it must preserve the authority of the system that produced each output.

## Discovery Architectural Role

Discovery is a hub that can host:

- AI agent experiences
- governed recommendation modules
- future MatchMaker discovery or recommendation modules
- future pathways and literary context modules
- static or editorial exploratory modules

Discovery does not own:

- entity truth
- graph truth
- affinity truth
- identity truth
- search relevance
- reader behavior authority
- recommendation feedback-loop authority

## Recommendation Namespace Model

Every recommendation-producing system inside Discovery must have a namespace.

| Namespace | Producer | Output Type | Status |
|---|---|---|---|
| `ai_librarian` | AI Librarian / agent runtime | conversational suggestions | Existing, not governed Author Recommendations |
| `author_recommendations` | Author Recommendation Engine | `AuthorRecommendation` | Approved for future Discovery module |
| `matchmaker` | MatchMaker versioned engines | MatchMaker outputs | Future; V1 remains Work-only and not approved for Discovery |
| `editorial` | BookTown editorial/configuration | editorial modules | Future or existing where separately governed |
| `future_literary_intelligence` | future bounded engines | versioned outputs | Requires authority before use |

Namespace rules:

1. A module must declare one namespace.
2. Outputs must not cross namespaces without a written bridge authority.
3. AI Librarian outputs are not Author Recommendation Engine outputs.
4. Author Recommendation outputs are not MatchMaker V1 outputs.
5. MatchMaker V1 remains Work-only.
6. Search results must not be represented as recommendations.
7. Recommendation namespaces must not share output IDs as authority keys.

## AI Librarian Boundaries

AI Librarian is a conversational AI experience.

AI Librarian may:

- answer user prompts
- return conversational book suggestions
- render agent-authored cards when the AI contract permits
- navigate users to canonical entities after validation

AI Librarian must not:

- claim to emit governed Author Recommendation Engine outputs
- expose Author Recommendation confidence or evidence semantics
- consume Author Recommendation outputs in prompts without a separate conversational privacy authority
- turn conversational suggestions into entity, affinity, identity, graph, or search truth
- feed conversational suggestions into future recommendation inputs

Existing AI Librarian author-like cards must be treated as `ai_librarian` namespace output only.

They cannot be labeled, logged, cached, tested, or displayed as Author Recommendations.

## Author Recommendation Boundaries

Author Recommendations are generated only by the pure Author Recommendation Engine.

Inside Discovery, Author Recommendations may be displayed only through a dedicated `author_recommendations` module behind:

```text
authorRecommendationsDiscovery
```

Author Recommendation module requirements:

- transform outputs through a surface DTO
- expose confidence band only
- expose privacy-safe explanation summary only
- omit raw evidence
- omit evidence IDs
- omit output IDs
- omit numeric confidence scores
- navigate through canonical Author refs
- suppress invalid or privacy-unsafe outputs
- fall back by rendering no module

Author Recommendations must not be:

- inserted into AI Librarian chat bubbles
- mixed with AI Librarian author cards
- shown on Author Details before separate approval
- shown in Home before Discovery validation
- shown in Search, Reader, Social, or Notifications

## MatchMaker Boundaries

MatchMaker is a separate Literary Intelligence Layer.

MatchMaker V1:

- is Work-only
- is not Author Recommendation infrastructure
- is not approved for Discovery consumption
- must not be used to generate Author recommendations

Future MatchMaker Discovery or recommendation outputs may coexist in Discovery only after:

1. the relevant MatchMaker version authorizes the output type;
2. Discovery has a namespace-specific consumer authority;
3. output display rules are defined;
4. confidence, explanation, privacy, telemetry, and feedback-loop rules are defined;
5. AI Librarian boundaries are preserved.

## Future Recommendation Systems

Any future recommendation-producing system must define:

- namespace
- producer authority
- output contract
- eligible consumers
- feature flag
- display DTO
- confidence model
- explanation model
- privacy model
- telemetry model
- fallback behavior
- feedback-loop rules

No future system may rely on Discovery placement alone as authorization.

## Confidence And Explanation Boundaries

| Producer | Confidence Meaning | Explanation Rule |
|---|---|---|
| AI Librarian | Conversational confidence, if present, is not product recommendation confidence | May explain conversational reasoning only within AI safety/privacy rules |
| Author Recommendations | Trust in recommendation evidence, separate from score/enjoyment | Must use privacy-safe summary and band-only confidence |
| MatchMaker | MatchMaker confidence semantics | Must follow MatchMaker confidence and explanation authority |
| Editorial | Editorial confidence is not algorithmic confidence | Must not mimic engine confidence |

Confidence from one namespace must not be displayed under another namespace.

## Privacy Boundaries

Discovery recommendation modules must never display:

- raw reading history
- raw search history
- raw affinity payloads
- private shelf names
- private review text
- private quote text
- evidence IDs
- output IDs
- hidden scoring formulas
- graph traversal internals

Private evidence may influence governed outputs only when the producing authority permits aggregate, privacy-safe explanations.

## Feedback Loop Prevention

Recommendation outputs, impressions, clicks, follows, dismissals, and opens must not feed future recommendation generation unless a separate feedback-loop authority explicitly permits it.

Permanent prohibitions:

- outputs must not become entity truth
- outputs must not become graph truth
- outputs must not become affinity truth
- outputs must not become identity truth
- outputs must not become Search relevance
- AI suggestions must not seed Author Recommendation candidates
- Author Recommendation outputs must not seed AI Librarian hidden context without authority

## Risk Matrix

| Risk | Severity | Governance |
|---|---:|---|
| AI Librarian cards mistaken for Author Recommendations | High | Namespace labeling and separate modules |
| Author Recommendations imply graph truth | High | Derived-intelligence copy and no related-author claims |
| MatchMaker and Author Recommendation outputs merge | High | Namespace separation |
| Numeric confidence leaks | High | Band-only display for governed recommendations |
| Raw private evidence leaks | High | DTO whitelist and DOM tests |
| Recommendation clicks become feedback loops | High | Aggregate telemetry only |
| Search contamination | High | Search prohibited as consumer |
| Reader interruption | High | Reader prohibited as consumer |

## Architecture Authority Decision

Discovery may host multiple recommendation-producing systems only through explicit namespaces and module authorities.

AI Librarian outputs, Author Recommendation Engine outputs, and future MatchMaker outputs are separate products of separate authorities.

No Discovery implementation may treat AI-generated author cards as Author Recommendation Engine outputs.
