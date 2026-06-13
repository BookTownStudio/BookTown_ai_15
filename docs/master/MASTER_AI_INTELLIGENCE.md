---
id: BT-MASTER-AI-INTELLIGENCE-001
title: "BookTown AI and Intelligence Master Document"
status: active
authority_level: master
owner: intelligence-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown AI and Intelligence Master Document

## Purpose

This document is the Master Layer entry point for AI Librarian, Discover Agent, MatchMaker, Author Recommendations, Identity Graph, Affinity, and intelligence boundaries. It summarizes authority and routes to lower-level sources without replacing intelligence architecture registers or runtime authority.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- AI Librarian and AI assistance.
- Discover Agent.
- MatchMaker.
- Author Recommendations.
- Literary Identity Graph.
- Affinity Layer.
- Intelligence aggregates and signal queues.
- AI governance routing and non-authoritative output boundaries.

Out of scope:

- New AI behavior.
- New model/provider policy.
- New recommendation scoring rules.
- New agent product commitments.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/ai.ts`
- `functions/src/ai/*`
- `functions/src/intelligence/*`
- `functions/src/home/matchmakerHomeIntegration.ts`
- `functions/src/matchmaker/*`
- `lib/domain/matchmaker/*`
- `lib/domain/identityGraph/*`
- `lib/domain/affinity/*`
- `lib/domain/authorRecommendations/*`
- `lib/authorRecommendations/*`
- `contracts/entityPlatform/matchmaker*`

Backend runtime owns AI calls, context construction, agent sessions, signal processing, aggregate generation, and server-owned recommendation outputs. Client surfaces consume results, render explanations, and collect user intent.

## Documentation Authority

Primary authority documents:

- [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md)
- [MATCHMAKER-ARCHITECTURE-REGISTER.md](../architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md)
- [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md)
- [LITERARY_IDENTITY_GRAPH.md](../architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md)
- [MATCHMAKER_ENTITY_LAYER.md](../architecture/entity-platform/MATCHMAKER_ENTITY_LAYER.md)
- [LITERARY_INTELLIGENCE_VISION.md](../vision/LITERARY_INTELLIGENCE_VISION.md)

Operational evidence:

- [IntelligenceAggregatesRecoveryRunbook.md](../operations/projections/IntelligenceAggregatesRecoveryRunbook.md)
- [IntelligenceSignalQueueRecoveryRunbook.md](../operations/projections/IntelligenceSignalQueueRecoveryRunbook.md)

Audit evidence:

- [closed_beta_readiness_audit.md](../audits/evidence/audit/closed_beta_readiness_audit.md)

## System Architecture

AI and Intelligence is a derived-intelligence layer. It consumes governed literary, user, graph, and affinity signals to produce assistance, recommendations, explanations, pathways, and contextual discovery. It does not create canonical literary truth.

The architecture separates:

- Source authority from derived intelligence.
- AI assistance from product truth.
- MatchMaker outputs from entity authority.
- Author recommendation outputs from author identity.
- Identity Graph signals from user profile authority.
- Affinity signals from canonical catalog and interaction facts.

## Core Components

| Component | Role |
|---|---|
| AI Librarian | Conversational assistance and literary help. |
| Discover Agent | Intent-aware discovery assistance. |
| MatchMaker | Derived literary fit and explanation engine. |
| Author Recommendations | Author recommendation candidate, scoring, and explanation subsystem. |
| Identity Graph | Derived user interaction signal over literary entities. |
| Affinity Layer | Derived closeness among users, authors, works, entities, and themes. |
| Intelligence aggregates | Operational/read-model summaries for intelligence surfaces. |
| Signal queue | Controlled queue for intelligence signal processing. |

## Data Authority

| Data | Authority |
|---|---|
| Canonical literary entities | Entity Platform and Catalog, not AI. |
| User interactions | Owning product systems and Identity Graph adapters. |
| MatchMaker outputs | MatchMaker runtime, derived only. |
| Author recommendation outputs | Author recommendation runtime, derived only. |
| AI responses | AI runtime output, non-authoritative unless routed to approved authority. |
| Affinity scores/signals | Affinity runtime, derived only. |
| Intelligence aggregates | Projection / Recovery and intelligence runtime. |

## User-Facing Surfaces

- AI Librarian surfaces.
- Discovery agent surfaces.
- Home/discovery recommendation modules.
- Recommended authors module.
- MatchMaker-supported discovery pathways.
- Future intelligence explanation surfaces.

## Operational Dependencies

- Entity Platform.
- Catalog and author authority.
- Reader, shelves, reviews, quotes, and social interaction signals.
- Discovery/Home surfaces.
- Projection / Recovery.
- Observability.
- Governance and AI consumption rules.

## Projection Dependencies

AI and Intelligence depend on:

- `intelligence_aggregates`
- `intelligence_signal_queue`
- `user_stats_domain`
- `reader_insights_dto`
- `search_feed`
- `catalog_identity_projection`
- `runtime_health`

## Governance Rules

- AI output is not source of truth.
- Derived intelligence must not overwrite canonical catalog, entity, author, quote, or user authority.
- Explanations must remain bounded and honest about uncertainty.
- MatchMaker and recommendations consume authority; they do not create it.
- Audit evidence cannot promote AI behavior without authority update.
- AI consumption must route through Master, Canon, Vision, and Governance rules before architecture claims.

## Current Maturity

Product maturity: Functional.

Architecture maturity: Governed for MatchMaker and Author Recommendations; emerging for full AI platform.

Documentation maturity: Good after this Master document, with authority still distributed.

Intelligence maturity: Partial to Operational by subsystem.

Readiness: Internal Ready.

## Known Gaps

- Unified AI safety and agent authority document is still needed.
- AI Librarian governance remains runtime-heavy.
- Identity Graph and Affinity need stronger lifecycle authority.
- Product exposure for intelligence systems remains bounded and evolving.
- Canon-safe intelligence doctrine should eventually be distilled from Vision and registers.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md)
- [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md)
- [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md)
- [LITERARY_INTELLIGENCE_VISION.md](../vision/LITERARY_INTELLIGENCE_VISION.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| AI Librarian | AI/Agents | AI domain and AI modules | Runtime, beta audit, governance references. |
| Discover Agent | Intelligence Platform | Discover agent callable and discovery surfaces | Discovery/Home and AI docs. |
| MatchMaker | MatchMaker | MatchMaker runtime and contracts | MatchMaker registers and model docs. |
| Author Recommendations | Author Intelligence | Author recommendation engine | Author recommendation authority docs. |
| Identity Graph | Identity Graph | User interaction adapters/contracts | Entity Platform identity docs. |
| Affinity Layer | Affinity Platform | Affinity adapters and snapshots | Author recommendation and MatchMaker docs. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Entity Platform | Upstream | Intelligence consumes entity refs and summaries. |
| Catalog / Library | Upstream | Recommendations require governed works/authors. |
| Reader/Shelves/Social/Quotes/Reviews | Upstream | User signals come from product systems. |
| Discovery/Home | Downstream | Intelligence is surfaced through discovery modules. |
| Observability | Downstream | Intelligence quality and health require metrics. |

## Authority Routing

| Question | Route |
|---|---|
| What is Literary Intelligence? | [LITERARY_INTELLIGENCE_VISION.md](../vision/LITERARY_INTELLIGENCE_VISION.md), then this document. |
| How does MatchMaker work? | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md). |
| How do author recommendations work? | [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md). |
| What is AI output authority? | This document and [AI_CONSUMPTION_POLICY.md](../governance/AI_CONSUMPTION_POLICY.md). |
| How are intelligence projections recovered? | Intelligence runbooks and [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md). |

## Future Evolution

Future AI and intelligence changes should be captured in dedicated agent, intelligence, MatchMaker, affinity, or identity authority documents and then reflected here as routing updates. This Master document must not introduce new AI behavior directly.
