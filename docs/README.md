---
id: BT-DOCS-README-001
title: "BookTown Documentation Entry Point"
status: active
authority_level: master
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Documentation

This file is the single human and AI entry point into the BookTown documentation ecosystem.

BookTown documentation is organized as a governed source-of-truth system. The documentation corpus contains product vision, master maps, architecture authority, operational runbooks, audit evidence, and historical records. Authority is not determined by file age or volume. Authority is determined by layer, status, and explicit routing through the Master layer.

## Documentation Hierarchy

| Layer | Purpose | Authority Role |
|---|---|---|
| Canon | Future permanent product truth. Reserved for highest-level durable BookTown truths. | Highest long-term product authority once populated. |
| Vision | Long-term product and platform direction. | Product intent authority. |
| Master | Deterministic navigation, system inventory, maturity, and authority routing. | First-read operational source of truth. |
| ADR | Locked architecture decisions. | Highest technical decision authority. |
| Architecture | Domain-specific architecture, registers, contracts, and roadmaps. | Binding when routed from Master documents. |
| Product | Product behavior, UX rules, feature maps, and surface expectations. | Product execution reference. |
| Governance | Process rules, safety rules, engineering rules, and documentation rules. | Operating policy authority. |
| Operations | Runbooks, recovery, monitoring, verification, and incident procedures. | Operational authority. |
| Audits | Evidence, findings, and readiness assessments. | Evidence only unless promoted into Master, ADR, Architecture, or Governance. |
| Archive | Superseded, historical, completion, and migration records. | Non-authoritative history. |

## Authority Flow

Authority flows in this order:

```text
Canon -> Vision -> Master -> ADR -> Architecture -> Product -> Governance -> Operations -> Audits -> Archive
```

When documents conflict:

1. Read `docs/master/MASTER_DOC_INDEX.md`.
2. Follow the domain route in `docs/master/MASTER_AUTHORITY_MATRIX.md`.
3. Prefer locked ADRs over active architecture proposals.
4. Treat audits as evidence, not authority.
5. Treat archived or superseded documents as historical unless explicitly requested.

## Reading Order

For humans:

1. `docs/README.md`
2. `docs/master/MASTER_SYSTEM_MAP.md`
3. `docs/master/MASTER_PRODUCT_MAP.md`
4. `docs/master/MASTER_AUTHORITY_MATRIX.md`
5. The relevant domain architecture or operations document.

For AI systems:

1. `docs/README.md`
2. `docs/master/MASTER_DOC_INDEX.md`
3. `docs/master/MASTER_AUTHORITY_MATRIX.md`
4. `docs/master/MASTER_SYSTEM_MAP.md`
5. Vision documents when the question concerns future product direction or user experience.
6. The specific routed authority document.
7. Audit evidence only after authority documents are understood.

## Master Documents

