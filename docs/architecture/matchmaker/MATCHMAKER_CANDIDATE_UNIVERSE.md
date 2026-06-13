---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-CANDIDATE-UNIVERSE
title: "MatchMaker Candidate Universe"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MatchMaker Candidate Universe

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-CANDIDATE-UNIVERSE-001
Created: June 2026

Related Authority:
- `docs/architecture/matchmaker/MATCHMAKER_PROFILE.md`
- `docs/architecture/matchmaker/MATCHMAKER_OUTPUT_MODEL.md`
- `docs/architecture/matchmaker/MATCHMAKER_V1_ENGINE.md`
- `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`
- `docs/architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md`
- `docs/architecture/entity-platform/ENTITY_GRAPH.md`
- `docs/architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md`
- `docs/architecture/entity-platform/MATCHMAKER_ENTITY_LAYER.md`
- `contracts/entityPlatform/entityRef.ts`
- `contracts/entityPlatform/entitySummary.ts`
- `contracts/entityPlatform/graphEntity.ts`
- `contracts/entityPlatform/userInteraction.ts`
- `contracts/entityPlatform/matchmaker.ts`
- `contracts/entityPlatform/matchmakerOutputs.ts`

## Authority Decision

The canonical MatchMaker Candidate Universe is the closed `LiteraryEntityType` vocabulary:

- Work
- Edition
- Author
- Quote
- Publication
- Theme
- Concept
- Movement
- Period
- Place

MatchMaker may reason only over entities represented by `LiteraryEntityRef`. It may consume `EntitySummary`, `GraphEntityReference`, `UserEntityInteraction`, `EntityAffinity`, `MatchMakerInput`, and `MatchMaker output` contracts, but it may not reinterpret display labels, aliases, provider IDs, search terms, shelves, users, venues, raw events, or recommendation history as canonical candidate entities.

Semantic categories that appear elsewhere in BookTown, including tradition, philosophy, civilization, form, subform, language, genre, shelf, venue, and user, are not MatchMaker candidate entities until added to the Entity Platform type contract. They may influence context only through privacy-safe summaries, graph evidence, or canonical entity relationships.

## Universe Principles

1. Recommendation eligibility is narrower than reasoning eligibility.
2. Discovery eligibility is broader than V1 recommendation eligibility but still requires canonical entity authority.
3. Pathway participation requires graph-eligible entity references and bounded traversal.
4. Evidence participation does not imply recommendation eligibility.
5. Affinity belongs to the Literary Identity Graph. MatchMaker consumes affinity; it does not generate affinity truth.
6. Graph proximity is context, not user preference.
7. Display strings, aliases, inferred labels, and provider IDs are never candidate identity.
8. V1 is Work-only for recommendation output.

## Recommendation Universe

V1 recommendation target:

- Work only.

Future recommendation target candidates:

- Author after author graph/search maturity and recommendation governance.
- Quote after quote attribution, graph participation, and quote navigation maturity.
- Publication after publication-to-work/author authority and reading surface governance.
- Movement and Period after bounded traversal and product navigation maturity.

Not recommendation targets until further authority:

- Edition: availability and manifestation context only unless a future edition-specific recommendation product is approved.
- Theme and Concept: blocked until canonical authority, semantic scope, and hallucination controls mature.
- Place: context and pathway node only until literary place authority is mature.

## Discovery Universe

Discovery may eventually target all canonical literary entities, but each entity type requires stronger authority than explanation-only use.

V1 discovery is limited to Work-adjacent context already present in `MatchMakerInput`; it must not perform independent discovery generation.

V2 discovery candidates:

- Work
- Author
- Quote
- Publication
- Movement
- Period

V3 discovery candidates:

- Theme
- Concept

Future discovery candidates:

- Place
- any newly contracted entity type after Entity Platform expansion

## Pathway Universe

Pathway nodes are broader than recommendation targets. A node may explain a route without becoming the final recommendation target.

V1 pathway participation:

- User context to Work.
- Work to Work when relationship evidence is already present.
- Quote to Work as context only when quote evidence is already present.

Future pathway participation:

- Work -> Author -> Work
- Work -> Movement -> Work
- Work -> Period -> Work
- Quote -> Work -> Author
- Publication -> Work or Author
- Theme or Concept bridges after canonical authority exists
- Place bridges after place graph maturity exists

Pathways must remain derived explanations. They may not create canonical graph edges.

## Evidence Universe

Any canonical entity may serve as evidence if it appears through a privacy-safe input contract and preserves provenance.

