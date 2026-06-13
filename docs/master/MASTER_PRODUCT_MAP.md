---
id: BT-MASTER-PRODUCT-MAP-001
title: "BookTown Master Product Map"
status: active
authority_level: master
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Master Product Map

This document maps BookTown from the product and user-journey perspective. It records user journeys, feature ownership, feature maturity, beta exposure, dependencies, strategic priority, and known gaps without redefining architecture or changing existing product documents.

This is a product navigation document. Runtime and architecture authority remain routed through `MASTER_AUTHORITY_MATRIX.md`.

## Reader Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Find a book | Search, Discovery, Home, Catalog | Search / Catalog | First-Class | Candidate for constrained beta | P0 | Catalog, Search, Projections | Full public exposure still depends on broader beta posture. |
| Inspect a work | Book Details, Authors, Quotes, Editions | Catalog | Operational | Candidate for constrained beta | P0 | Books, Authors, Editions, Search | Canonical authority is strong but distributed across docs. |
| Acquire readable access | Reader access, rights, external ebook acquisition, uploads | Reader / Media | Operational | Candidate for constrained reading beta | P0 | Rights, Storage, Attachments, Catalog | Route through Reader, Catalog, and Media masters; rights/licensing remains cross-domain. |
| Read in app | EPUB/PDF reader, manifest, reader chrome, settings | Reader | First-Class | Candidate for constrained reading beta | P0 | Reader Manifests, EPUB/PDF runtime, Offline | Continue device/performance validation before broad public beta. |
| Continue reading | progress, sessions, home continuity, offline sync | Reader | Operational | Candidate for constrained beta | P0 | Reading Progress, Reader Sync, Home | Offline conflict and replay behavior must remain governed. |
| Annotate and remember | highlights, bookmarks, quotes, diagnostics | Reader / Quotes | Functional | Internal to constrained beta | P1 | Reader Sync, Quotes, Projections | Quote/annotation lifecycle authority needs consolidation. |

## Discovery Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Open discovery | Discover tab, Home, editorial console | Discovery | Functional | Limited/internal | P0 | Search, Catalog, Home Editorial | Route through [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md). |
| Search intentionally | Search UX, search contracts, projections | Search | First-Class | Candidate for public beta after product gate | P0 | Catalog, Contracts, Search Projections | Search register has open questions; ADRs govern locked behavior. |
| Explore authors | Author details, author discovery, author recommendations | Author / Author Intelligence | Operational | Closed beta candidate | P1 | Authors, Catalog, Entity Platform | Author graph/global search participation remains incomplete. |
| Explore graph context | Literary Graph, semantic collections, related works | Literary Graph | Emerging | Internal | P0 | Entity Platform, Relationships, Catalog | Product surfacing is early. |
| Receive recommendations | Discovery modules, MatchMaker foundations, author recommendations | Discovery / MatchMaker | Emerging | Internal | P0 | Entity Platform, Affinity, Identity Graph | MatchMaker is governed but product integration remains early. |

## Writing Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Create a project | project callables, write tab | Writing | Operational | Closed beta candidate | P1 | Auth, Project Runtime, Contracts | Route through [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md). |
| Draft and edit | editor runtime, chunked manuscript, local persistence | Writing | Operational | Closed beta candidate | P1 | Editor Runtime, IndexedDB, Sync | Route through [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md); lower-level editor architecture remains implementation-rich. |
| Preview release | project preview, EPUB generation | Publishing | Functional | Internal/closed beta | P1 | Publishing, Reader, Media | Release preview authority should be consolidated. |
| Publish | publishing bridge, longform publications, rights updates | Publishing | Operational | Closed beta candidate | P1 | Projects, Rights, Catalog Bridge | Public publishing policy needs master-level routing. |
| Read publication | publication reader, accessible book flows | Reader / Publishing | Functional | Closed beta candidate | P1 | Reader, Publication Metadata | Public publication/SSR relationship needs authority doc. |

