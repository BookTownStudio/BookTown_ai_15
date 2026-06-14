---
id: BT-MASTER-AUTHOR-SYSTEM-001
title: "BookTown Author System Master Document"
status: active
authority_level: master
owner: author-platform
last_audited: 2026-06-14
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Author System Master Document

## Purpose

This document is the Master Layer entry point for Authors, author identity, author details, author recommendations, and bibliography authority. It routes Author authority questions to the locked foundational Author Authority document before lower-level sources.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Author identity.
- Author details.
- Author discovery.
- Author bibliography.
- Author recommendations.
- Authored-author links.
- Author affinity and recommendation evidence.

Out of scope:

- New author canonicalization rules.
- New recommendation scoring.
- New bibliography ingestion behavior.
- New author profile product behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/library/ingestAuthor.ts`
- `functions/src/library/discoverAuthors.ts`
- `functions/src/library/authors/*`
- `functions/src/library/authorityAuthorLock.ts`
- `functions/src/admin/literaryAuthority.ts`
- `functions/src/admin/recoverCatalogDiscoveryProjections.ts`
- `lib/authors/*`
- `lib/hooks/useAuthorDetails.ts`
- `lib/hooks/useAuthorDetailsAuthority.ts`
- `app/author-details.tsx`
- `app/drawer/authors.tsx`
- `components/author/*`

Backend runtime owns author identity materialization, provider evidence handling, bibliography linkage, authored-author projections, and author discovery. Client surfaces render author details and request discovery/navigation actions.

## Documentation Authority

Primary authority documents:

- [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)
- [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md)
- [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md)
- [AUTHOR_RECOMMENDATION_CANDIDATE_UNIVERSE.md](../architecture/authors/AUTHOR_RECOMMENDATION_CANDIDATE_UNIVERSE.md)
- [AUTHOR_RECOMMENDATION_SCORING_MODEL.md](../architecture/authors/AUTHOR_RECOMMENDATION_SCORING_MODEL.md)

Operational evidence:

- [AuthoredAuthorLinkProjectionRecoveryRunbook.md](../operations/projections/AuthoredAuthorLinkProjectionRecoveryRunbook.md)
- [CatalogIdentityProjectionRecoveryRunbook.md](../operations/projections/CatalogIdentityProjectionRecoveryRunbook.md)

## System Architecture

The Author System is the author identity and author-facing discovery layer of BookTown. It connects canonical author identity, bibliography, authored works, author details, recommendations, and author affinity without allowing recommendations to redefine identity.

The architecture separates:

- Author identity authority.
- Provider evidence.
- Bibliography and authored work links.
- Author details display.
- Author recommendations.
- Author affinity signals.
- Author discovery surfaces.

## Core Components

| Component | Role |
|---|---|
| Author ingestion | Creates or updates governed author records. |
| Author identity lock | Protects canonical identity decisions. |
| Author catalog | Maintains author evidence and bibliography relationships. |
| Author details | User-facing author inspection surface. |
| Bibliography adapter | Builds display-ready authored-work views. |
| Author recommendations | Produces derived recommendation outputs. |
| Author affinity | Supports derived reader/author fit. |
| Authored author link projection | Repairs and verifies authored-work links. |

## Data Authority

| Data | Authority |
|---|---|
| Author identity | Locked Author Authority / Catalog. |
| Provider author evidence | Evidence only until accepted by authority. |
| Bibliography links | Canonical Author-to-Work relationships under locked Author Authority. |
| Author details display | Author DTO/runtime and client rendering. |
| Author recommendation outputs | Author recommendation runtime, derived only. |
| Author affinity | Affinity runtime, derived only. |
| Work identity | Catalog / Work authority. |

## User-Facing Surfaces

- Author details.
- Author drawer.
- Author cards and attachments.
- Recommended authors module.
- Discovery author recommendation surfaces.
- Book details author links.
- Search author navigation.

## Operational Dependencies

- Catalog / Library.
- Entity Platform.
- Search.
- Discovery/Home.
- AI / Intelligence.
- Projection / Recovery.
- Observability.

## Projection Dependencies

Author System depends on:

- `authored_author_link_projection`
- `catalog_identity_projection`
- `search_feed`
- `user_stats_domain`
- `intelligence_aggregates`

## Governance Rules

- Author recommendations are derived intelligence and must not redefine author identity.
- Provider evidence must not overwrite canonical author truth outside governed ingestion.
- Bibliography display must route through catalog/author authority.
- Author affinity is derived, not identity authority.
- Completion files are evidence only.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Foundational doctrine locked.

Documentation maturity: Good, with author docs distributed across Catalog, Entity Platform, and Author Recommendation sources.

Readiness: Doctrine locked; runtime conformance remains future work.

## Known Gaps

- Runtime Author identity and bibliography authority must conform to locked Author Authority before runtime lock.
- Author recommendations have strong model docs but bounded product exposure.
- Author details roadmap and completion files need lifecycle classification.
- Public author pages should route through Public Web once expanded.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md)
- [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md)
- [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Author identity | Author Platform | Author ingestion and catalog runtime | Catalog, Entity Platform, this Master doc. |
| Author details | Author Platform | Author DTO/runtime and client surfaces | Author/Catalog docs. |
| Bibliography | Catalog Platform; Author Platform | Author catalog and projections | Work authority and authored-author runbook. |
| Author recommendations | Author Intelligence | Recommendation engine | Author recommendation authority docs. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Catalog / Library | Upstream | Authors are canonical catalog entities. |
| Entity Platform | Upstream | Author refs and summaries are entity-platform concepts. |
| Search / Discovery | Downstream | Authors are surfaced through search/discovery. |
| AI / Intelligence | Downstream | Recommendations and affinity consume author facts. |
| Projection / Recovery | Downstream | Authored links and identity projections must recover. |

## Authority Routing

| Question | Route |
|---|---|
| Author identity | [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md), then [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md) and [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md). |
| Author recommendations | [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md), then [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md). |
| Bibliography authority | [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md), then Work authority and authored-author runbook. |
| Author surfaces | This document and [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md). |

## Future Evolution

Future author changes should be recorded in dedicated author identity, bibliography, or recommendation authority documents and reflected here as routing updates. This Master document must not introduce new author behavior directly.