Evidence sources are governed by `MatchMakerEvidenceSource`:

- `affinity`
- `interaction`
- `graph`
- `entity`
- `profile_context`
- `availability`
- `discovery_context`

Evidence-source eligibility does not grant recommendation-target eligibility. For example, an Author may explain a Work recommendation in V1, but the Author may not be recommended in V1.

## Affinity Universe

Affinity targets must be canonical or governed literary entities with privacy-safe identity evidence.

V1 affinity may be consumed for:

- Work
- Edition as availability or manifestation context
- Author only when represented by canonical Author ref
- Quote only when represented by canonical Quote ref
- Publication only when represented by canonical Publication ref

No V1 direct affinity:

- Theme
- Concept
- Movement
- Period
- Place

These entities may influence affinity indirectly through graph-near or context evidence only. Direct affinity for them requires Identity Graph authority, canonical interaction semantics, and product surface governance.

## Graph Participation Universe

Graph participation requires `GraphEntityReference` eligibility:

- canonical or resolved entity ref
- supported entity type
- provenance sufficient for graph use
- not unresolved
- not archived unless explicitly included as archival context

Graph nodes in the target universe:

- Work
- Edition
- Author
- Quote
- Publication
- Theme
- Concept
- Movement
- Period
- Place

Graph participation does not imply recommendation eligibility. Graph edges are relationship authority, not preference authority.

## Identity Participation Universe

The Literary Identity Graph models User -> Entity relationships. User is not a `LiteraryEntityRef` and is not a MatchMaker candidate entity.

Identity nodes may eventually include:

- Work
- Edition
- Author
- Quote
- Publication
- Theme
- Concept
- Movement
- Period
- Place

V1 consumes identity only through `UserEntityInteraction` summaries and `EntityAffinity` summaries. It does not read raw identity events or write identity truth.

## Explanation Universe

Entities may appear in explanations when they are canonical, privacy-safe, and traceable to evidence.

V1 explanation-eligible entities:

- Work
- Edition for availability context
- Author for Work context
- Quote for evidence context
- Publication for source context
- Movement for Work context when graph evidence exists
- Period for Work context when graph evidence exists
- Place for limited context when graph evidence exists

Theme and Concept are not V1 explanation targets unless canonical authority and evidence are present. They must not be inferred from raw text or model output.

## Future Literary Intelligence Universe

Future MatchMaker intelligence may include:

- recommendations
- discoveries
- pathways
- insights
- challenges
- reflections
- intellectual journeys
- literary identity evolution
- reading and writing pathway support

These capabilities must use the same candidate universe authority. A future output type may broaden what MatchMaker surfaces, but it may not broaden entity eligibility without an Entity Platform authority update.

## Entity Participation Matrix

| Entity | Recommendation Target | Discovery Target | Pathway Node | Evidence Source | Affinity Target | Graph Node | Identity Node | Status |
|---|---|---|---|---|---|---|---|---|
| Work | V1 yes | V1 limited, V2 yes | V1 yes | Yes | V1 yes | Yes | Yes | Active V1 core |
| Edition | No V1 | Future limited | Future limited | Yes | Limited context | Yes | Yes | Availability and manifestation context |
| Author | No V1, V2 candidate | V2 candidate | V2 candidate | V1 context | Canonical only | Yes | Yes | Requires author graph/search maturity |
| Quote | No V1, V2 candidate | V2 candidate | V2 candidate | V1 context | Canonical only | Yes | Yes | Requires quote attribution and graph maturity |
| Publication | No V1, V2 candidate | V2 candidate | V2 candidate | Limited | Limited | Yes | Yes | Requires publication authority bridge maturity |
| Theme | No V1 | V3 candidate | V3 candidate | Future | No V1 | Future | Future | Blocked by canonical theme authority |
| Concept | No V1 | V3 candidate | V3 candidate | Future | No V1 | Future | Future | Blocked by canonical concept authority |
| Movement | No V1, future candidate | V2 candidate | V2 candidate | V1 context | No V1 | Yes | Future | Context now, discovery later |
| Period | No V1, future candidate | V2 candidate | V2 candidate | V1 context | No V1 | Yes | Future | Context now, discovery later |
| Place | No V1 | Future candidate | Future candidate | Limited context | No V1 | Partial/future | Future | Blocked by place graph maturity |

## Version Participation Matrix

