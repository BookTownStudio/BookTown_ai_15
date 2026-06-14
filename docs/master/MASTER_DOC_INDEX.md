---
id: BT-MASTER-DOC-INDEX-001
title: "BookTown Master Documentation Index"
status: active
authority_level: master
owner: documentation-governance
last_audited: 2026-06-14
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Master Documentation Index

This document is the AI-safe document routing index. It maps questions to authority documents and defines deterministic reading order, human reading order, architecture routing, operations routing, governance routing, audit routing, and authority escalation.

This document does not create new architecture authority. It routes humans and AI systems to existing authority and evidence.

## How To Navigate BookTown Documentation

Start with the Master Layer:

1. Use this document to classify the question.
2. Use [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) to identify the current authority document.
3. Use [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md) to understand the system class, maturity, readiness, and future master route.
4. Use [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md) when the question is about product journeys, beta exposure, product maturity, or feature ownership.
5. Read audits only after authority documents are known.

## AI Reading Order

1. `docs/README.md`
2. `docs/master/MASTER_DOC_INDEX.md`
3. `docs/master/MASTER_AUTHORITY_MATRIX.md`
4. `docs/master/MASTER_SYSTEM_MAP.md`
5. `docs/master/MASTER_PRODUCT_MAP.md`
6. Canon documents when the question concerns permanent product/platform truth or Canon governance.
7. Vision documents when the question concerns long-term product direction, Literary Intelligence, or user experience.
8. The routed architecture, operations, governance, or product document.
9. Audit evidence only after routed authority has been read.

## Human Reading Order

