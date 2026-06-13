---
id: BT-AUDIT-PHASET0-TYPE-INTEGRITY-EXECUTION-AUDIT
title: "BookTown Phase T0 Type Integrity Execution Audit"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/phaseT0_type_integrity_execution_audit.md
---

# BookTown Phase T0 Type Integrity Execution Audit

Date: 2026-05-07  
Mode: Strict read-only execution planning audit  
Scope: Type integrity and contract authority stabilization map only

## Executive Summary

Phase T0 result: Type Integrity stabilization is executable, but only if sequenced around the real drift topology.

The current production build is truthful for bundle/runtime viability but not truthful for TypeScript architecture. `npm run build` succeeds because Vite transpiles without running the TypeScript compiler. `npm --prefix functions run build` succeeds because functions use a separate strict `functions/tsconfig.json` scoped to `functions/src` with tests excluded. Root `npx tsc --noEmit` fails because the root compiler scope includes frontend runtime, functions source under frontend compiler settings, tests, and newly isolated dev fixtures.

Required command results:

| Command | Result | Evidence |
|---|---:|---|
| `npx tsc --noEmit` | FAIL | 368 compiler errors across 106 files. |
| `npm run build` | PASS | Production truth check, Vite build, and bundle truth verification passed. |
| `npm --prefix functions run build` | PASS | Contract sync and functions `tsc` completed successfully. |

Compiler clustering:

| Cluster | Count | Architectural Meaning |
|---|---:|---|
| `TS2339` missing properties | 146 | React Query v5 state names, wrong generic inference, DTO drift, root compiler crossing function boundaries. |
| `TS2559` query filter misuse | 103 | React Query v5 requires filter objects; legacy array invalidations are still widespread. |
| `TS2345` argument mismatch | 32 | Mutation variables inferred as `void`, navigation type widening, cursor `unknown` leakage. |
| `TS2741` missing required fields | 30 | Fixture/schema drift, especially `Book.ontology`; DTO builders behind canonical contracts. |
| `TS2352` unsafe casts | 21 | UI casting domain objects to `Record<string, unknown>` instead of using typed serializers/guards. |
| Other errors | 36 | Zod v4 signature drift, Firebase adapter mismatch, browser global typing, test DTO drift, vite config typing. |

Top file/error concentration:

| File | Errors | Root Cause |
|---|---:|---|
| `lib/hooks/useProjectMutations.ts` | 35 | React Query v5 invalidation plus incorrect `useMutation` generic order. |
| `dev/fixtures/booktownMocks.ts` | 29 | Fixture data still typed against production `Book`/`User` shape after Phase A isolation. |
| `app/shelf-details.tsx` | 18 | `useShelfDetails` inference collapse plus mutation state naming. |
| `app/drawer/admin.tsx` | 17 | Operational mutations inferred as `void`; v5 mutation state drift. |
| `lib/hooks/useBookmarkToggle.ts` | 16 | Query filter object drift and optimistic cache ownership. |
| `services/librarySearchService.ts` | 14 | Firestore bootstrap contract mismatch: expects `db.raw` but `getFirebaseDb()` returns `Firestore`. |
| `lib/hooks/useFollowUser.ts` | 12 | Query key/invalidation drift across social/user stats caches. |
| `app/drawer/profile.tsx` | 11 | v5 mutation state drift plus missing toast dependency. |
| `lib/hooks/useNotifications.ts` | 10 | Infinite query v5 contract drift and cursor type leakage. |
| `lib/hooks/useAgentChat.ts` | 8 | Incorrect mutation generic order and legacy query filters. |

Execution decision: stabilize in five bounded waves. Do not start with broad schema refactors. First make compiler scope truthful, then fix React Query v5 architecture, then consolidate runtime contract authorities for search/book/shelf/reader/social, then clean non-runtime fixtures/tests.

## Runtime Critical Drift Analysis

Runtime-critical paths are the paths where TypeScript drift can hide real user-visible failure:

| Path | Runtime Criticality | Reason |
|---|---:|---|
| Home search and book opening | Critical | Search DTO drives details navigation, ebook acquisition, and read access. |
| Book details and acquisition | Critical | `Book` is cast to raw records for ebook fields; unsafe if backend shape changes. |
| Shelves and shelf entries | Critical | Optimistic mutation cache keys diverge from query keys; can show stale or wrong shelf state. |
| Reader manifest/progress/highlights/bookmarks | Critical | Callable contracts exist, but timestamp/cursor shapes vary across frontend, contracts, and functions. |
| Agent chat | Critical but intentionally unavailable for generic chat | Client cache/mutation typing is unstable; unavailable AI behavior is explicit from Phase A. |
| Notifications | High | Infinite query cursor is typed as `unknown`; optimistic count/cache updates use v4 filters. |
| Social comments/posts/bookmarks | High | Cross-cache optimistic updates touch feed, post detail, interaction snapshots, and comments. |
| Project publish/write | High | Mutation generics infer variables as `void`; publish variables and preflight results are not contract-stable. |
| Admin authority screens | Operational critical | Not broad consumer runtime, but controls canonical book/author/quote authority. |

Safe-to-defer zones:

| Zone | Reason |
|---|---|
| `dev/fixtures/booktownMocks.ts` schema errors | Not production runtime after Phase A; fix after compiler scopes are explicit. |
| Test DTO builders | Important for CI, but do not block runtime stabilization sequence. |
| Dormant placeholder hooks/screens | Not confirmed runtime-critical; keep out of first execution wave. |
| Cosmetic component prop drift | Fix with local component contract cleanup after React Query and DTO authorities are stable. |

## Runtime Critical Drift Matrix

| Area | Drift Type | Runtime Critical | Architectural Cause | Risk Level | Recommended Stabilization Order |
|---|---|---:|---|---:|---:|
| React Query hooks | v4 array filters, `isLoading`, missing `initialPageParam`, `keepPreviousData` | Yes | Mixed v4/v5 API assumptions and a thin wrapper that re-exports v5 without enforcing v5 patterns. | Critical | 2 |
| Mutation hooks | Variables inferred as `void` | Yes | Incorrect `useMutation<TData, TVariables>` generic usage; v5 second generic is error type, not variables. | Critical | 2 |
| Search/book DTO | Duplicate DTOs and backend local response type | Yes | `types/bookSearch.ts`, `contracts/apiContracts.ts`, and `functions/src/api.ts` each own part of the same shape. | Critical | 3 |
| Book details | `Book` cast to `Record<string, unknown>` | Yes | UI-facing legacy `Book` lacks typed ebook/acquisition view contract. | High | 3 |
| Shelf cache | Query key fragmentation and optimistic updates | Yes | Structured keys exist but many callers cast readonly keys to mutable arrays or append owner objects inconsistently. | High | 2 |
| Reader state | Timestamp/callable contract inconsistency | Yes | Contracts define schemas, while hooks and offline types own parallel runtime shapes. | High | 4 |
| Firestore adapter | `Firestore` vs `{ raw: Firestore }` mismatch | Yes for library search | Service layer has two Firebase access contracts. | High | 3 |
| Social attachments | Partial structured attachment casts | Yes for composer/social feed | `PostAttachment` mixes hydrated display payloads with create-request payloads. | High | 4 |
| Functions under root tsc | False frontend compiler errors | No for deployed functions | Root `tsconfig.json` compiles functions with frontend module assumptions. | Medium | 1 |
| Dev fixtures | Production type mismatch | No | Fixtures typed directly as canonical runtime entities. | Low | 5 |

## React Query Drift Topology

Measured drift:

| Signal | Count |
|---|---:|
| `isLoading` mutation state errors | 63 |
| Legacy query filter errors (`TS2559`) | 103 |
| Mutation variable inferred as `void` or accessed as `void` | 41 |
| Missing/incorrect infinite query `initialPageParam` | 3 |
| Deprecated `keepPreviousData` option | 3 |
| `as unknown as any[]` query key casts | 155 occurrences across 49 files |
| Direct `@tanstack/react-query` hook imports outside bridge | 13 files |

Primary topology:

| Hook/File | Drift Type | Runtime Risk | Migration Complexity | Priority |
|---|---|---|---:|---:|
| `lib/hooks/useProjectMutations.ts` | Wrong mutation generics, legacy invalidation arrays | Publish/write flows can reject valid variables at type layer and hide cache invalidation bugs. | Medium | P0 |
| `lib/hooks/useAgentChat.ts` | `useMutation<any, string>` makes variables `void`; legacy query filters | Chat send path typed incorrectly; optimistic rollback cache calls invalid under v5. | Low | P0 |
| `lib/hooks/useBookmarkToggle.ts` | Legacy cancel/invalidate filters, optimistic cache casts | Bookmark status can diverge from bookmark list and social counters. | Medium | P0 |
| `lib/hooks/useToggleBookOnShelf.ts` | Direct TanStack import, key casts, ownerId-appended cache key | Shelf entries and shelf list can update different cache keys. | Medium | P0 |
| `lib/hooks/useNotifications.ts` | Missing `initialPageParam`, cursor `unknown`, legacy filters | Infinite notifications can break pagination and optimistic unread count. | Medium | P1 |
| `lib/hooks/useThreadComments.ts` | Infinite query cast, legacy filters, unknown page data | Comment optimistic updates span comments, feed, post detail, and interaction snapshots. | Medium | P1 |
| `lib/hooks/useShelfDetails.ts` | Direct TanStack import, deprecated `keepPreviousData` | Shelf detail page loses typed `Shelf` inference and surfaces `NoInfer<TQueryFnData>`. | Low | P1 |
| `components/admin/CatalogAuthorityTab.tsx` | Mutation state drift | Admin authority workflows compile-unstable but operationally isolated. | Medium | P2 |
| `app/*` consumers | `isLoading` on mutation results | Mostly state-name drift, but can block compile and conceal real mutation type issues. | Low | P2 |

Required React Query decision: use v5 semantics directly. Do not introduce a v4 compatibility shim as the final architecture. A small local helper for `invalidateKey(queryClient, queryKey)` is acceptable only if it enforces `{ queryKey }` and accepts `readonly unknown[]`.

## Contract Authority Mapping

Current contract ownership is split:

| Entity | Current Authorities | Canonical Authority | Conflict Severity | Affected Layers |
|---|---|---|---:|---|
| Search result | `types/bookSearch.ts`, `contracts/apiContracts.ts`, `functions/src/api.ts` local `SearchBookResponse`, test builders | Shared Zod contract in `contracts/apiContracts.ts`, exported/inferred into frontend and functions | Critical | API, search service, Home, book details, tests |
| Book | `types/entities.ts` `Book`, root `types.ts`, backend `LibraryBook`, `BookEdition`, admin canonical schemas, fixtures | Backend canonical book/edition authority, frontend receives public view DTOs | Critical | Catalog, search, book details, shelves, reader, admin |
| Shelf | `types/entities.ts`, `contracts/apiContracts.ts`, backend shelf serializers, optimistic hook-local shapes | Backend shelf callable response schema | High | Shelves, profile, social attachment hydration |
| Reader manifest/progress | Contracts schemas, reader hooks, offline manager records, functions reader handlers | Functions reader callable contracts with generated frontend types | High | Reader, offline access, progress sync |
| Social post/attachment | `PostAttachment` display union, create attachment schemas, composer local casts, backend social schemas | Separate create DTO and hydrated display DTO | High | Composer, feed, post detail, attachments |
| Agent session/chat | `types/entities.ts`, `services/agents.types.ts`, `lib/agents/agentRegistry.tsx`, functions agent mutation | Backend agent session/chat persistence contract plus frontend registry for display only | Medium | Agent chat, discover, session history |
| User profile/stats | `types/entities.ts`, `services/db.types.ts`, contract `publicProfileSchema`, function profile schemas | Backend public/private profile DTO split | Medium | Profile, notifications, read tab stats |
| Admin canonical author/book/quote | Shared contract schemas and `lib/services/adminService.ts` DTOs | Shared contract schemas | Medium | Admin authority tab, import flows |

Root conflict: canonical contracts exist, but frontend services and hooks often consume hand-written interfaces instead of inferred contract types. That permits DTO drift even when functions build passes.

## Contract Authority Matrix

