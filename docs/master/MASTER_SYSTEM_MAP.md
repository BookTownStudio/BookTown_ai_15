---
id: BT-MASTER-SYSTEM-MAP-001
title: "BookTown Master System Map"
status: active
authority_level: master
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Master System Map

This document is the complete master inventory of BookTown systems identified by the system inventory and maturity audits. It provides deterministic routing for future master documents and roadmap prioritization.

This is a navigation and authority-routing document. It does not create new architecture authority. Primary authority remains in the linked architecture, operations, contract, runtime, and audit sources.

## System Matrix

| System | Classification | Current Maturity | Readiness | Priority | Primary Authority Document | Future Master Document |
|---|---|---|---|---|---|---|
| Books | Product System; Canonical Entity | First-Class | Closed Beta Ready | P0 | [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md) | `MASTER_CATALOG_LIBRARY.md` |
| Catalog | Product Platform; Canonical Catalog | Operational | Closed Beta Ready | P0 | [data-pipeline.md](../data-pipeline.md), [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md) | `MASTER_CATALOG_LIBRARY.md` |
| Authors | Product System; Canonical Entity | Operational | Closed Beta Ready | P1 | [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md), [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md) | `MASTER_AUTHOR_SYSTEM.md` |
| Quotes | Product System; Canonical Entity | Functional | Closed Beta Ready | P1 | [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md), [QuoteProjectionRecoveryRunbook.md](../operations/projections/QuoteProjectionRecoveryRunbook.md) | `MASTER_QUOTES_REVIEWS.md` |
| Reader | Product System | First-Class | Public Beta Ready | P0 | [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md) | `MASTER_READER.md` |
| Search | Product System; Intelligence System | First-Class | Public Beta Ready | P0 | [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md) | `MASTER_SEARCH.md` |
| Discovery | Product System; Intelligence System | Functional | Closed Beta Ready | P0 | [DISCOVERY_MODULE_AUTHORITY.md](../architecture/discovery/DISCOVERY_MODULE_AUTHORITY.md), [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md) | `MASTER_DISCOVERY_HOME.md` |
| Shelves | Product System | Operational | Closed Beta Ready | P0 | [ShelfDisplayProjectionRecoveryRunbook.md](../operations/projections/ShelfDisplayProjectionRecoveryRunbook.md), runtime `shelf_books` authority | `MASTER_SHELVES.md` |
| Social | Product System | Functional | Internal Ready | P1 | [T3_social_attachment_post_authority_stabilization_execution.md](../audits/evidence/audit/T3_social_attachment_post_authority_stabilization_execution.md), social runtime callables | `MASTER_SOCIAL_MESSAGING.md` |
| Messaging | Product System | Functional | Closed Beta Ready | P2 | [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md) | `MASTER_SOCIAL_MESSAGING.md` |
| Writing | Product System | Operational | Closed Beta Ready | P1 | [T6_write_publishing_authority_stabilization_execution.md](../audits/evidence/audit/T6_write_publishing_authority_stabilization_execution.md), write runtime callables | `MASTER_WRITE_PUBLISHING.md` |
| Publishing | Product System | Operational | Closed Beta Ready | P1 | [T6_write_publishing_authority_stabilization_execution.md](../audits/evidence/audit/T6_write_publishing_authority_stabilization_execution.md), publishing runtime | `MASTER_WRITE_PUBLISHING.md` |
| Literary Entity Platform | Platform System | Emerging | Internal Ready | P0 | [ENTITY_PLATFORM_VISION.md](../architecture/entity-platform/ENTITY_PLATFORM_VISION.md), [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md) | `MASTER_ENTITY_PLATFORM.md` |
| MatchMaker | Intelligence System; Platform System | Emerging | Internal Ready | P0 | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md) | `MASTER_AI_INTELLIGENCE.md` |
| Literary Graph | Graph System | Emerging | Internal Ready | P0 | [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md) | `MASTER_ENTITY_PLATFORM.md` |
| Identity Graph | Graph System; Intelligence System | Emerging | Internal Ready | P0 | [LITERARY_IDENTITY_GRAPH.md](../architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md), entity interaction contracts | `MASTER_AI_INTELLIGENCE.md` |
| Affinity Layer | Intelligence Infrastructure | Emerging | Internal Ready | P1 | [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md), MatchMaker docs | `MASTER_AI_INTELLIGENCE.md` |
| AI Librarian | Intelligence System | Functional | Internal Ready | P1 | AI runtime callables, [closed_beta_readiness_audit.md](../audits/evidence/audit/closed_beta_readiness_audit.md) | `MASTER_AI_INTELLIGENCE.md` |
| Author Recommendations | Intelligence System | Functional | Internal Ready | P1 | [AUTHOR_RECOMMENDATION_AUTHORITY.md](../architecture/authors/AUTHOR_RECOMMENDATION_AUTHORITY.md) | `MASTER_AI_INTELLIGENCE.md` |
| Admin | Operational System; Control Plane | Operational | Internal Ready | P0 | [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md), admin/control runtime | `MASTER_ADMIN_OPERATIONS.md` |
| Projection System | Infrastructure System; Operational System | First-Class | Production Ready | P0 | [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md), [ProjectionRegistry.md](../architecture/ProjectionRegistry.md) | `MASTER_PROJECTION_RECOVERY.md` |
| Media | Infrastructure System; Product Support | Operational | Closed Beta Ready | P0 | [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md), attachment runtime, storage rules | `MASTER_MEDIA_STORAGE.md` |
| SSR | Infrastructure System | Emerging | Internal Ready | P2 | SSR runtime functions and hosting config | `MASTER_PUBLIC_WEB.md` |
| Design System | Platform System; Frontend Platform | Functional | Internal Ready | P1 | [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md) | `MASTER_DESIGN_SYSTEM.md` |
| Contracts | Infrastructure System; API Layer | Operational | Closed Beta Ready | P0 | `contracts/*`, callable wrapper runtime, [WAVE_4_COMPLETION.md](../audits/evidence/completions/engineering/WAVE_4_COMPLETION.md) | `MASTER_CONTRACTS_API.md` |
| Observability | Operational System | Operational | Internal Ready | P0 | [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md), operations runtime, projection runbooks | `MASTER_OBSERVABILITY.md` |
| Feedback / Reporting | Operational System; Product Support | Operational | Closed Beta Ready | P1 | feedback runtime, social reporting runtime, feedback tests | `MASTER_ADMIN_OPERATIONS.md` |
| Spaces / Venues | Product System; Community Surface | Emerging | Internal Ready | P2 | spaces runtime, [VenueStatsDeprecationRunbook.md](../operations/projections/VenueStatsDeprecationRunbook.md) | `MASTER_SPACES_VENUES.md` |