1. [docs/README.md](../README.md)
2. [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
3. [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md)
4. [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
5. This routing index for specific question-to-document lookup.
6. The relevant authority document.
7. Audit evidence if the task requires historical findings or risk review.

## Authority Escalation Order

Use this order when two documents conflict:

1. Canon layer once populated.
2. Vision documents once created.
3. Master routing documents.
4. Locked ADRs or locked register decisions.
5. Active architecture registers and authority docs.
6. Product docs for product UX and journey rules.
7. Governance documents for process and safety rules.
8. Operations registry and runbooks for operational procedures.
9. Audits for evidence and historical findings.
10. Archive or superseded docs for history only.

## Authority Escalation Flow

```text
Canon -> Vision -> Master -> ADR -> Architecture -> Product -> Governance -> Operations -> Audits -> Archive
```

Canon sits above Vision. Canon foundation documents now define Canon governance and authority. Product or platform truth becomes Canon only after explicit promotion and registry update.

## Question Routing

| Question Type | First Document | Then Read |
|---|---|---|
| What systems exist in BookTown? | [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md) | Domain architecture docs as needed. |
| Which document is authoritative for a domain? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | The listed documentation authority. |
| How does a user journey work? | [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md) | Product surface docs and domain architecture. |
| What is the current maturity or readiness of a system? | [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md) | Supporting audits only for evidence. |
| What owns canonical literary truth? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md), [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md), [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md). |
| What is an Entity, LiteraryEntityRef, EntitySummary, or entity lifecycle state? | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md) | [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md), [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md), [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md). |
| What is a Theme, Concept, Meaning Unit, meaning alias, translation, or near-synonym? | [MEANING_UNIT_AUTHORITY.md](../architecture/entity-platform/MEANING_UNIT_AUTHORITY.md) | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md), [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md), [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md). |
| What is a Literary Graph node, relationship, influence, response, lineage, membership, or graph evidence rule? | [LITERARY_GRAPH_AUTHORITY.md](../architecture/literary-graph/LITERARY_GRAPH_AUTHORITY.md) | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md), [MEANING_UNIT_AUTHORITY.md](../architecture/entity-platform/MEANING_UNIT_AUTHORITY.md), [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md). |
| How does Search work? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md). |
| How does Reader work? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md), reader SLO/stress docs. |
| How do projections recover? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [ProjectionRegistry.md](../architecture/ProjectionRegistry.md), [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md), relevant runbook. |
| How does MatchMaker fit? | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md). |
| How do Social or Messaging work? | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md) | Messaging docs, social runtime evidence, social projection runbooks. |
| How do Feedback or Reporting work? | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md) | Admin Operations, Social/Messaging, Media Storage, and Observability. |
| How do Writing or Publishing work? | [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md) | Write/publishing runtime evidence, Reader and Media master documents. |
| How do Admin or operational control surfaces work? | [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md) | Firestore safety docs, Projection/Recovery, Observability. |
| How do Media, Attachments, Uploads, or Storage work? | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md) | Attachment docs, upload lock, media projection runbooks. |
| How do Metrics, Monitoring, Health, or Analytics work? | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md) | Firestore monitoring docs, system metrics/events runbooks. |
| How do AI or intelligence systems work? | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) | MatchMaker, author recommendation, Identity Graph, and intelligence runbooks. |
| How do Discovery or Home work? | [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md) | Discovery architecture docs, Search, AI/Intelligence, Product Map. |
| How do Shelves work? | [MASTER_SHELVES.md](MASTER_SHELVES.md) | Shelf runtime, user library, shelf projection runbooks. |
| How do Quotes or Reviews work? | [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md) | Ontology, Catalog, quote/review runbooks. |
| How do Authors work? | [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md) | [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md), Catalog, Entity Platform, author recommendation docs. |
| How do Contracts or APIs work? | [MASTER_CONTRACTS_API.md](MASTER_CONTRACTS_API.md) | Shared contracts, callable wrappers, owning domain Master docs. |
| How does the Design System work? | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md) | Design-system register and routed design-system authority docs. |
| How do SSR or Public Web work? | [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md) | SSR runtime, owning product Master docs, Design System. |
| How do Spaces or Venues work? | [MASTER_SPACES_VENUES.md](MASTER_SPACES_VENUES.md) | Admin Operations, Social/Messaging, Public Web, Entity Platform if literary-place authority is involved. |
| What is product-facing vs infrastructure? | [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md) | [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md). |
| What should AI ignore? | This document | Documents marked archived, superseded, or evidence-only unless history is requested. |
| Where are migrated audit records? | [Audit Evidence README](../audits/evidence/README.md) | Evidence files only after active authority has been read. |
| Where are archived legacy records? | [Archive README](../archive/README.md) | Historical files only when legacy context is requested. |
| What qualifies as Canon? | [CANON_OVERVIEW.md](../canon/CANON_OVERVIEW.md) | [CANON_AUTHORITY_MODEL.md](../canon/CANON_AUTHORITY_MODEL.md), [CANON_PROMOTION_POLICY.md](../canon/CANON_PROMOTION_POLICY.md). |
| Which documents are Canon candidates? | [CANON_REGISTRY.md](../canon/CANON_REGISTRY.md) | Candidate source documents only as evidence. |
| What is BookTown ultimately becoming? | [BOOKTOWN_FINAL_PRODUCT_VISION.md](../vision/BOOKTOWN_FINAL_PRODUCT_VISION.md) | [README.md](../vision/README.md), Canon documents if permanent truth is involved. |
| What is Literary Intelligence? | [LITERARY_INTELLIGENCE_VISION.md](../vision/LITERARY_INTELLIGENCE_VISION.md) | Master and architecture docs only for current-state implementation questions. |
| How should BookTown feel to use? | [EXPERIENCE_VISION.md](../vision/EXPERIENCE_VISION.md) | Product and design documents only for current execution details. |

## Domain Lookup Table