## Social Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Compose post | post composer, attachments, entity picker | Social / Media | Functional | Internal/constrained | P1 | Attachments, Entity Platform, Social APIs | Route through [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md) and [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md). |
| Read feed | social feed, render projection, interaction state | Social | Functional | Internal/constrained | P1 | Post Projections, Search Feed, User State | Beta audit cautions against broad current exposure. |
| Discuss | comments, post discussion, reactions | Social | Functional | Internal/constrained | P1 | Comments, Engagement Stats, Notifications | Moderation/rate limits need master routing. |
| Follow and connect | follows, shelf follows, suggested profiles | Profile / Social | Functional | Internal/constrained | P1 | Profile, Social Graph, User Stats | Social graph authority is distributed. |
| Report and moderate | reporting, moderation stages, admin actions | Social / Feedback Ops / Control Plane | Functional | Internal/admin | P0 | Reporting, Admin, Audit Logs | Route through Feedback/Reporting, Social/Messaging, and Admin Operations; dedicated moderation policy remains needed. |

## Messaging Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Start conversation | direct conversation creation, request flow | Messaging | Functional | Closed beta candidate | P2 | Users, Privacy, Messaging APIs | V1 lock governs; future roadmap is not current authority. |
| Send message | direct message callable, message thread | Messaging | Functional | Closed beta candidate | P2 | Conversations, Auth, Reporting | Media upload remains bounded by DM media contract. |
| Attach entities | book/author/shelf/quote attachments | Messaging / Entity Platform | Functional | Closed beta candidate | P2 | Entity Picker, Entity Summaries | Attachment authority split by entity type. |
| Report conversation | DM reporting, admin review | Messaging / Feedback Ops | Functional | Internal/admin | P1 | Reporting, Admin, Moderation | Route through [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md), [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), and [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md). |

## Administrative Journey

| Step | Feature Systems | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Govern catalog authority | catalog authority admin, book/author admin tools | Control Plane / Catalog | Operational | Internal/admin only | P0 | RBAC, Catalog Authority, Firestore Safety | Destructive admin workflows need strict master governance. |
| Monitor operations | dashboards, system metrics, runtime health, anomalies | Operations | Operational | Internal/admin only | P0 | Metrics, Events, Projection Health | Route through [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md). |
| Recover projections | recovery control plane, runbooks, registry | Operations | First-Class | Internal/admin only | P0 | Projection Registry, Runbooks | Strong authority chain; route through Phase 8A docs. |
| Handle feedback | feedback reports, attachments, export | Feedback Ops | Operational | Internal/admin only | P1 | Feedback APIs, Attachments, Admin | Route through [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md), [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md), and [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md). |
| Handle deletion/privacy | deletion requests, purge deleted users, audit logs | Control Plane | Operational | Internal/admin only | P0 | Auth, Audit Logs, Data Ownership | Needs privacy/deletion master policy routing. |
| Manage editorial home | home editorial console, starter pool | Discovery / Control Plane | Functional | Internal/admin only | P1 | Home Console, Discovery, Catalog | Route through [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md) and [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md). |

## Product Areas

| Product Area | Primary Surfaces | Owner | Feature Maturity | Current Beta Exposure | Strategic Priority | Dependencies | Known Gaps |
|---|---|---|---|---|---|---|---|
| Reading | Read tab, reader, publication reader | Reader Platform | First-Class | Constrained reading beta candidate | P0 | Catalog, Rights, Media, Projections | Route through [MASTER_READER.md](MASTER_READER.md). |
| Search / Discovery | Search, Discover, Home | Search / Discovery | First-Class to Functional | Closed/public beta candidate by surface | P0 | Catalog, MatchMaker, Home Editorial | Discovery/MatchMaker integration is still emerging. |
| Catalog / Entities | Book details, author details, quote details | Catalog / Entity Platform | Operational | Closed beta candidate | P0 | Books, Authors, Quotes, Entity Contracts | Authority spread across docs. |
| Library / Shelves | Shelf details, book shelf controls | Library UX | Operational | Closed beta candidate | P0 | `shelf_books`, user library projections | Route through [MASTER_SHELVES.md](MASTER_SHELVES.md). |
| Social / Community | Social tab, posts, comments, profiles | Social Platform | Functional | Internal/constrained | P1 | Attachments, Moderation, Notifications | Broad beta exposure not currently recommended. |
| Messaging | Messenger list/thread | Messaging Platform | Functional | Closed beta candidate | P2 | Users, Privacy, Reporting | V1 current scope must remain bounded. |
| Writing / Publishing | Write tab, editor, publish flow | Writing Platform | Operational | Closed beta candidate | P1 | Editor, Projects, Publishing, Reader | Route through [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md). |
| Administration | Admin console, intelligence dashboard, feedback/admin | Control Plane | Operational | Internal/admin only | P0 | Auth, Metrics, Recovery, Deletion | Needs strict master governance. |