| Entity | Current Authorities | Canonical Authority | Conflict Severity | Affected Layers |
|---|---|---|---:|---|
| `SearchResultDTO` | Frontend type, REST Zod schema, backend local response, tests | Shared `searchBooks` contract type | Critical | REST, services, UI, tests |
| `Book` / `BookEdition` | Legacy UI `Book`, `BookEdition`, backend library types, admin canonical schemas | Backend book/edition schema with frontend public projection | Critical | Search, details, shelves, reader |
| Recommendations | `string[]` quick recs, Librarian book cards, matchmaker recommendations, review origin | Backend-authored recommendation DTO per surface | High | Home, Librarian, reviews, attribution |
| `Shelf` | UI entity, backend callable schema, optimistic cache entry shape | Backend shelf callable response | High | Shelves, profile, modal flows |
| Reader state | Reader contracts, offline records, hooks, function handlers | Reader callable contracts | High | Reader runtime and offline sync |
| `PostAttachment` | Hydrated display union and create request payloads mixed | Two contracts: create input DTO and hydrated output DTO | High | Composer, post cards, feed |
| Agent chat/session | UI entity, service types, function persistence | Backend session/chat DTO plus display registry | Medium | Agent chat/history |
| User stats | `services/db.types.UserStats`, UI expected `counters`, contract stats schema | Backend stats DTO with explicit compatibility adapter | Medium | Read tab/profile/stats |
| Dev fixtures | Production entity interfaces | Fixture-local DTOs, transformed into production DTOs only in tests | Low | Dev/test only |

## Schema Drift Clusters

Book entity drift:

- `types/entities.ts` contains a legacy UI-facing `Book` that requires `ontology`.
- `BookEdition`, `BibliographicWork`, backend `LibraryBook`, admin canonical schemas, and search DTOs model adjacent but different concepts.
- `app/book-details.tsx` casts `Book` to `Record<string, unknown>` for ebook fields, proving the current `Book` interface is not the right runtime view for book details.
- `dev/fixtures/booktownMocks.ts` has 29 errors because fixture books do not satisfy the newer `Book.ontology` requirement.

Shelf entity drift:

- Structured query keys exist, but optimistic hooks append extra `{ ownerId }` objects to some shelf list keys.
- Backend shelf contracts require explicit visibility/count/timestamps, while UI `Shelf` permits many optional properties.
- Shelf detail inference collapses because `useShelfDetails` uses a v5-incompatible `keepPreviousData` option and casts keys.

Reader state drift:

- Reader callable contracts are strong, but hooks/offline records duplicate state shape.
- Timestamp representation varies between Firestore `Timestamp`, ISO strings, numbers, `any`, and `unknown`.
- The offline expiry compiler error shows duplicated `OfflineEbookRecord` ownership.

Search DTO drift:

- `types/bookSearch.ts` and `contracts/apiContracts.ts` are mostly aligned but not source-derived.
- `functions/src/api.ts` owns another local `SearchBookResponse`.
- Tests still build partial results where required fields such as `available` are optional.

Agent DTO drift:

- Phase A removed fixture ownership, but chat/session types remain split between `types/entities.ts`, `services/agents.types.ts`, and backend mutation contracts.
- `useAgentChat` is runtime-critical because its mutation type is currently inferred with `void` variables.

Social DTO drift:

- `PostAttachment` mixes display payloads with create request payloads. Composer creates partial `{ type, entityId }` objects and casts them into hydrated display attachments.
- Comment and interaction optimistic updates mutate several cache families without a single typed cache contract.

Timestamp/nullability drift:

- `createdAt`/`updatedAt` appear as Firestore `Timestamp`, ISO string, number, `any`, and `unknown`.
- This is not immediately fixable with one refactor. It should be normalized per contract boundary as each runtime domain is stabilized.

## Build Truthfulness Analysis

Why Vite succeeds while `tsc` fails:

1. Vite uses esbuild/Rollup to transpile and bundle; it does not perform full TypeScript semantic checking.
2. Root `tsconfig.json` has no explicit `include`/`exclude`, so `npx tsc --noEmit` compiles app runtime, tests, dev fixtures, scripts-adjacent files, and functions source under one frontend-oriented compiler context.
3. Functions build uses `functions/tsconfig.json` with strict settings and excludes tests. That is why `npm --prefix functions run build` passes while root `tsc` reports `functions/src/api.ts` errors.
4. Root compiler currently includes Phase A dev fixtures. Those fixtures are safely outside production runtime but still fail production `Book`/`User` typing.
5. `skipLibCheck` masks library type issues, but app source errors remain visible.

Compiler truthfulness gap:

| Gap | Risk |
|---|---|
| Root `tsc` includes non-runtime dev fixtures and functions source | Inflates error count and obscures runtime-critical frontend drift. |
| Vite build lacks semantic type checking | Production bundle can pass with broken contracts. |
| Functions build is separate and passes | Backend deploy safety is better than frontend type safety, but root audit output creates false backend alarms. |
| Tests compile in root scope | Test DTO drift is visible but mixed with runtime failures. |

Execution decision: first establish scoped compiler truth. The goal is not to suppress errors; it is to route each error to the correct owner: app runtime, functions, tests, fixtures.

## Execution Sequencing Strategy

The safe strategy is incremental, domain-bounded, and dependency-aware:

1. Separate compiler scopes before changing contracts.
2. Stabilize React Query v5 usage before touching business DTOs.
3. Stabilize runtime-critical contracts in the order they move user-visible truth.
4. Leave fixtures/tests for the final wave unless they block CI ownership.
5. Avoid broad entity rewrites. Introduce typed boundary DTOs and adapters domain by domain.

Dangerous refactor zones:

| Zone | Why Dangerous | Rule |
|---|---|---|
| `types/entities.ts` monolith | Used everywhere; broad edits can break unrelated surfaces. | Do not rewrite globally. Extract/use DTOs per boundary. |
| `PostAttachment` union | Mixed display/create semantics across social UI. | Split create input from hydrated output before changing components. |
| Shelf optimistic cache | Cross-cache updates can cause stale user library state. | Fix query keys and invalidation first, then DTOs. |
| Search/book identity | Search navigation, acquisition, reader, and book details depend on this. | Consolidate contract and preserve existing public fields during migration. |
| Reader offline state | Persistence-sensitive. | Add contract adapters and tests before changing stored shapes. |

## Execution Sequencing Matrix

| Change Set | Dependencies | Blast Radius | Rollback Risk | Recommended Order |
|---|---|---:|---:|---:|
| Compiler scope truthfulness | None | Low | Low | 1 |
| React Query v5 state/filter migration | Compiler scope truthfulness | High file count, low domain semantics | Medium | 2 |
| Mutation generic correction | React Query pass | Medium | Medium | 2 |
| Infinite query contracts | React Query pass | Notifications/comments/social | Medium | 3 |
| Search DTO authority consolidation | React Query pass | Search/home/details/tests/API | High | 4 |
| Book details public view DTO | Search DTO authority | Book details/acquisition/reader entry | High | 5 |
| Shelf DTO/cache consolidation | React Query pass | Shelves/profile/modals/social attachments | High | 6 |
| Firestore service adapter alignment | Compiler scope truthfulness | Library search service | Medium | 7 |
| Social attachment split | Search/book/shelf DTO clarity | Composer/feed/post cards | High | 8 |
| Reader state/offline contract pass | Compiler scope and React Query pass | Reader/offline persistence | High | 9 |
| Fixtures/tests contract cleanup | Runtime DTOs stable | Non-production | Low | 10 |

## Safe Stabilization Order

Minimum safe stabilization sequence:

1. **T1: Compiler Scope Authority**
   - Define separate app, functions, tests, and fixtures compiler scopes.
   - Keep `npm run build` behavior intact.
   - Add a CI command that type-checks runtime app scope separately from functions.
   - Expected result: runtime frontend errors are no longer mixed with functions/test/fixture drift.

2. **T2: React Query v5 Base Migration**
   - Convert all `invalidateQueries(key)` and `cancelQueries(key)` calls to `{ queryKey: key }`.
   - Replace mutation `isLoading` reads with `isPending`.
   - Remove direct hook imports from `@tanstack/react-query` in runtime hooks; use the local bridge or make the bridge unnecessary consistently.
   - Introduce a typed helper for readonly query keys if needed.

3. **T3: Mutation Generic Order Fix**
   - Correct all `useMutation<TData, TVariables>` cases to `useMutation<TData, TError, TVariables, TContext>`.
   - Prioritize `useAgentChat`, `useProjectMutations`, admin deletion/moderation mutations, Goodreads import, bookmark toggle.
   - This removes the dangerous `void` variable inference class.