| Domain | Route First | Authority / Evidence |
|---|---|---|
| Books | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [WORK_EDITION_MANIFESTATION_AUTHORITY.md](../architecture/catalog/WORK_EDITION_MANIFESTATION_AUTHORITY.md), [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md), [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md) |
| Catalog | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [DATA_PIPELINE.md](../architecture/catalog/DATA_PIPELINE.md), [WORK_EDITION_MANIFESTATION_AUTHORITY.md](../architecture/catalog/WORK_EDITION_MANIFESTATION_AUTHORITY.md), [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md) |
| Authors | [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md) | [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md), [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md), author architecture docs |
| Quotes | [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md) | [QUOTES_REVIEWS_AUTHORITY.md](../architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md), [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md), quote runbooks |
| Reader | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md) |
| Search | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md) |
| Discovery | [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md) | [DISCOVERY_HOME_REGISTER.md](../architecture/discovery/DISCOVERY_HOME_REGISTER.md), [DISCOVERY_MODULE_AUTHORITY.md](../architecture/discovery/DISCOVERY_MODULE_AUTHORITY.md), [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md) |
| Shelves | [MASTER_SHELVES.md](MASTER_SHELVES.md) | [SHELVES_ARCHITECTURE.md](../architecture/shelves/SHELVES_ARCHITECTURE.md), shelf runtime authority and projection runbooks |
| Social | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md) | Social runtime, social execution audits, post engagement runbook |
| Messaging | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md) | [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md) |
| Writing / Publishing | [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md) | Write/publishing runtime and execution audit |
| MatchMaker | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md) |
| Entity Platform | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md) | [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md), [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md), [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md) |
| Meaning Unit Authority | [MEANING_UNIT_AUTHORITY.md](../architecture/entity-platform/MEANING_UNIT_AUTHORITY.md) | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md), [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md), [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md) |
| Literary Graph | [LITERARY_GRAPH_AUTHORITY.md](../architecture/literary-graph/LITERARY_GRAPH_AUTHORITY.md) | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md), [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md) |
| Identity Graph | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) | [LITERARY_IDENTITY_GRAPH.md](../architecture/entity-platform/LITERARY_IDENTITY_GRAPH.md), entity interaction contracts |
| Affinity Layer | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) | Author recommendation and MatchMaker docs |
| AI Librarian | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) | AI runtime, beta audit, governance references |
| Admin | [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md) | Firestore safety docs, admin/control runtime |
| Feedback / Reporting | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md) | Admin Operations, Social/Messaging, Media Storage, feedback runtime |
| Projection System | [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) | [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md), [ProjectionRegistry.md](../architecture/ProjectionRegistry.md), runbooks |
| Media | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md) | Attachment runtime, storage rules, media docs |
| SSR | [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md) | [PUBLIC_WEB_REGISTER.md](../architecture/public-web/PUBLIC_WEB_REGISTER.md), SSR runtime and hosting config |
| Spaces / Venues | [MASTER_SPACES_VENUES.md](MASTER_SPACES_VENUES.md) | Spaces runtime, venue surfaces, venue stats deprecation runbook |
| Design System | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md) | [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md), [DESIGN_GOVERNANCE.md](../architecture/design-system/DESIGN_GOVERNANCE.md) |
| Contracts | [MASTER_CONTRACTS_API.md](MASTER_CONTRACTS_API.md) | [CONTRACTS_API_REGISTER.md](../architecture/contracts/CONTRACTS_API_REGISTER.md), `contracts/*`, callable wrappers, contract parity docs |
| Observability | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md) | Operations runtime, monitoring docs, metrics runbooks |

## Architecture Routing

| Architecture Area | Read |
|---|---|
| Canonical ontology | [BOOKTOWN_CANONICAL_ONTOLOGY_V2.md](../BOOKTOWN_CANONICAL_ONTOLOGY_V2.md) |
| Work/catalog authority | [WORK_EDITION_MANIFESTATION_AUTHORITY.md](../architecture/catalog/WORK_EDITION_MANIFESTATION_AUTHORITY.md), [WORK_AUTHORITY_SOURCE_LAW.md](../architecture/WORK_AUTHORITY_SOURCE_LAW.md), [DATA_PIPELINE.md](../architecture/catalog/DATA_PIPELINE.md) |
| Entity Platform | [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md), [ENTITY_PLATFORM_VISION.md](../architecture/entity-platform/ENTITY_PLATFORM_VISION.md), [ENTITY_REGISTRY.md](../architecture/entity-platform/ENTITY_REGISTRY.md), [LITERARY_ENTITY_CONTRACTS.md](../architecture/entity-platform/LITERARY_ENTITY_CONTRACTS.md) |
| Meaning Unit Authority | [MEANING_UNIT_AUTHORITY.md](../architecture/entity-platform/MEANING_UNIT_AUTHORITY.md), then [ENTITY_PLATFORM_AUTHORITY.md](../architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md) |
| Materializing entities | [MATERIALIZING_ENTITIES.md](../architecture/entity-platform/MATERIALIZING_ENTITIES.md) |
| Search | [SEARCH-ARCHITECTURE-REGISTER.md](../architecture/search/SEARCH-ARCHITECTURE-REGISTER.md) |
| Reader | [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md), [READER_MOBILE_SLOS.md](../architecture/READER_MOBILE_SLOS.md), [READER_STRESS_CORPUS.md](../architecture/READER_STRESS_CORPUS.md) |
| Projection System | [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md), [ProjectionRegistry.md](../architecture/ProjectionRegistry.md), [ProjectionRecoveryFramework.md](../architecture/ProjectionRecoveryFramework.md) |
| MatchMaker | [MATCHMAKER_REGISTER.md](../architecture/matchmaker/MATCHMAKER_REGISTER.md) |
| Literary Graph | [LITERARY_GRAPH_AUTHORITY.md](../architecture/literary-graph/LITERARY_GRAPH_AUTHORITY.md), then [LITERARY-GRAPH-ARCHITECTURE-REGISTER.md](../architecture/literary-graph/LITERARY-GRAPH-ARCHITECTURE-REGISTER.md) |
| Messaging | [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md) |
| Social and Messaging | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md) |
| Feedback and Reporting | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md) |
| Writing and Publishing | [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md) |
| Admin and Operations | [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md) |
| Media and Storage | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md) |
| Observability | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md) |
| AI and Intelligence | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md) |
| Discovery and Home | [DISCOVERY_HOME_REGISTER.md](../architecture/discovery/DISCOVERY_HOME_REGISTER.md), [MASTER_DISCOVERY_HOME.md](MASTER_DISCOVERY_HOME.md) |
| Shelves | [SHELVES_ARCHITECTURE.md](../architecture/shelves/SHELVES_ARCHITECTURE.md), [MASTER_SHELVES.md](MASTER_SHELVES.md) |
| Quotes and Reviews | [QUOTES_REVIEWS_AUTHORITY.md](../architecture/quotes/QUOTES_REVIEWS_AUTHORITY.md), [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md) |
| Author System | [AUTHOR_AUTHORITY.md](../architecture/authors/AUTHOR_AUTHORITY.md), then [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md) |
| Contracts and API | [CONTRACTS_API_REGISTER.md](../architecture/contracts/CONTRACTS_API_REGISTER.md), [MASTER_CONTRACTS_API.md](MASTER_CONTRACTS_API.md) |
| Design System | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md) |
| Public Web | [PUBLIC_WEB_REGISTER.md](../architecture/public-web/PUBLIC_WEB_REGISTER.md), [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md) |
| Spaces and Venues | [MASTER_SPACES_VENUES.md](MASTER_SPACES_VENUES.md) |
| Design System Register | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md), then [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md) |

