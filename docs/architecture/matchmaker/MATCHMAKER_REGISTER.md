---
id: BT-DOCS-ARCHITECTURE-MATCHMAKER-MATCHMAKER-REGISTER
title: "MatchMaker Register"
status: active
authority_level: architecture
owner: matchmaker
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
canon_candidate: true
---

# MatchMaker Register

Status: ARCHITECTURE_AUTHORITY
Owner: MatchMaker
Request: BT-MATCHMAKER-REGISTER-001
Created: June 2026

## Architecture Authority Decision

This document is the master architecture register for MatchMaker. It is the first document future engineers, architects, auditors, and AI systems must read before changing MatchMaker.

This register does not redefine MatchMaker architecture. It indexes, governs, orders, and maps the authority documents that define MatchMaker.

The historical decision log remains `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md`. This master register is the operational authority entry point.

## MatchMaker Definition

MatchMaker is BookTown's Literary Intelligence Layer.

It sits between the Literary Knowledge Graph and the Literary Identity Graph. It consumes bounded, privacy-safe Entity Platform snapshots and produces derived, explainable literary intelligence outputs.

Recommendations are one MatchMaker output. MatchMaker also governs future discoveries, pathways, insights, challenges, reflections, intellectual journeys, and literary identity evolution.

## What MatchMaker Is Not

MatchMaker is not:

- Search
- an LLM
- a vector database
- a knowledge graph
- an identity graph
- an authority system
- a persistence layer
- a telemetry collector
- an affinity generator
- a canonical truth owner

MatchMaker does not own canonical literary truth, user truth, graph truth, search truth, or affinity truth.

## Mission

MatchMaker's mission is to align literary knowledge with reader and writer identity in a privacy-safe, explainable, deterministic, and authority-preserving way.

It should help users:

- recognize literary resonance
- discover adjacent literary territory
- understand why an entity matters
- navigate literary pathways
- encounter productive challenge
- reflect on literary identity

## System Position

MatchMaker is downstream of authority systems and upstream of derived intelligence outputs.

It consumes:

- `LiteraryEntityRef`
- `EntitySummary`
- `GraphEntityReference`
- `UserEntityInteraction`
- `EntityAffinity`
- `MatchMakerInput`

It produces:

- `MatchMakerRecommendation`
- future `MatchMakerDiscovery`
- future `MatchMakerPathway`
- future `MatchMakerInsight`
- future `MatchMakerChallenge`
- future `MatchMakerReflection`

It must not mutate the systems it consumes.

## Core Responsibilities

MatchMaker is responsible for:

- consuming bounded MatchMaker input snapshots
- preserving privacy and provenance
- generating derived intelligence outputs
- keeping outputs explainable
- assigning confidence
- exposing constraints
- respecting Entity Platform authority
- preserving graph and identity boundaries
- remaining deterministic in V1

## Non-Responsibilities

MatchMaker is not responsible for:

- entity resolution
- canonical entity identity
- canonical graph relationship truth
- canonical user identity
- affinity generation
- search retrieval
- reader telemetry
- Firestore persistence
- API routing
- UI rendering
- LLM reasoning
- vector retrieval

## Architecture Hierarchy

The MatchMaker architecture hierarchy is:

1. MatchMaker Profile: purpose, philosophy, scope, and trust model.
2. Output Model: authoritative output contract semantics.
3. Candidate Universe: which entities may participate.
4. Candidate Generation: how candidates enter the engine.
5. Scoring Model: how candidates are evaluated and ranked.
6. Confidence Model: how evidence trust is generated and communicated.
7. Explanation Model: how outputs explain themselves.
8. V1 Engine: implementation boundary and pipeline for Work recommendations.
9. Architecture Register Log: historical proposals, questions, and ADR-style records.

## Authority Hierarchy

Authority order:

1. Entity Platform contracts define entity identity and supported entity types.
2. MatchMaker output contracts define output shape.
3. This register defines navigation, ownership, and governance order.
4. MatchMaker authority documents define behavior and boundaries by concern.
5. Implementation must conform to all authority documents.
6. Tests verify implementation conformance.

When documents appear to conflict:

1. Contracts win for type shape.
2. This register wins for ownership and navigation.
3. The concern-specific authority document wins for its concern.
4. `MATCHMAKER_PROFILE.md` wins for mission, purpose, and permanent boundaries.
5. Historical register entries are context unless promoted into an authority document.

## Dependency Hierarchy

MatchMaker depends on authority snapshots and never on raw subsystem storage.

Dependency direction is one-way:

Authority systems -> MatchMaker -> Derived outputs

No MatchMaker output may feed back into authority systems without a separate audited contract.

## Implementation Hierarchy

Implementation must follow this sequence:

1. Contracts and architecture authority.
2. Pure V1 engine module.
3. Candidate generation tests.
4. Scoring and confidence tests.
5. Explanation and output assembly tests.
6. Privacy and boundary tests.
7. Only then, separately approved integration surfaces.

V1 implementation must remain pure, deterministic, snapshot-only, Work-only, and side-effect-free.

## Governance Rules

1. Read this register before touching MatchMaker.
2. Do not implement behavior that is not authorized by a MatchMaker authority document.
3. Do not create temporary DTOs that bypass output contracts.
4. Do not add retrieval, persistence, APIs, UI, or subsystem writes to the pure engine.
5. Do not use raw private events, raw search text, raw reading history, or raw subsystem records.
6. Do not use embeddings, vectors, or LLM reasoning in V1.
7. Do not treat graph context as affinity.
8. Do not treat confidence as predicted enjoyment.
9. Do not treat recommendations as canonical truth.
10. Any change to weights, caps, candidate eligibility, output semantics, or confidence bands requires an architecture update and versioned tests.

## Roadmap

The official capability roadmap is:

1. V1 Work Recommendations
2. V2 Discoveries
3. V3 Pathways
4. V4 Insights
5. V5 Challenges
6. V6 Reflections
7. V7 Theme Intelligence
8. V8 Concept Intelligence

Each stage requires authority maturity, contract compatibility, privacy review, and tests before implementation.

## Permanent Boundaries

These boundaries are permanent unless explicitly changed by a top-level architecture authority revision:

- MatchMaker is not Search.
- MatchMaker is not an LLM.
- MatchMaker is not a Vector Database.
- MatchMaker is not a Knowledge Graph.
- MatchMaker is not an Identity Graph.
- MatchMaker is not an Authority System.
- MatchMaker does not own canonical truth.
- MatchMaker does not mutate literary truth.
- MatchMaker does not mutate user truth.
- MatchMaker does not mutate graph truth.
- MatchMaker does not mutate affinity truth.
- MatchMaker does not persist raw inputs in V1.
- MatchMaker does not retrieve missing data in V1.

## Future Expansion

Future expansion must proceed through authority updates before code.

Required before future broadening:

- entity eligibility update in Candidate Universe
- source and expansion update in Candidate Generation
- score and confidence update if ranking semantics change
- explanation update if disclosure semantics change
- output contract update if shape changes
- implementation tests proving boundary preservation

## Document Authority Matrix

| Document | Purpose | Authority Level | Owner |
|---|---|---|---|
| `MATCHMAKER_REGISTER.md` | Master authority index, governance map, dependency map, implementation map. | Master register | MatchMaker |
| `MATCHMAKER_PROFILE.md` | Mission, philosophy, system identity, trust model, permanent boundaries. | Primary conceptual authority | MatchMaker |
| `MATCHMAKER_OUTPUT_MODEL.md` | Output philosophy, output hierarchy, evidence, explanation, confidence, privacy. | Output authority | MatchMaker |
| `MATCHMAKER_V1_ENGINE.md` | V1 pure engine pipeline and implementation boundary. | V1 engine authority | MatchMaker |
| `MATCHMAKER_CANDIDATE_UNIVERSE.md` | Entity participation and target eligibility. | Candidate universe authority | MatchMaker |
| `MATCHMAKER_CANDIDATE_GENERATION.md` | Candidate acquisition, expansion, filtering, cold-start, sparse snapshots. | Candidate generation authority | MatchMaker |
| `MATCHMAKER_SCORING_MODEL.md` | Scoring inputs, weights, penalties, ranking, tie-breaking. | Scoring authority | MatchMaker |
| `MATCHMAKER_EXPLANATION_MODEL.md` | Evidence disclosure, explanation templates, privacy, trust. | Explanation authority | MatchMaker |
| `MATCHMAKER_CONFIDENCE_MODEL.md` | Evidence trust, confidence bands, caps, communication, governance. | Confidence authority | MatchMaker |
| `MATCHMAKER-ARCHITECTURE-REGISTER.md` | Historical proposals, questions, ADR-style architecture records. | Historical register | MatchMaker |
| `contracts/entityPlatform/matchmaker.ts` | MatchMaker input and affinity compatibility contracts. | Contract authority | Entity Platform / MatchMaker |
| `contracts/entityPlatform/matchmakerOutputs.ts` | MatchMaker output contracts. | Contract authority | Entity Platform / MatchMaker |