| Document | Purpose |
|---|---|
| [MASTER_SYSTEM_MAP.md](master/MASTER_SYSTEM_MAP.md) | Complete BookTown system inventory, maturity, readiness, priority, owner, and future master-document routing. |
| [MASTER_PRODUCT_MAP.md](master/MASTER_PRODUCT_MAP.md) | Product-centric map of user journeys, feature ownership, and feature maturity. |
| [MASTER_AUTHORITY_MATRIX.md](master/MASTER_AUTHORITY_MATRIX.md) | Canonical routing table for runtime and documentation authority by domain. |
| [MASTER_DOC_INDEX.md](master/MASTER_DOC_INDEX.md) | AI-safe question-to-document routing index and authority escalation rules. |
| [MASTER_READER.md](master/MASTER_READER.md) | Reader authority summary for manifests, progress, reading state, offline, and reader surfaces. |
| [MASTER_SEARCH.md](master/MASTER_SEARCH.md) | Search authority summary for work-centric search, ranking, projections, and search UX. |
| [MASTER_CATALOG_LIBRARY.md](master/MASTER_CATALOG_LIBRARY.md) | Catalog and library authority summary for books, authors, ingestion, provider authority, and library flows. |
| [MASTER_ENTITY_PLATFORM.md](master/MASTER_ENTITY_PLATFORM.md) | Entity Platform authority summary for literary entities, graph systems, identity, and entity contracts. |
| [MASTER_PROJECTION_RECOVERY.md](master/MASTER_PROJECTION_RECOVERY.md) | Projection and recovery authority summary for registry, certification, runbooks, and recovery controls. |
| [MASTER_SOCIAL_MESSAGING.md](master/MASTER_SOCIAL_MESSAGING.md) | Social, community, messaging, DM, moderation, and interaction authority summary. |
| [MASTER_FEEDBACK_REPORTING.md](master/MASTER_FEEDBACK_REPORTING.md) | Feedback, reporting, moderation handoff, feedback attachments, and admin triage authority summary. |
| [MASTER_WRITE_PUBLISHING.md](master/MASTER_WRITE_PUBLISHING.md) | Writing, publishing, projects, manuscripts, publications, and creator workflow authority summary. |
| [MASTER_ADMIN_OPERATIONS.md](master/MASTER_ADMIN_OPERATIONS.md) | Admin, control plane, moderation, recovery, operational tooling, and governance surface authority summary. |
| [MASTER_MEDIA_STORAGE.md](master/MASTER_MEDIA_STORAGE.md) | Attachments, uploads, covers, reader assets, media pipeline, and storage authority summary. |
| [MASTER_OBSERVABILITY.md](master/MASTER_OBSERVABILITY.md) | Metrics, analytics, monitoring, health, telemetry, auditing, and operational visibility authority summary. |
| [MASTER_AI_INTELLIGENCE.md](master/MASTER_AI_INTELLIGENCE.md) | AI Librarian, Discover Agent, MatchMaker, recommendations, Identity Graph, Affinity, and AI governance routing. |
| [MASTER_DISCOVERY_HOME.md](master/MASTER_DISCOVERY_HOME.md) | Discovery, Home, editorial surfaces, discovery intelligence, and recommendation consumer authority summary. |
| [MASTER_SHELVES.md](master/MASTER_SHELVES.md) | Shelf authority, reading organization, shelf lifecycle, and user library projection summary. |
| [MASTER_QUOTES_REVIEWS.md](master/MASTER_QUOTES_REVIEWS.md) | Quotes, reviews, literary atoms, attribution, moderation, and projection authority summary. |
| [MASTER_AUTHOR_SYSTEM.md](master/MASTER_AUTHOR_SYSTEM.md) | Authors, author identity, author details, author recommendations, and bibliography authority summary. |
| [MASTER_CONTRACTS_API.md](master/MASTER_CONTRACTS_API.md) | Contracts, shared types, callable boundaries, API parity, and client/backend authority summary. |
| [MASTER_DESIGN_SYSTEM.md](master/MASTER_DESIGN_SYSTEM.md) | Design system, tokens, UI governance, and component authority summary. |
| [MASTER_PUBLIC_WEB.md](master/MASTER_PUBLIC_WEB.md) | SSR, public pages, SEO, sitemap, and public entity exposure authority summary. |
| [MASTER_SPACES_VENUES.md](master/MASTER_SPACES_VENUES.md) | Spaces, venues, public/community place surfaces, stewardship controls, and venue authority summary. |

## Architecture Registers And Authorities