## Operations Routing

| Operational Question | Read |
|---|---|
| Projection recovery status | [ProjectionRegistry.md](../architecture/ProjectionRegistry.md), relevant `docs/operations/projections/*RecoveryRunbook.md` |
| Projection certification | [ProjectionCertificationGate.md](../operations/ProjectionCertificationGate.md), [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md) |
| Firestore safety | [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md), [FIRESTORE_AUDIT_REPORT.md](../engineering/FIRESTORE_AUDIT_REPORT.md) |
| Monitoring | [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md), system metrics runbooks |
| Reader performance/device evidence | [READER_STRESS_CORPUS.md](../architecture/READER_STRESS_CORPUS.md), `reports/reader-device-lab/latest.md` |
| Admin/control operations | Admin/control runtime, Firestore safety docs, projection runbooks |
| Social or messaging operations | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), relevant social/messaging runbooks |
| Feedback or reporting operations | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md), Admin Operations, and relevant feedback/reporting runtime evidence |
| Media or storage operations | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md), attachment and cover runbooks |
| Observability operations | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md), metrics/events/health runbooks |
| Intelligence operations | [MASTER_AI_INTELLIGENCE.md](MASTER_AI_INTELLIGENCE.md), intelligence aggregate and signal queue runbooks |
| Shelf operations | [MASTER_SHELVES.md](MASTER_SHELVES.md), shelf and user library runbooks |
| Review operations and load gate | [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md), [REVIEW_STACK_SLO.md](../operations/REVIEW_STACK_SLO.md) |
| Public web operations | [MASTER_PUBLIC_WEB.md](MASTER_PUBLIC_WEB.md), observability and hosting/runtime evidence |
| Spaces or venue operations | [MASTER_SPACES_VENUES.md](MASTER_SPACES_VENUES.md), venue stats and admin/control routing |

## Governance Routing

