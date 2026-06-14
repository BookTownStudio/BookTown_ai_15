---
id: BT-PROJECT-SOURCES-AUTHORITY-INDEX-V2
title: "BookTown Project Sources Authority Index v2"
status: active
authority_level: project_sources
owner: documentation-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Project Sources Authority Index v2

## Purpose

This folder is the candidate-primary Project Sources authority library for long-term BookTown architectural memory, ChatGPT Project retrieval, and future conversation alignment. It is prepared for promotion after validation and correction approval.

These files consolidate locked doctrine. They do not authorize runtime changes, Firestore changes, Functions changes, Rules changes, Index changes, UI changes, Search implementation changes, MatchMaker implementation changes, Factory implementation changes, migrations, or production behavior changes.

## Authority Hierarchy

| Rank | Document | Authority Scope |
|---|---|---|
| 1 | [01_BOOKTOWN_PRODUCT_CONSTITUTION_V2.md](01_BOOKTOWN_PRODUCT_CONSTITUTION_V2.md) | Product identity, purpose, principles, boundaries, and strategic direction. |
| 2 | [02_BOOKTOWN_ARCHITECTURE_CANON_V2.md](02_BOOKTOWN_ARCHITECTURE_CANON_V2.md) | Foundational architecture, authority ownership, entity, meaning, graph, Search, and MatchMaker doctrine. |
| 3 | [03_BOOKTOWN_SCHEMA_CANON_V2.md](03_BOOKTOWN_SCHEMA_CANON_V2.md) | Data authority, collection ownership, projection doctrine, entity references, and graph/meaning schema boundaries. |
| 4 | [04_BOOKTOWN_PRODUCT_EXPERIENCE_CANON_V2.md](04_BOOKTOWN_PRODUCT_EXPERIENCE_CANON_V2.md) | Product surface authority, UX boundaries, and consumer responsibilities. |
| 5 | [05_BOOKTOWN_EXECUTION_CANON_V2.md](05_BOOKTOWN_EXECUTION_CANON_V2.md) | Execution doctrine, sequencing, dependency order, and beta-readiness posture. |
| 6 | [06_BOOKTOWN_PERMANENT_CONTEXT_V2.md](06_BOOKTOWN_PERMANENT_CONTEXT_V2.md) | Stable long-term context for future conversations and retrieval. |

## Locked Source Authorities

| Lock / Register | Routed Source |
|---|---|
| BT-WEM-LOCK-001 | `docs/architecture/catalog/WORK_EDITION_MANIFESTATION_AUTHORITY.md` |
| BT-AUTHOR-DOCTRINE-LOCK-001 | `docs/architecture/authors/AUTHOR_AUTHORITY.md` |
| BT-ENTITY-PLATFORM-LOCK-001 | `docs/architecture/entity-platform/ENTITY_PLATFORM_AUTHORITY.md` |
| BT-MEANING-UNIT-LOCK-001 | `docs/architecture/entity-platform/MEANING_UNIT_AUTHORITY.md` |
| BT-LITERARY-GRAPH-LOCK-001 | `docs/architecture/literary-graph/LITERARY_GRAPH_AUTHORITY.md` |
| BookTown Authority Ownership Model v1 | Consolidated into Architecture Canon and Schema Canon. |
| BookTown Data Model & Firestore Schema v2 | Consolidated into Schema Canon as authority model; implementation schema remains future work. |
| Search Architecture Register | `docs/master/MASTER_SEARCH.md` and routed search register. |
| MatchMaker Architecture Register | `docs/architecture/matchmaker/MATCHMAKER-ARCHITECTURE-REGISTER.md` and routed MatchMaker docs. |

## Cross-Reference Map

| Question | Start Here | Then Route To |
|---|---|---|
| What is BookTown? | Product Constitution | Permanent Context |
| What owns Work, Edition, and Manifestation truth? | Architecture Canon | WEM authority document |
| What owns Author identity? | Architecture Canon | Author Authority |
| What is an Entity? | Architecture Canon | Entity Platform Authority |
| What owns Theme and Concept? | Architecture Canon | Meaning Unit Authority |
| What owns literary relationships? | Architecture Canon | Literary Graph Authority |
| What is authority vs projection? | Schema Canon | Master Authority Matrix |
| What owns Search? | Architecture Canon | Master Search |
| What owns MatchMaker? | Architecture Canon | MatchMaker Architecture Register |
| What is the UX boundary for a surface? | Product Experience Canon | Master Product Map |
| What must happen first? | Execution Canon | Master System Map and roadmap docs |

## Legacy Source Mapping

| Legacy Source | Status | New Authority |
|---|---|---|
| Full PRD BookTown | Historical Reference | Product Constitution v2 |
| Architecture Overview | Superseded | Architecture Canon v2 |
| Foundation & Extended Context | Absorbed | Permanent Context v2 |
| Data Model & Firestore Schema | Superseded for authority questions | Schema Canon v2 |
| Permanent Context File | Superseded | Permanent Context v2 |
| Product feature notes | Routed | Product Experience Canon v2 plus Master Product Map |
| Old execution roadmap | Routed | Execution Canon v2 |

## Governance Rules

1. These files are retrieval authorities, not implementation specifications.
2. If a Project Source conflicts with a locked foundation, the locked foundation wins.
3. After promotion, if a legacy document conflicts with this folder, this folder wins for Project Source context.
4. Runtime truth remains in code and production data; this folder governs doctrine and routing.
5. Search, MatchMaker, Public Web, Reader, Publishing, and product surfaces consume foundation authority; they do not create it.