| Entity | V1 | V2 | V3 | Future | Blocked By |
|---|---|---|---|---|---|
| Work | Recommend, explain, limited pathway | Broader discovery | Pathway expansion | Adaptive intelligence | None for V1 |
| Edition | Availability context | Edition-aware availability | Edition pathway context | Edition-specific recommendations if approved | Product and manifestation governance |
| Author | Explain/context only | Discover, pathway, possible recommend | Deeper author intelligence | Author journeys | Author graph/search maturity |
| Quote | Explain/context only | Discover and pathway | Quote-to-theme/concept pathways | Quote intelligence | Attribution and graph maturity |
| Publication | Limited context | Discover/pathway candidate | Publication intelligence | Writer/reader pathway bridge | Publication authority bridge |
| Theme | Excluded | Excluded except governed context | Discover/pathway/insight candidate | Theme intelligence | Canonical theme authority |
| Concept | Excluded | Excluded except governed context | Discover/pathway/insight candidate | Concept intelligence | Canonical concept authority |
| Movement | Context only | Discovery/pathway candidate | Recommendation candidate if approved | Movement journeys | Navigation and graph maturity |
| Period | Context only | Discovery/pathway candidate | Recommendation candidate if approved | Period journeys | Navigation and graph maturity |
| Place | Limited context | Limited context | Pathway candidate if graph mature | Place-aware intelligence | Place authority and graph maturity |

## MatchMaker Capability Matrix

| Entity | Recommend | Discover | Explain | Compare | Traverse | Generate Insight | Generate Reflection |
|---|---|---|---|---|---|---|---|
| Work | V1 | V1 limited | V1 | V1 limited | V1 limited | V2 | V2 |
| Edition | Future only | Future limited | V1 availability | Future | Future | Future | Future |
| Author | V2 candidate | V2 candidate | V1 context | V2 | V2 | V2 | V2 |
| Quote | V2 candidate | V2 candidate | V1 context | V2 | V2 | V3 | V3 |
| Publication | V2 candidate | V2 candidate | Limited | Future | V2 | Future | Future |
| Theme | V3+ only | V3 candidate | Future | V3 | V3 | V3 | V3 |
| Concept | V3+ only | V3 candidate | Future | V3 | V3 | V3 | V3 |
| Movement | Future | V2 candidate | V1 context | V2 | V2 | V3 | V3 |
| Period | Future | V2 candidate | V1 context | V2 | V2 | V3 | V3 |
| Place | Future | Future | Limited | Future | Future | Future | Future |

## Affinity Eligibility Matrix

| Entity | Can Generate Affinity | Can Receive Affinity | Can Influence Affinity | Notes |
|---|---|---|---|---|
| Work | Yes | Yes | Yes | V1 primary affinity target. |
| Edition | Limited | Limited | Yes | Treat as manifestation/availability context unless edition-level product is approved. |
| Author | Canonical only | Canonical only | Yes | No display-string author affinity. |
| Quote | Canonical only | Canonical only | Yes | Quote affinity requires attribution confidence. |
| Publication | Limited | Limited | Yes | Requires clear publication-to-author/work authority. |
| Theme | No V1 | Future | Indirect only | Requires canonical theme authority. |
| Concept | No V1 | Future | Indirect only | Requires canonical concept authority. |
| Movement | No V1 | Future | Yes | May influence context through graph relationships. |
| Period | No V1 | Future | Yes | May influence context through graph relationships. |
| Place | No V1 | Future | Limited | Requires place authority and privacy-safe context. |

## Recommendation Participation Matrix

| Entity | Recommendation Eligibility | Earliest Version | Required Authority |
|---|---|---|---|
| Work | Eligible | V1 | Work ref, summary, evidence, constraints |
| Edition | Not eligible in V1 | Future only | Edition-specific recommendation product authority |
| Author | Candidate | V2 | Author graph/search and explanation maturity |
| Quote | Candidate | V2 | Quote attribution and graph maturity |
| Publication | Candidate | V2 | Publication authority bridge |
| Theme | Blocked | V3+ | Canonical theme authority |
| Concept | Blocked | V3+ | Canonical concept authority |
| Movement | Candidate | V3+ | Movement navigation and graph maturity |
| Period | Candidate | V3+ | Period navigation and graph maturity |
| Place | Blocked | Future | Literary place authority |

## Discovery Participation Matrix

