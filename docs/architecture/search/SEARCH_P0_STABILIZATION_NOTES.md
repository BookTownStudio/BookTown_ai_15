---
id: BT-DOCS-ARCHITECTURE-SEARCH-P0-STABILIZATION-NOTES
title: "BookTown Search P0 Stabilization Notes"
status: active
authority_level: engineering_note
owner: search-platform
last_audited: 2026-06-14
source_of_truth: false
ai_read: true
---

# BookTown Search P0 Stabilization Notes

## Scope

This note records the P0 stabilization pass for the current work/book-centric search system. It does not authorize multi-entity search UI, Author cards, Quote cards, Theme cards, Concept cards, MatchMaker ranking, graph ranking, semantic search, or AI-generated canonical entities.

Search results remain projections. Search does not create canonical entities. Book Details owns deeper acquisition and read decisions. Normal Search is not a MatchMaker consumer in V1.

## Contract And DTO Review

Current search DTO/type surfaces:

- `contracts/bookSearch.ts`
- `types/bookSearch.ts`
- `functions/src/contracts/shared/bookSearch.ts`
- `contracts/apiContracts.ts`
- `functions/src/library/search/searchEngine.ts`

The current public result contract is intentionally book/work-centric:

- `resultType`: `canonical | external`
- `workType`: `work | edition`
- `source`: `booktown | googleBooks | openLibrary`
- availability/readability fields are response projections, not authority

No multi-entity result type was added in this pass.

## Golden Query Coverage

`functions/src/library/search/__tests__/searchHarness.test.ts` now includes an explicit P0 golden matrix for:

- exact title
- ISBN
- bounded typo
- author intent
- external fallback
- duplicate prevention
- canonical-first ranking

The matrix consolidates stabilization expectations without changing ranking behavior.

Combined title-plus-author recall remains a documented blocker: `Pride and Prejudice Jane Austen` currently returns no local canonical rows in the harness. This pass did not change scoring or retrieval behavior to fix that gap because it would be an observable Search Contract change.

## Ranking Constants

The current ranker is deterministic and contract-bound. These constants are behavioral authority until a versioned Search Contract change updates them with tests.

| Constant / Adjustment | Current Value | Intended Effect |
|---|---:|---|
| `CONFIDENCE_THRESHOLD` | `0.72` | Reject weak non-exact rank candidates unless explicit fallback rules admit them. |
| `EXTERNAL_FALLBACK_TRIGGER` | `5` | Query external providers when canonical recall is thin or top canonical quality is weak. |
| `LOW_CONFIDENCE_COVERAGE_THRESHOLD` | `0.6` | Mark top-three canonical coverage as weak when all top coverage scores are below threshold. |
| unknown-author penalty | `-1.25` | Demote rows that lack credible author identity. |
| canonical primary work boost under author intent | `+2.4` | Keep primary works above biography/criticism/collections for author queries. |
| biography/criticism penalty under author intent | `-2.45` | Demote secondary literature for author queries. |
| anthology penalty under author intent | `-2.45` | Demote collections/anthologies for author queries. |
| title-leading surname penalty | `-1.8` | Reduce false author-dominant rows that lead with an author name but are not primary works. |
| hard secondary title penalty | `-2.85` | Push obvious companion/reader/biography/study rows below primary works. |
| strong title-family work boost | `+0.65` | Prefer compact primary work rows for title-family matches outside author intent. |
| exact short classic title boost | `+5.4 canonical / +4.4 external` | Protect exact classic work titles from lexical contamination. |
| exact-title superstring penalty | `-3.6` | Demote derivative titles that merely start with the queried title. |
| derivative title penalty under title intent | `-2.2 / -2.7` | Keep study/analysis/collection rows below the primary work. |
| transliteration fallback multiplier | `0.85` | Add transliteration-derived rows only after primary results and with a penalty. |

Scoring behavior was not changed in this pass.

## Telemetry Review

Current telemetry surfaces:

- query telemetry: `search_logs`
- latency metric: `search_latency`
- quality flags: `search_quality_flags`
- click telemetry: `search_clicks`

Current telemetry is operational and product-useful, but it is not yet the canonical Literary Identity Graph interaction ledger. A future phase should map search selections into privacy-safe `searched` / `viewed` user-entity interaction events after the entity reference contract is introduced.

## Pagination Risk

Current pagination uses an offset cursor plus a query fingerprint. This is deterministic for a stable result set, but it can skip or duplicate results if indexed data or provider fallback output changes between page requests.

P0 action is documentation only. A future contract change should move to a stable cursor derived from the ranked sort key, or to a stored query snapshot for high-value search sessions.

## Locked Authority File Availability

The request referenced:

- `BookTown — Search Results List v1.1 (LOCKED).docx`
- `BookTown — Book Details Full Experience v1.1 (LOCKED).docx`

These files were not found in the repository or current Codex attachment directory during the P0 pass. Search and Book Details conformance remains validated against the available Markdown authorities and runtime implementation until those locked DOCX authorities are added to the workspace.

## Remaining P0 Blockers

- Locked DOCX authority files must be added or explicitly replaced by Markdown authorities.
- Combined title-plus-author recall needs a versioned behavior decision and golden tests before implementation.
- Ranking constants need product-approved rationale before future behavior changes.
- Pagination requires a versioned contract change before a stable-cursor redesign.
- Telemetry should not feed ranking or MatchMaker until canonical entity interaction boundaries are approved.
