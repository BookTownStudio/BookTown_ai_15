---
id: BT-MASTER-DISCOVERY-HOME-001
title: "BookTown Discovery and Home Master Document"
status: active
authority_level: master
owner: discovery-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Discovery and Home Master Document

## Purpose

This document is the Master Layer entry point for Discovery, Home, editorial surfaces, discovery intelligence, and recommendation consumers. It summarizes authority and routes to lower-level sources without replacing discovery architecture documents or product specifications.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Home surface.
- Discovery surfaces.
- Editorial governance.
- Discovery modules.
- Continuity starter behavior.
- Recommendation consumers.
- Discovery intelligence integration.

Out of scope:

- New discovery ranking rules.
- New editorial policy.
- New home modules.
- New recommendation behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/home.ts`
- `functions/src/home/*`
- `functions/src/library/discovery/*`
- `app/tabs/home.tsx`
- `app/tabs/discover.tsx`
- `app/discovery/*`
- `components/discovery/*`
- `lib/hooks/useDiscovery*`
- `lib/hooks/useHomeDiscoveryConsole.ts`

Backend runtime owns home console data, editorial selection, continuity selection, discovery feed/domain responses, and governed recommendation integration. Client runtime owns presentation, local navigation, and interaction state.

## Documentation Authority

Primary authority documents:

- [DISCOVERY_HOME_REGISTER.md](../architecture/discovery/DISCOVERY_HOME_REGISTER.md)
- [DISCOVERY_MODULE_AUTHORITY.md](../architecture/discovery/DISCOVERY_MODULE_AUTHORITY.md)
- [DISCOVERY_CONSUMER_GOVERNANCE.md](../architecture/discovery/DISCOVERY_CONSUMER_GOVERNANCE.md)
- [DISCOVERY_RECOMMENDATION_BOUNDARIES.md](../architecture/discovery/DISCOVERY_RECOMMENDATION_BOUNDARIES.md)
- [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md)
- [EXPERIENCE_VISION.md](../vision/EXPERIENCE_VISION.md)

Related authority:

- [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md)
- [MASTER_SEARCH.md](MASTER_SEARCH.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)

## System Architecture

Discovery and Home are product surfaces that compose catalog authority, search, editorial judgment, reader continuity, social/discovery signals, and derived intelligence into navigable entry points.

The architecture separates:

- Editorially governed modules.
- Derived recommendation consumers.
- Search/discovery query paths.
- Home continuity entry points.
- Discovery flows and semantic collections.
- Client navigation and presentation.

## Core Components

| Component | Role |
|---|---|
| Home tab | Primary return surface and continuity entry. |
| Discovery tab | Exploratory discovery surface. |
| Home discovery console | Governed editorial/admin configuration surface. |
| Discovery modules | Bounded product modules for discovery content. |
| Continuity starter | Reader/library-aware return-to-reading support. |
| Recommended authors module | Author recommendation consumer. |
| Discovery flows | Guided discovery surfaces. |
| Semantic collection | Meaning-oriented discovery surface. |

## Data Authority

| Data | Authority |
|---|---|
| Catalog entities | Catalog / Library and Entity Platform. |
| Search results | Search. |
| Recommendations | AI / Intelligence or Author Recommendations. |
| Editorial slots | Home/discovery backend authority. |
| Reader continuity | Reader and Library systems. |
| Social signals | Social / Messaging authority. |
| Client filters/navigation | Client surface only. |

## User-Facing Surfaces

- Home tab.
- Discover tab.
- Discovery flow.
- Semantic collection page.
- Recommended authors modules.
- Home continuity modules.
- Search-to-discovery surfaces.
- Book, author, and quote discovery entry points.

## Operational Dependencies

- Catalog and entity authority.
- Search.
- AI / Intelligence.
- Reader continuity.
- Admin/editorial governance.
- Projection / Recovery.
- Observability.

## Projection Dependencies

Discovery and Home depend on:

- `search_feed`
- `search_bookmarks`
- `search_notifications`
- `catalog_identity_projection`
- `reader_authority_projection`
- `intelligence_aggregates`
- `intelligence_signal_queue`
- `user_stats_domain`

## Governance Rules

- Discovery outputs are derived or editorial; they are not canonical literary truth.
- Recommendation consumers must not mutate intelligence or catalog authority.
- Editorial modules must remain distinguishable from derived intelligence.
- Audit evidence cannot define discovery behavior without promotion.
- Search, Catalog, Reader, and Intelligence authority must remain separable.

## Current Maturity

Product maturity: Functional.

Architecture maturity: Governed.

Documentation maturity: Good.

Readiness: Closed Beta Ready.

## Known Gaps

- Home/discovery product boundaries need continued consolidation as modules expand.
- Editorial governance should be strengthened before broad public operation.
- Recommendation consumer behavior remains dependent on AI / Intelligence maturity.
- Discovery/Home now has a lower-level register; editorial policy still needs strengthening before broad public operation.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md)
- [MASTER_SEARCH.md](MASTER_SEARCH.md)
- [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md)
- [DISCOVERY_MODULE_AUTHORITY.md](../architecture/discovery/DISCOVERY_MODULE_AUTHORITY.md)
- [DISCOVERY_HOME_REGISTER.md](../architecture/discovery/DISCOVERY_HOME_REGISTER.md)
- [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Home | Discovery Platform | Home domain and home modules | Home preservation and discovery governance docs. |
| Discovery | Discovery Platform | Discovery routes and discovery surfaces | Discovery module and consumer governance docs. |
| Editorial modules | Discovery Platform; Control Plane | Home console runtime | Home discovery console docs. |
| Recommendation consumers | Discovery Platform; Intelligence Platform | Discovery modules consuming recommendations | Discovery boundaries and AI / Intelligence master. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Catalog / Library | Upstream | Discovery displays governed books and authors. |
| Search | Upstream | Search supports retrieval and navigation. |
| AI / Intelligence | Upstream | Recommendations and MatchMaker can feed discovery. |
| Reader | Upstream | Continuity depends on reader/library state. |
| Admin / Operations | Downstream | Editorial governance depends on control surfaces. |

## Authority Routing

| Question | Route |
|---|---|
| Home/discovery module authority | [DISCOVERY_HOME_REGISTER.md](../architecture/discovery/DISCOVERY_HOME_REGISTER.md), discovery architecture docs, then this document. |
| Editorial console behavior | [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md). |
| Recommendation consumer boundaries | [DISCOVERY_RECOMMENDATION_BOUNDARIES.md](../architecture/discovery/DISCOVERY_RECOMMENDATION_BOUNDARIES.md), then [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md). |
| Search-driven discovery | [MASTER_SEARCH.md](MASTER_SEARCH.md). |
| Product journey questions | [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md). |

## Future Evolution

Future Discovery and Home changes should be recorded in discovery authority documents and reflected here as routing updates. This Master document must not introduce new discovery modules, ranking behavior, or editorial policy directly.
