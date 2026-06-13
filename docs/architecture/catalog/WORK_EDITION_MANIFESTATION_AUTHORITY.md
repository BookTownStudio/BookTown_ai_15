---
id: BT-ARCH-CATALOG-WORK-EDITION-MANIFESTATION-AUTHORITY-001
title: "Work, Edition, and Manifestation Authority"
status: active
authority_level: architecture
owner: catalog-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Work, Edition, and Manifestation Authority

## Purpose

This document consolidates current BookTown authority routing for Works, Editions, and Manifestations. It summarizes existing doctrine from ontology, Work authority, catalog audits, and implementation planning without authorizing implementation by itself.

## Scope

In scope:

- Work identity.
- Edition authority.
- Manifestation/access authority.
- Catalog, reader, search, and acquisition dependencies.
- Routing for future implementation plans.

Out of scope:

- New schemas.
- New ingestion behavior.
- New acquisition behavior.
- New public exposure.

## Authority Definitions

| Concept | Definition | Authority Owner |
|---|---|---|
| Work | Intellectual truth: the durable literary identity independent of publisher, format, retailer, or file. | Catalog Platform under Work authority. |
| Edition | Publishing/material truth: a concrete publication or material realization of a Work, including edition-level metadata. | Catalog Platform. |
| Manifestation | Access/rendering/readability/acquisition truth: a concrete readable, acquirable, uploaded, rendered, downloadable, or externally accessible instance of an Edition. | Manifestation authority with Reader/Media/Acquisition dependencies. |

## Required Invariant

Public, readable, or acquirable Works must have a primary Edition.

No public read path, acquisition path, or readable manifestation should treat a Work alone as sufficient access authority when an Edition is required to resolve material publishing or rendering truth.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/library.ts`
- `functions/src/library/*`
- `functions/src/library/materializeBookAuthority.ts`
- `functions/src/library/providerRoleRegistry.ts`
- Reader and media runtimes where readable access or uploaded assets are resolved.

## Documentation Authority

Primary authority:

- [MASTER_CATALOG_LIBRARY.md](../../master/MASTER_CATALOG_LIBRARY.md)
- [WORK_AUTHORITY_SOURCE_LAW.md](../WORK_AUTHORITY_SOURCE_LAW.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [DATA_PIPELINE.md](DATA_PIPELINE.md)
- [PHASE_1_CONTRACTS.md](../PHASE_1_CONTRACTS.md)

Related authority:

- [MASTER_READER.md](../../master/MASTER_READER.md)
- [MASTER_MEDIA_STORAGE.md](../../master/MASTER_MEDIA_STORAGE.md)
- [MASTER_SEARCH.md](../../master/MASTER_SEARCH.md)

## System Architecture

Catalog authority resolves intellectual identity first, material publishing truth second, and rendering/access truth through the owning consumer domain. This prevents search results, external provider records, uploaded files, or reader manifests from silently becoming canonical Work authority.

## Core Components

| Component | Role |
|---|---|
| Work authority | Determines canonical intellectual identity. |
| Edition authority | Holds material publication and edition-level evidence. |
| Primary Edition | Required route for public/readable/acquirable Work access. |
| Manifestation authority | Governs concrete access/rendering surfaces. |
| Provider evidence | Supplies candidate metadata under provider role rules. |
| Catalog materialization | Converts accepted evidence into governed records. |

## Governance Rules

- Work identity is intellectual truth.
- Edition identity is publishing/material truth.
- Manifestation identity is access/rendering truth.
- Providers supply evidence; they do not silently overwrite authority.
- Reader, Media, Search, and Public Web consume catalog authority; they do not redefine it.
- This document routes authority and does not authorize implementation by itself.

## Known Gaps

- Primary Edition selection rules need continued operational evidence before broader public exposure.
- Provider-specific Edition confidence remains distributed across runtime and ingestion evidence.
- Manifestation subtypes should remain owned by their rendering/access domains.

## Related Documents

- [MASTER_CATALOG_LIBRARY.md](../../master/MASTER_CATALOG_LIBRARY.md)
- [WORK_AUTHORITY_SOURCE_LAW.md](../WORK_AUTHORITY_SOURCE_LAW.md)
- [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md)
- [DATA_PIPELINE.md](DATA_PIPELINE.md)
- [MATERIALIZING_ENTITIES.md](../entity-platform/MATERIALIZING_ENTITIES.md)