| Governance Question | Read |
|---|---|
| Documentation routing | This file, [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) |
| Canon definition and authority | [CANON_OVERVIEW.md](../canon/CANON_OVERVIEW.md), [CANON_AUTHORITY_MODEL.md](../canon/CANON_AUTHORITY_MODEL.md) |
| Canon promotion and demotion | [CANON_PROMOTION_POLICY.md](../canon/CANON_PROMOTION_POLICY.md), [CANON_REGISTRY.md](../canon/CANON_REGISTRY.md) |
| Vision layer purpose and boundaries | [README.md](../vision/README.md) |
| Documentation operating system | [DOCS_GOVERNANCE.md](../governance/DOCS_GOVERNANCE.md) |
| Document lifecycle states and metadata | [DOCUMENT_LIFECYCLE_POLICY.md](../governance/DOCUMENT_LIFECYCLE_POLICY.md) |
| Authority change handling | [AUTHORITY_CHANGE_POLICY.md](../governance/AUTHORITY_CHANGE_POLICY.md), [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md) |
| AI documentation consumption | [AI_CONSUMPTION_POLICY.md](../governance/AI_CONSUMPTION_POLICY.md), this file |
| Archive and superseded handling | [ARCHIVE_POLICY.md](../governance/ARCHIVE_POLICY.md) |
| Engineering standards | [CODING_STANDARDS.md](../../CODING_STANDARDS.md), [CODEX_RULES.md](../engineering/CODEX_RULES.md) |
| Firestore scan safety | [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md), [FIRESTORE_SCRIPT_QUARANTINE.md](../engineering/FIRESTORE_SCRIPT_QUARANTINE.md) |
| Projection governance | [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md), [ProjectionRegistry.md](../architecture/ProjectionRegistry.md) |
| Design governance | [DESIGN_GOVERNANCE.md](../architecture/design-system/DESIGN_GOVERNANCE.md), [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md) |
| Design accessibility | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md), then [ACCESSIBILITY_SYSTEM.md](../architecture/design-system/ACCESSIBILITY_SYSTEM.md) |
| RTL/LTR design behavior | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md), then [RTL_LTR_SYSTEM.md](../architecture/design-system/RTL_LTR_SYSTEM.md) |
| Component inventory | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md), then [COMPONENT_INVENTORY.md](../architecture/design-system/COMPONENT_INVENTORY.md) |

## Audit Routing

| Audit Need | Read |
|---|---|
| Current closed beta posture | [closed_beta_readiness_audit.md](../audits/evidence/audit/closed_beta_readiness_audit.md), [PHASE_8_BETA_READINESS.md](../audits/evidence/reports/PHASE_8_BETA_READINESS.md) |
| Search issues/evidence | [search_audit.md](../audits/evidence/audit/search_audit.md), [SEARCH_QUALITY_REPORT.md](../audits/evidence/reports/SEARCH_QUALITY_REPORT.md) |
| Canonical authority evidence | [canonical_authority_audit.md](../audits/evidence/audit/canonical_authority_audit.md) |
| Type/contract drift evidence | [type_integrity_architecture_audit.md](../audits/evidence/audit/type_integrity_architecture_audit.md), T1-T7 execution audits |
| Security evidence | [security_audit.md](../audits/evidence/audit/security_audit.md) |
| Scalability/performance evidence | [scalability_audit.md](../audits/evidence/audit/scalability_audit.md), [performance_audit.md](../audits/evidence/audit/performance_audit.md) |
| Mock/production truth evidence | [mock_contamination_production_truth_audit.md](../audits/evidence/audit/mock_contamination_production_truth_audit.md), Phase A audits |

## Authority Rules For AI

1. Never infer authority from filename alone.
2. Prefer Master routing over direct search results.
3. Treat audit files as evidence, not operating truth.
4. Treat completion files as implementation history, not current governance.
5. Do not promote a proposal to authority unless a Master document, ADR, locked register, or governance doc says so.
6. When a document says `under discussion`, `draft`, `proposal`, or `not started`, do not treat it as locked architecture.
7. When a domain has a runtime authority and documentation authority mismatch, report the mismatch instead of choosing silently.

## Layer Routing

| Layer | AI Use |
|---|---|
| Canon | Permanent product/platform truth and Canon governance. Product/platform truth is Canon only when explicitly promoted and listed in the Canon registry. |
| Vision | Long-term product direction, Literary Intelligence direction, and user experience destination. |
| Master | Start here for system, product, authority, and routing questions. |
| ADR | Use for locked decision history. |
| Architecture | Use for domain behavior and boundaries. |
| Governance | Use for rules and required process. |
| Operations | Use for recovery, monitoring, runbooks, and incident response. |
| Audits | Use for findings and evidence after reading active authority. Start at [Audit Evidence README](../audits/evidence/README.md) for migrated evidence. |
| Archive | Use only for historical context. Start at [Archive README](../archive/README.md) for migrated legacy, superseded, duplicate, and placeholder records. |

## Deterministic Conflict Handling

If two documents disagree:

1. Check whether one is routed by `MASTER_AUTHORITY_MATRIX.md`.
2. Check whether one is locked or an ADR.
3. Check whether one is an audit, completion report, or superseded reference.
4. Prefer runtime authority only when documentation authority is missing or known stale.
5. Report unresolved conflicts explicitly.