## Product Systems

| System | Primary Surfaces | Runtime Evidence |
|---|---|---|
| Books / Catalog | Book details, search results, reader entry, author details | `functions/src/domains/library.ts`, `functions/src/library/*`, `app/book-details.tsx` |
| Reader | Reader, publication reader, read tab, continue reading | `functions/src/domains/reader.ts`, `components/reader/*`, `app/reader.tsx` |
| Shelves | Shelf details, library/shelf actions, book shelf membership | `functions/src/shelves/*`, `app/shelf-details.tsx`, shelf hooks |
| Social | Feed, post detail, composer, comments, reactions | `functions/src/domains/social.ts`, `app/tabs/social.tsx` |
| Messaging | DM list, thread, message requests | `functions/src/domains/messaging.ts`, `app/messenger/*` |
| Writing / Publishing | Write tab, editor, project publish, publication reader | `functions/src/domains/write.ts`, `lib/editor/*`, `app/project/*` |
| Quotes / Reviews | Quote detail, quote lists, book reviews, profile reviews | `functions/src/domains/quotes.ts`, profile/review callables |
| Spaces / Venues | Venue details, spaces stewardship, venue drawer | `functions/src/domains/spaces.ts`, `app/venue-details.tsx` |

## Platform Systems

| System | Role | Primary Evidence |
|---|---|---|
| Literary Entity Platform | Cross-system literary entity references, summaries, lifecycle, authority states | `contracts/entityPlatform/*`, [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md) |
| Design System | Visual language, tokens, primitives, motion, typography, accessibility direction | [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md), `components/ui/*` |
| Contracts / API Layer | Shared DTOs, callable wrappers, parity, error envelopes | `contracts/*`, `functions/src/contracts/*` |
| Media / Attachments | Upload tokens, attachment metadata, storage, derivatives, signed URLs | `functions/src/domains/attachments.ts`, `lib/media/*`, storage rules |