## Feature Ownership Matrix

| Feature Area | Owner | Supporting Systems |
|---|---|---|
| Reading | Reader Platform | Catalog, Media, Rights, Projections |
| Search | Search Platform | Catalog, Contracts, Projections |
| Discovery | Discovery Platform | Search, MatchMaker, Editorial Governance |
| Catalog | Catalog Platform | Entity Platform, Providers, Authority Data |
| Writing | Writing Platform | Editor Runtime, Publishing, Reader |
| Social | Social Platform | Media, Notifications, Moderation |
| Messaging | Messaging Platform | Users, Entity Attachments, Reporting |
| Feedback / Reporting | Feedback Operations | Admin, Social/Messaging, Media, Observability |
| Admin | Control Plane | Auth, Metrics, Recovery, Deletion |
| Intelligence | MatchMaker / AI / Discovery | Entity Platform, Graphs, Affinity |
| Operations | Operations Platform | Projections, Metrics, Runbooks |

## Feature Maturity Summary

| Maturity | Feature Areas |
|---|---|
| First-Class | Reader, Search, Books/Catalog foundations, Projection Recovery |
| Operational | Writing/Publishing, Shelves, Media/Attachments, Admin, Observability, Feedback |
| Functional | Discovery, Social, Messaging, Quotes, Author Recommendations, AI Librarian |
| Emerging | MatchMaker product integration, Literary Graph surfacing, Identity Graph, Affinity, Spaces/Venues, SSR/Public Pages |

## Current Beta Exposure

| Exposure | Systems |
|---|---|
| Candidate for constrained reading beta | Reader, Search, Catalog/Books, Authors, Shelves, selected Discovery, Writing/Publishing |
| Internal/admin only | Admin, Projection Recovery, Observability, Feedback/Reporting administration, deletion/privacy, editorial home management |
| Internal/constrained product exposure | Social, AI Librarian, MatchMaker-derived experiences, Literary Graph surfaces, Affinity, Identity Graph |
| Emerging/internal | Spaces/Venues, SSR/Public Pages, broad public web surfaces |

## Strategic Priority

| Priority | Product Areas |
|---|---|
| P0 | Reader, Search, Catalog/Books, Shelves, Discovery, Projection Recovery, Admin/Operations |
| P1 | Social, Writing/Publishing, Quotes/Reviews, Author Recommendations, AI Librarian, Design System |
| P2 | Messaging, Spaces/Venues, SSR/Public Pages |

## Dependency Summary

| Product Area | Depends On |
|---|---|
| Reader | Catalog, rights, media/storage, reader manifests, reading progress, offline sync, projection recovery |
| Search | Catalog, books/authors/editions, contracts, search projections, normalization |
| Discovery | Search, catalog, home editorial governance, MatchMaker foundations, author recommendations |
| Writing / Publishing | Editor runtime, project persistence, publishing bridge, reader/publication surfaces |
| Social | Users/profiles, posts, attachments, notifications, moderation, projections |
| Messaging | Users, conversation state, entity attachments, privacy/request policy, reporting |
| Admin | Auth/RBAC, metrics, projection registry, deletion workflows, Firestore safety |

## Known Product Gaps

| Gap | Affected Areas |
|---|---|
| Full public beta posture is not established for the entire app surface. | Social, AI, Discovery, public surfaces |
| Some product domains have runtime maturity ahead of lower-level architecture authority. | Feedback, SSR, Spaces/Venues, Moderation |
| AI and derived intelligence boundaries need continued lower-level authority consolidation under the existing Master route. | AI Librarian, MatchMaker, Author Recommendations, Affinity |
| Public web and SSR authority is thin. | SSR/Public Pages, Publications |
| Moderation policy needs dedicated authority before broad exposure. | Social, Messaging, Feedback/Reporting |

## Product Boundary

This file is product routing only. Runtime authority remains with backend services, contracts, and domain-specific architecture documents listed in `MASTER_AUTHORITY_MATRIX.md`.