4. **T4: Infinite Query Stabilization**
   - Add `initialPageParam` and explicit page/cursor types for notifications, social search, comments, and admin system events.
   - Replace `keepPreviousData` with v5 `placeholderData` where needed.
   - Type `InfiniteData<Page, Cursor>` snapshots before optimistic updates.

5. **T5: Search Contract Authority**
   - Make `searchBooks` shared contract the source of truth.
   - Derive frontend `SearchResultDTO` from the contract or a generated shared type, not hand-maintained duplicate interfaces.
   - Remove local backend `SearchBookResponse` duplication by using the same public response DTO.
   - Update tests after runtime DTO is stable.

6. **T6: Book Public View Contract**
   - Add a book details/acquisition view DTO that explicitly includes ebook/read fields.
   - Stop casting `Book` to `Record<string, unknown>` in book details.
   - Preserve legacy `Book` only as a compatibility view until callers are migrated.

7. **T7: Shelf Cache and DTO Authority**
   - Normalize shelf query keys so list/detail/entries use exactly one cache namespace.
   - Remove ad hoc ownerId key suffixes.
   - Align frontend `Shelf` with backend callable response through an adapter, not optional widening.

8. **T8: Firestore Adapter Contract**
   - Decide one frontend Firebase access shape: raw `Firestore` from `getFirebaseDb()` or adapter facade.
   - Fix `services/librarySearchService.ts` and `lib/infrastructure/firebase/firestoreAdapter.ts` accordingly.

9. **T9: Social Attachment and Reader State**
   - Split social attachment create input from hydrated display output.
   - Stabilize reader/offline DTOs against callable contracts with migration-safe adapters.

10. **T10: Non-runtime Fixture/Test Cleanup**
   - Give fixtures fixture-local types or fixture builders that produce canonical DTOs.
   - Update test builders for required search fields.
   - Keep dev fixtures isolated from runtime imports under Phase A guardrails.

## Architectural Risks

Immediate stabilization risks:

| Risk | Severity | Mitigation |
|---|---:|---|
| React Query cache invalidation fixed mechanically but against fragmented keys | Critical | Stabilize query key helpers and shelf/social cache namespaces during the same wave. |
| Search DTO consolidation breaks navigation/acquisition assumptions | Critical | Preserve public field names and validate with search/book details tests before removing legacy types. |
| Book type cleanup becomes a monolith rewrite | High | Introduce public view DTOs; do not rewrite `types/entities.ts` wholesale. |
| Root compiler scope change hides test/fixture drift | Medium | Add separate `typecheck:test` and `typecheck:fixtures` instead of excluding silently. |
| Functions errors in root tsc treated as backend failures | Medium | Keep functions checked by `npm --prefix functions run build`; do not fix false positives in frontend tsconfig context. |
| Optimistic update changes cause cache regressions | High | Handle per domain with focused tests: shelves, bookmarks, comments, notifications. |

Areas requiring immediate stabilization:

- React Query v5 base migration.
- Mutation generic order.
- Runtime app compiler scope.
- Search/book DTO authority.
- Shelf cache key authority.

Areas safe to defer:

- Dev fixture object shape cleanup.
- Test DTO builders after runtime DTO authority is settled.
- Dormant placeholder utilities and non-routed screens.
- Broad `types/entities.ts` decomposition.

## Final CTO Execution Verdict

Proceed with Type Integrity stabilization only through the ordered sequence above.

The first execution pass must not touch every compiler error. The correct first pass is compiler scope truthfulness plus React Query v5 migration, because those two clusters account for the majority of runtime-relevant failures and currently distort downstream DTO inference.

Do not begin with a Book schema rewrite, a global `types/entities.ts` refactor, or a compatibility shim that pretends v4 React Query patterns are acceptable. Those would increase blast radius and preserve the root architectural drift.

Phase T0 acceptance:

| Success Criteria | Status |
|---|---:|
| Exact runtime-critical drift clusters identified | PASS |
| Safe stabilization order established | PASS |
| Contract authorities mapped | PASS |
| Dangerous refactor zones identified | PASS |
| Execution-safe change sets isolated | PASS |
| Broad speculative recommendations avoided | PASS |

Final verdict: Phase T0 is complete. The execution-safe path is narrow: scope the compiler, migrate React Query v5 correctly, then consolidate runtime DTO authority domain by domain.