## Dependency Matrix

| Subsystem | Consumes | Provides | Direction |
|---|---|---|---|
| Entity Platform | Authority sources | `LiteraryEntityRef`, `EntitySummary`, entity type vocabulary | Entity Platform -> MatchMaker |
| Literary Knowledge Graph | Entity refs and relationship authority | `GraphEntityReference`, `EntityRelationship` summaries | Graph -> MatchMaker |
| Literary Identity Graph | User-entity interactions | `UserEntityInteraction` summaries | Identity Graph -> MatchMaker |
| Affinity Layer | Identity and interaction summaries | `EntityAffinity` summaries | Affinity Layer -> MatchMaker |
| Search | Search authority and resolved results | Privacy-safe discovery context only | Search -> MatchMaker |
| Reader | Reader authority and events | Privacy-safe interaction summaries only | Reader -> Identity Graph -> MatchMaker |
| MatchMaker | `MatchMakerInput` | Derived intelligence outputs | MatchMaker -> Product surfaces |
| Product UI | MatchMaker outputs | Rendering only | MatchMaker -> UI |
| Firestore | Persistence for authority systems | No direct V1 MatchMaker dependency | Authority systems -> snapshots -> MatchMaker |

## Implementation Sequence Matrix

| Stage | Subsystem | Status |
|---|---|---|
| 1 | Entity Platform contracts | Complete |
| 2 | MatchMaker input snapshot compatibility | Complete |
| 3 | MatchMaker output contracts | Complete |
| 4 | Candidate Universe authority | Complete |
| 5 | Candidate Generation authority | Complete |
| 6 | Scoring Model authority | Complete |
| 7 | Explanation Model authority | Complete |
| 8 | Confidence Model authority | Complete |
| 9 | Master Register authority | This document |
| 10 | Pure V1 engine implementation | Next approved implementation phase |
| 11 | Engine tests | Pending implementation |
| 12 | Product/API integration | Out of V1 pure-engine scope |

## Roadmap Matrix

| Version | Capability | Status |
|---|---|---|
| V1 | Work Recommendations | Architected; implementation next |
| V2 | Discoveries | Future authority and implementation |
| V3 | Pathways | Future authority and implementation |
| V4 | Insights | Future authority and implementation |
| V5 | Challenges | Future authority and implementation |
| V6 | Reflections | Future authority and implementation |
| V7 | Theme Intelligence | Blocked by canonical theme authority |
| V8 | Concept Intelligence | Blocked by canonical concept authority |

## Final Answers

The canonical MatchMaker architecture hierarchy is Profile, Output Model, Candidate Universe, Candidate Generation, Scoring Model, Confidence Model, Explanation Model, V1 Engine, and historical Architecture Register.

The documents that govern MatchMaker are registered in the Document Authority Matrix above.

The implementation sequence is authority documents first, then pure V1 Work recommendation engine, then tests, then separately approved integration.

The permanent boundaries are that MatchMaker is not Search, an LLM, a Vector Database, a Knowledge Graph, an Identity Graph, or an Authority System, and it does not own or mutate canonical literary or user truth.

The official roadmap is V1 Work Recommendations, V2 Discoveries, V3 Pathways, V4 Insights, V5 Challenges, V6 Reflections, V7 Theme Intelligence, and V8 Concept Intelligence.

MatchMaker architecture is fully registered after this document.