## Intelligence Systems

| System | Role | Primary Evidence |
|---|---|---|
| Search | Work-centric retrieval, routing, ranking, result composition | [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md), search contracts/tests |
| Discovery / Home | Discovery surfaces, home console, editorial governance, continuity starter | `functions/src/domains/home.ts`, discovery docs |
| MatchMaker | Derived literary intelligence layer; not canonical truth | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md) |
| Author Recommendations | Canonical author recommendation subsystem | author recommendation docs and tests |
| AI Librarian | AI assistance and agent session system; non-authoritative output | `functions/src/domains/ai.ts`, AI tests and beta audit |
| Affinity Layer | Derived user/entity signal support | affinity tests, author recommendation input snapshots |

## Graph Systems

| System | Role | Primary Evidence |
|---|---|---|
| Literary Graph | Knowledge graph for literary entities and relationships | [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md) |
| Identity Graph | User interaction graph over literary entities | [LITERARY_IDENTITY_GRAPH.md](../architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md), user interaction contracts |
| Social Graph | Follows, shelf follows, profile relationships | profile and social runtime callables |
| Projection Dependency Graph | Authority-to-projection operational dependency graph | [ProjectionRegistry.md](../architecture/ProjectionRegistry.md) |

## Operational Systems

| System | Role | Primary Evidence |
|---|---|---|
| Admin / Control Plane | Authority administration, deletion, metrics, dashboards, editorial controls | `functions/src/domains/admin.ts`, `functions/src/control/*` |
| Projection / Recovery | Bounded rebuilds, verification, health, failure ledgers, runbooks | `functions/src/operations/*`, [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md) |
| Observability / Analytics | Metrics, events, exports, runtime health, anomaly reporting | `functions/src/analytics/*`, `functions/src/operations/*` |
| Feedback / Reporting | Feedback reports, social reports, moderation handoff | `functions/src/domains/feedback.ts`, social reporting/moderation runtime |

## Infrastructure Systems

| System | Role | Primary Evidence |
|---|---|---|
| Firebase Functions | Backend callable and trigger runtime | `functions/src/index.ts`, domain modules |
| Firestore Rules / Indexes | Data access and query support | `firestore.rules`, `firestore.indexes.json` |
| Storage Rules | Upload and asset access control | `storage.rules` |
| SSR / Hosting | Public pages, sitemap, hosting cache policy | `functions/src/domains/ssr.ts`, `firebase.json` |
| Build / Quality Gates | Production truth, Firestore safety, reader performance gates | `package.json`, `scripts/*` |

## Documentation Ownership

