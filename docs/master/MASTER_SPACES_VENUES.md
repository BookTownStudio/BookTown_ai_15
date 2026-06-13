---
id: BT-MASTER-SPACES-VENUES-001
title: "BookTown Spaces and Venues Master Document"
status: active
authority_level: master
owner: spaces-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Spaces and Venues Master Document

## Purpose

This document is the Master Layer entry point for Spaces, Venues, public/community place surfaces, stewardship controls, and venue-related projections. It summarizes authority and routes to lower-level runtime and operational sources without creating new Spaces or Venue behavior.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Spaces.
- Venues.
- Venue details.
- Venue drawers.
- Stewardship controls.
- Public/community place surfaces.
- Venue stats deprecation and migration routing.

Out of scope:

- New venue ontology.
- New public place authority.
- New stewardship policy.
- New community feature behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/spaces.ts`
- `functions/src/admin/spacesAuthority.ts`
- `lib/spaces/domain.ts`
- `lib/hooks/useVenueDetails.ts`
- `app/venue-details.tsx`
- `app/drawer/venues.tsx`
- `components/admin/SpacesAuthorityTab.tsx`

Backend runtime owns space/venue mutation, stewardship controls, administrative authority actions, and privileged correction paths. Client surfaces render venue details and request approved actions only.

## Documentation Authority

Primary authority currently comes from runtime and routed product/operations authority:

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md)
- [VenueStatsDeprecationRunbook.md](../operations/projections/VenueStatsDeprecationRunbook.md)

## System Architecture

Spaces and Venues are community/place-oriented product systems. They connect users, literary context, public/community presentation, and administrative stewardship without becoming canonical literary entity authority by default.

The architecture separates:

- Space/venue runtime authority.
- Venue details presentation.
- Stewardship and administrative controls.
- Social/community interactions.
- Public exposure.
- Deprecated venue statistics handling.

## Core Components

| Component | Role |
|---|---|
| Spaces domain | Owns backend space/venue behavior. |
| Venue details | Renders venue-facing product surface. |
| Venue drawer | Provides venue navigation and interaction context. |
| Spaces authority admin | Supports privileged stewardship controls. |
| Venue stats deprecation | Routes retired venue-stat behavior. |
| Public/community exposure | Consumes venue data through product/public surfaces. |

## Data Authority

| Data | Authority |
|---|---|
| Space/venue records | Spaces backend runtime. |
| Stewardship controls | Admin/control runtime. |
| Venue details display | Spaces runtime and client rendering. |
| Venue stats legacy data | Venue stats deprecation runbook. |
| Public venue exposure | Spaces plus Public Web authority. |
| Social/community interactions | Social / Messaging authority. |

## User-Facing Surfaces

- Venue details.
- Venue drawer.
- Spaces stewardship/admin surfaces.
- Community or public venue entry points.
- Social/contextual surfaces that reference venues.

## Operational Dependencies

- Admin / Control Plane.
- Social / Messaging.
- Public Web.
- Projection / Recovery.
- Observability.
- Catalog/Entity Platform if literary-place relationships are introduced.

## Projection Dependencies

Spaces and Venues may depend on:

- `venue_stats_deprecation`
- `runtime_health`
- `system_events`
- Social/community projections where venue activity is surfaced.

## Governance Rules

- Spaces/Venues must not become literary-place canonical authority without explicit Entity Platform routing.
- Admin stewardship controls must remain backend-owned and role-validated.
- Venue stats deprecation must remain historical/operational evidence.
- Public venue exposure must route through Public Web and owning domain authority.
- Social/community interactions must route through Social / Messaging authority.

## Current Maturity

Product maturity: Emerging.

Architecture maturity: Implemented, with sparse documentation authority.

Documentation maturity: Partial to Good after this Master document.

Readiness: Internal Ready.

## Known Gaps

- Dedicated Spaces/Venues architecture authority is still needed.
- Literary-place vs venue authority remains unresolved.
- Public venue exposure and stewardship policy require stronger documentation.
- Venue statistics deprecation should be archived after migration classification.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [VenueStatsDeprecationRunbook.md](../operations/projections/VenueStatsDeprecationRunbook.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Spaces | Spaces Platform | Spaces backend runtime | This Master doc and runtime authority. |
| Venues | Spaces Platform | Spaces/venue runtime | This Master doc and venue runtime. |
| Stewardship | Control Plane; Spaces Platform | Admin/control runtime | Admin Operations and this Master doc. |
| Public venue exposure | Public Web; Spaces Platform | Public Web plus spaces runtime | Public Web and Spaces/Venues masters. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Admin / Control Plane | Downstream | Stewardship and correction require privileged controls. |
| Social / Messaging | Downstream | Community interactions may reference venues. |
| Public Web | Downstream | Public venue exposure requires public routing. |
| Entity Platform | Future upstream | Literary-place authority requires entity routing if introduced. |
| Projection / Recovery | Downstream | Venue stats/deprecation and health require operations routing. |

## Authority Routing

| Question | Route |
|---|---|
| Space/venue runtime behavior | Spaces runtime and this Master document. |
| Stewardship controls | [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md). |
| Public venue exposure | [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md). |
| Social/community venue behavior | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md). |
| Literary-place authority | [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md) before treating venues as canonical literary places. |

## Future Evolution

Future Spaces and Venues changes should be documented in dedicated spaces/venues architecture authority and reflected here as routing updates. This Master document must not introduce new Spaces or Venue behavior directly.
