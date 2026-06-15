---
id: BT-TIER1-ENTITY-STABILIZATION-PROGRAM-001
title: "BookTown Tier-1 Entity Stabilization Program"
status: draft
authority_level: implementation_plan
owner: entity-platform
source_of_truth: false
ai_read: true
---

# BookTown Tier-1 Entity Stabilization Program

## Scope

This program stabilizes Work, Author, and Quote as governed Tier-1 literary
entities before Search Entity Migration, Literary Graph productization,
Discovery expansion, or MatchMaker expansion.

This document does not authorize new literary atoms, Search UX changes,
ranking changes, graph product modules, recommendation systems, migrations, or
Firestore schema changes.

## Execution Order

1. Preserve Book/WEM as the reference implementation.
2. Harden Author runtime lifecycle and bibliography authority.
3. Harden Quote lifecycle, attribution, and entity-summary compatibility.
4. Standardize Tier-1 eligibility policy for Search, Identity Graph, Literary
   Graph, and MatchMaker.
5. Verify UserEntityInteraction write-through for Book, Author, and Quote.

## Files Affected

- `contracts/entityPlatform/entityRefFactories.ts`
- `contracts/entityPlatform/entityTypes.ts`
- `contracts/entityPlatform/lifecycle.ts`
- `lib/domain/tier1/tier1EntityPolicy.ts`
- `lib/quotes/quoteEntitySummaryAdapter.ts`
- `test/domain/tier1/tier1EntityPolicy.test.ts`
- `test/domain/quotes/quoteEntitySummaryAdapter.test.ts`
- `test/domain/entityPlatform/entityRefFactories.test.ts`

## Contracts Affected

- `LiteraryEntityRef` factory options now support `mergeTarget`, matching the
  existing reference contract.
- Entity authority states now include `split` and `superseded`, matching locked
  Entity Platform lifecycle doctrine.
- Entity lifecycle states now include `split` and `superseded`, matching locked
  Entity Platform lifecycle doctrine.
- Quote now has a dedicated `EntitySummary` adapter.
- Tier-1 eligibility is centralized for Work, Author, and Quote.

## Tests Required

- Quote entity summary identity and projection tests.
- Tier-1 eligibility tests for canonical, resolved, candidate, merged, and
  unsupported entities.
- Entity ref factory tests for merge target preservation.
- Existing Search, Identity Graph, and Entity Platform compatibility tests.

## Migration Risks

- Adding lifecycle literals is additive and should not invalidate existing data.
- `mergeTarget` factory support is additive and only exposes a field already
  present on `LiteraryEntityRef`.
- Quote summaries remain projections and must not become attribution authority.

## Authority Risks

- Resolved or candidate entities must not feed Identity Graph, Literary Graph,
  MatchMaker, or public canonical exposure.
- Merged entities must resolve to survivors before downstream use.
- Quote `bookId` and `authorId` remain attribution context unless routed through
  their owning authorities.
- Quote themes, concepts, keywords, and tags remain evidence only.

## Success Criteria

- Work, Author, and Quote can all produce `LiteraryEntityRef`.
- Work, Author, and Quote can all produce or route to `EntitySummary`.
- Lifecycle vocabulary consistently supports merge, split, supersession, and
  archival handling.
- Search eligibility is explicit and degraded for non-canonical resolved refs.
- Graph, Identity Graph, and MatchMaker eligibility require active canonical
  Tier-1 refs.
- No Search behavior changes.
- No authority boundary regressions.

## Phase Exit Criteria

### Phase 1: Contract Stabilization

- Additive lifecycle and merge-target factory support exists.
- Dedicated Quote `EntitySummary` adapter exists.
- Tier-1 eligibility policy tests pass.

### Phase 2: Runtime Verification

- Book, Author, and Quote interactions are audited for canonical
  `UserEntityInteraction` write-through.
- Missing write paths are documented or implemented through owning domains.

### Phase 3: Readiness Gate

- Search Entity Migration remains contract-only until result contracts and
  locked Search UX authority permit product exposure.
- Literary Graph productization remains blocked until graph eligibility and
  relationship authority are implemented.
- MatchMaker expansion remains blocked until privacy-safe entity affinity
  snapshots are verified.