| Owner | Owns | Current Authority Sources |
|---|---|---|
| Documentation Governance | Master routing and source-of-truth navigation | Master documents |
| Catalog Platform | Books, catalog, provider authority, ingestion | Work authority law, data pipeline, catalog runtime |
| Entity Platform | Literary entity contracts and maturity | Entity platform docs and contracts |
| Search Platform | Search architecture and result semantics | Search architecture register |
| Reader Platform | Reader authority, manifests, progress, offline behavior | Reader authority docs and runbooks |
| Operations Platform | Projections, recovery, observability, runbooks | Phase 8A docs, projection registry, operations runbooks |
| Control Plane | Admin, deletion, safety, governance enforcement | Firestore safety docs and admin/control runtime |
| Social Platform | Social posts, interactions, reporting handoff, community surfaces | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), social runtime |
| Messaging Platform | Direct messages, message requests, DM privacy and attachments | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), messaging docs |
| Writing Platform | Writing projects, manuscripts, creator workflows | [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md), write runtime |
| Media Platform | Attachments, uploads, covers, derivatives, signed access | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md), media runtime |
| Intelligence Platform | AI Librarian, MatchMaker, recommendations, Identity Graph, Affinity | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md), intelligence runtime |
| Discovery Platform | Home, discovery, editorial modules, recommendation consumers | [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md), discovery runtime |
| Library UX | Shelves, shelf membership, user library organization | [MASTER_SHELVES.md](MASTER_SHELVES.md), shelf runtime |
| Quote Platform | Quotes, reviews, attribution, literary atoms | [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md), quote/review runtime |
| Author Platform | Author identity, author details, bibliography, author recommendations | [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md), author runtime |
| API Platform | Shared contracts, callable wrappers, parity, error envelopes | [MASTER_CONTRACTS_API.md](MASTER_CONTRACTS_API.md), contract runtime |
| Design System | UI primitives, tokens, visual governance, component authority | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md), design-system docs |
| Public Web | SSR, public pages, sitemap, public entity exposure | [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md), SSR runtime |
| Spaces Platform | Spaces, venues, stewardship controls, public/community place surfaces | [MASTER_SPACES_VENUES.md](MASTER_SPACES_VENUES.md), spaces runtime |

## Classification Rules

| Classification | Definition |
|---|---|
| Product System | Direct user-facing capability or journey. |
| Platform System | Shared foundation used by multiple product systems. |
| Intelligence System | Recommendation, discovery, AI, graph, affinity, or reasoning capability. |
| Infrastructure | Runtime, contract, storage, API, SSR, or projection support. |
| Operations | Admin, recovery, monitoring, reporting, moderation, or governance capability. |
| Canonical Entity | Durable literary or product authority object. |

## Priority Rules

| Priority | Meaning |
|---|---|
| P0 | Required for source-of-truth governance, beta safety, or core product correctness. |
| P1 | Important for product completeness and scale readiness. |
| P2 | Needed for long-term completeness but not first migration blocker. |
| P3 | Future or optional documentation expansion. |

## Existing Master Document Coverage

The following first-class system Master documents currently exist:

- `MASTER_READER.md`
- `MASTER_SEARCH.md`
- `MASTER_CATALOG_LIBRARY.md`
- `MASTER_ENTITY_PLATFORM.md`
- `MASTER_PROJECTION_RECOVERY.md`
- `MASTER_ADMIN_OPERATIONS.md`
- `MASTER_SOCIAL_MESSAGING.md`
- `MASTER_WRITE_PUBLISHING.md`
- `MASTER_MEDIA_STORAGE.md`
- `MASTER_OBSERVABILITY.md`
- `MASTER_AI_INTELLIGENCE.md`
- `MASTER_SHELVES.md`
- `MASTER_DISCOVERY_HOME.md`
- `MASTER_CONTRACTS_API.md`
- `MASTER_DESIGN_SYSTEM.md`
- `MASTER_PUBLIC_WEB.md`
- `MASTER_QUOTES_REVIEWS.md`
- `MASTER_AUTHOR_SYSTEM.md`
- `MASTER_SPACES_VENUES.md`

## Remaining Master Document Candidates

All currently identified first-class systems now have a Master Layer route. Future candidates should be created only when a new first-class system is identified or an existing shared Master document becomes too broad to maintain safely.