| Area | Entry Point |
|---|---|
| Catalog Work/Edition/Manifestation | [WORK_EDITION_MANIFESTATION_AUTHORITY.md](architecture/catalog/WORK_EDITION_MANIFESTATION_AUTHORITY.md) |
| Catalog data pipeline | [DATA_PIPELINE.md](architecture/catalog/DATA_PIPELINE.md) |
| Discovery/Home | [DISCOVERY_HOME_REGISTER.md](architecture/discovery/DISCOVERY_HOME_REGISTER.md) |
| Shelves | [SHELVES_ARCHITECTURE.md](architecture/shelves/SHELVES_ARCHITECTURE.md) |
| Public Web | [PUBLIC_WEB_REGISTER.md](architecture/public-web/PUBLIC_WEB_REGISTER.md) |
| Contracts/API | [CONTRACTS_API_REGISTER.md](architecture/contracts/CONTRACTS_API_REGISTER.md) |
| Quotes/Reviews | [QUOTES_REVIEWS_AUTHORITY.md](architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md) |
| Materializing entities | [MATERIALIZING_ENTITIES.md](architecture/entity-platform/MATERIALIZING_ENTITIES.md) |

## Vision Documents

| Document | Purpose |
|---|---|
| [docs/vision/README.md](vision/README.md) | Vision Layer entry point and relationship to Canon and Master. |
| [BOOKTOWN_FINAL_PRODUCT_VISION.md](vision/BOOKTOWN_FINAL_PRODUCT_VISION.md) | Defines the ultimate BookTown vision and long-term destination. |
| [LITERARY_INTELLIGENCE_VISION.md](vision/LITERARY_INTELLIGENCE_VISION.md) | Defines the long-term Literary Intelligence direction. |
| [EXPERIENCE_VISION.md](vision/EXPERIENCE_VISION.md) | Defines the desired user experience across reading, writing, discovery, social, and intelligence. |

## Governance Documents

| Document | Purpose |
|---|---|
| [DOCS_GOVERNANCE.md](governance/DOCS_GOVERNANCE.md) | Defines the BookTown Documentation Operating System, authority hierarchy, maintenance responsibilities, and promotion rules. |
| [DOCUMENT_LIFECYCLE_POLICY.md](governance/DOCUMENT_LIFECYCLE_POLICY.md) | Defines document lifecycle states, transitions, and metadata requirements. |
| [AUTHORITY_CHANGE_POLICY.md](governance/AUTHORITY_CHANGE_POLICY.md) | Defines when authority documents and Master routing must be updated. |
| [AI_CONSUMPTION_POLICY.md](governance/AI_CONSUMPTION_POLICY.md) | Defines how AI systems read, filter, and route BookTown documentation. |
| [ARCHIVE_POLICY.md](governance/ARCHIVE_POLICY.md) | Defines archive, superseded, duplicate, and evidence-only document handling. |

## Audit And Archive Routing

| Layer | Entry Point | Default Authority Role |
|---|---|---|
| Audits | [Audit Evidence README](audits/evidence/README.md) | Evidence only after routed authority is known. |
| Archive | [Archive README](archive/README.md) | Historical reference only. Ignored by default for current authority. |

## Canon Layer

The Canon layer is reserved for permanent product and platform truth. It is now governed by Canon foundation documents, but no existing product, architecture, audit, or governance document has been promoted into Canon.

| Document | Purpose |
|---|---|
| [docs/canon/README.md](canon/README.md) | Canon layer entry point. |
| [CANON_OVERVIEW.md](canon/CANON_OVERVIEW.md) | Defines what Canon means inside BookTown. |
| [CANON_PROMOTION_POLICY.md](canon/CANON_PROMOTION_POLICY.md) | Defines promotion and demotion rules. |
| [CANON_AUTHORITY_MODEL.md](canon/CANON_AUTHORITY_MODEL.md) | Defines Canon authority over lower layers. |
| [CANON_REGISTRY.md](canon/CANON_REGISTRY.md) | Tracks current Canon, drafts, candidates, rejected candidates, and superseded Canon. |

## Current Migration Boundary

The Documentation Operating System is now the active authority model. Legacy root records, superseded records, duplicate authorities, placeholder files, completion records, validation reports, and historical audits have been migrated into Audit Evidence or Archive locations without changing runtime systems or architecture meaning.