| Entity | Discovery Eligibility | Earliest Version | Required Authority |
|---|---|---|---|
| Work | Limited | V1 | Existing Work evidence in snapshot |
| Edition | Limited | Future | Manifestation discovery governance |
| Author | Eligible | V2 | Canonical author graph/search |
| Quote | Eligible | V2 | Quote graph and attribution |
| Publication | Eligible | V2 | Publication bridge authority |
| Theme | Candidate | V3 | Canonical theme authority |
| Concept | Candidate | V3 | Canonical concept authority |
| Movement | Eligible | V2 | Movement graph/navigation |
| Period | Eligible | V2 | Period graph/navigation |
| Place | Candidate | Future | Place graph maturity |

## Pathway Participation Matrix

| Entity | Pathway Eligibility | Earliest Version | Notes |
|---|---|---|---|
| Work | Eligible | V1 | V1 supports User -> Work and limited Work -> Work evidence. |
| Edition | Limited | Future | Use as availability or manifestation step. |
| Author | Eligible | V2 | Enables Work -> Author -> Work routes. |
| Quote | Eligible | V2 | Enables Quote -> Work and Quote -> Concept future routes. |
| Publication | Eligible | V2 | Enables Publication -> Work/Author routes. |
| Theme | Candidate | V3 | Requires canonical theme authority. |
| Concept | Candidate | V3 | Requires canonical concept authority. |
| Movement | Eligible | V2 | Enables Work -> Movement -> Work routes. |
| Period | Eligible | V2 | Enables Work -> Period -> Work routes. |
| Place | Candidate | Future | Requires place graph maturity. |

## Blocked Entity Register

| Entity or Category | Block Status | Reason |
|---|---|---|
| User | Permanently excluded from `LiteraryEntityRef` | User connects through `UserEntityInteraction`, not candidate identity. |
| Shelf | Excluded | Product/user collection, not literary entity authority. |
| Venue | Excluded | Place-like product context, not canonical literary place entity unless promoted. |
| Raw search query | Excluded | Private intent data, not entity identity. |
| Raw reading history | Excluded | Private event stream, not candidate entity. |
| Recommendation output | Excluded | Derived output must not become truth input without audited path. |
| Display author name | Excluded | Display string is not canonical Author ref. |
| Genre string | Excluded | Not a canonical Entity Platform type. |
| Tradition | Context-only | Mentioned in architecture but not in current `LiteraryEntityType`. |
| Philosophy | Context-only | Mentioned in architecture but not in current `LiteraryEntityType`. |
| Civilization | Context-only | Mentioned in architecture but not in current `LiteraryEntityType`. |
| Form/subform | Context-only | Ontology metadata, not current candidate entity type. |
| Language | Context-only | Profile/display/availability context, not candidate entity type. |

## Future Expansion Register

| Expansion | Required Before Participation |
|---|---|
| Author recommendations | Canonical author graph, author search maturity, author recommendation explanation tests. |
| Quote recommendations | Quote attribution confidence, quote graph maturity, quote navigation governance. |
| Movement and Period discovery | Bounded traversal contracts and product navigation readiness. |
| Theme and Concept intelligence | Canonical authority, semantic definitions, anti-hallucination controls. |
| Place-aware pathways | Literary place authority and graph maturity. |
| Tradition/philosophy/civilization entities | Entity Platform type expansion and contract versioning. |
| Edition-specific recommendations | Edition authority and manifestation-level recommendation product decision. |
| Public aggregate MatchMaker intelligence | Anonymization, privacy review, deletion semantics, and separate output contract. |

## Final Answers

The canonical MatchMaker Candidate Universe is the closed `LiteraryEntityType` set: Work, Edition, Author, Quote, Publication, Theme, Concept, Movement, Period, and Place.

Entities that may become recommendation targets are Work in V1, then Author, Quote, Publication, Movement, and Period after authority maturity. Edition, Theme, Concept, and Place require additional product or authority work before recommendation eligibility.

Entities that may become discovery targets are all canonical literary entities, staged by version and authority readiness.

Entities that may become pathway nodes are all canonical literary entities after graph eligibility, with Work-only and limited Work-to-Work participation in V1.

Entities that may only serve as context in V1 are Edition, Author, Quote, Publication, Movement, Period, and limited Place. Theme and Concept are excluded unless canonical evidence exists.

Entities that may influence recommendations without being recommendation targets include Edition, Author, Quote, Publication, Movement, Period, Place, and future Theme/Concept context after authority approval.

Entities explicitly excluded from V1 recommendation targets are every entity except Work.

Entities explicitly excluded from MatchMaker until further authority work exists include User, Shelf, Venue, raw search query, raw reading history, recommendation output, display labels, genre strings, and any non-contracted semantic category.

This document is the official Candidate Universe authority document for future MatchMaker entity participation decisions.
