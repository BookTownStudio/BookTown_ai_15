---
id: BT-PROJECT-SOURCES-EXECUTION-CANON-V2
title: "BookTown Execution Canon v2"
status: active
authority_level: project_sources
owner: execution-governance
last_audited: 2026-06-14
source_of_truth: true
ai_read: true
---

# BookTown Execution Canon v2

## Authority Scope

This document is the execution authority for Project Source retrieval. It defines sequencing doctrine, dependency order, and readiness posture. It does not propose implementation details or migrations.

## Execution Doctrine

Execution must follow authority order:

1. Lock doctrine.
2. Define authority ownership.
3. Define schema authority.
4. Align contracts.
5. Align projections.
6. Validate runtime conformance.
7. Expose UX.
8. Expand public and intelligence surfaces.

UX implementation must not precede unresolved authority for the truth it displays.

## Priority Hierarchy

| Priority | Work Class |
|---|---|
| P0 | Foundation correctness, source-of-truth routing, schema authority, projection safety, beta safety. |
| P1 | Product completeness for constrained beta surfaces. |
| P2 | Expansion surfaces, messaging depth, public web breadth, spaces/venues, advanced intelligence. |
| P3 | Future enrichment and optional product growth. |

## Foundation Dependencies

| Dependency | Must Precede |
|---|---|
| WEM | Search correctness, Reader access, Book Details, Public Web, MatchMaker Work candidates |
| Author Authority | Author Details, bibliography, Author search, Author graph nodes |
| Entity Platform | Search entities, social attachments, MatchMaker candidates, Graph nodes |
| Meaning Unit Authority | Theme/Concept search, graph nodes, MatchMaker meaning explanations |
| Literary Graph | Related works, graph discovery, canonical relationship display, graph-backed MatchMaker |
| Schema authority model | Schema v2 authoring and runtime conformance audits |

## Recommended Execution Sequence

| Phase | Objective |
|---|---|
| Phase 0 | Authority and schema model consolidation. |
| Phase 1 | WEM, Author, Entity, Meaning, and Graph runtime conformance audits. |
| Phase 2 | Projection boundary certification for Search, Reader, Public Web, and social render surfaces. |
| Phase 3 | Contract alignment for entity refs, summaries, graph refs, and MatchMaker candidates. |
| Phase 4 | Constrained beta surface readiness: Reader, Search, Catalog, Shelves, selected Discovery. |
| Phase 5 | MatchMaker Home Dynamic Discovery first, then Literary Graph product surfacing under strict derived-vs-canonical labeling. |
| Phase 6 | Public Web, Publishing, Social, Messaging, and AI expansion after safety gates. |

## Beta Readiness Definition

A surface is beta-ready only when:

- it consumes authority from the owning domain;
- projection data is recoverable or explicitly bounded;
- candidate/evidence/derived data cannot be mistaken for canonical truth;
- contracts are stable and typed;
- admin/recovery paths exist for high-risk data;
- public exposure rules are known;
- tests or audit evidence cover the critical user path.

Closed-beta readiness is constrained. The full application is not beta-ready as a broad public surface. The first viable beta path is the authenticated reading loop: Search -> Book Details -> Acquire/Read -> Reader -> Shelf, with feedback and any AI exposure gated by separate approval.

## Non-Negotiable Ordering Rules

1. Search must consume WEM and Author authority.
2. MatchMaker must not precede Entity Platform, Meaning Unit, and Literary Graph authority for graph/meaning-based outputs.
3. MatchMaker V1 sequencing starts with Home Dynamic Discovery. Search, Search Results, Reader, Social, Notifications, and Messaging are not approved MatchMaker consumers in V1.
4. Public Web must not expose unresolved authority.
5. Schema v2 must start from authority ownership, not collection naming.
6. Runtime conformance follows doctrine; doctrine does not imply conformance.

## Cross-References

- [Architecture Canon](02_BOOKTOWN_ARCHITECTURE_CANON_V2.md)
- [Schema Canon](03_BOOKTOWN_SCHEMA_CANON_V2.md)
- [Product Experience Canon](04_BOOKTOWN_PRODUCT_EXPERIENCE_CANON_V2.md)
- `docs/master/MASTER_SYSTEM_MAP.md`
