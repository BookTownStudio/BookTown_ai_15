# BookTown Type Integrity Architecture Audit

Audit name: `BookTown_Type_Integrity_Architecture_Audit`  
Mode: read-only source audit, with this report as the only intentional artifact  
Date: 2026-05-06  
Workspace: `/Users/solofilms/BookTown_ai_15`

## Executive Summary

BookTown is not type-stable end to end. The production Vite bundle builds, but the TypeScript program reports 369 compiler errors, the root test run fails, the functions test run fails, and the frontend has active production mock imports. The backend functions compiler is materially healthier because `functions/tsconfig.json` is strict and bounded to `functions/src`, but the frontend/root compiler surface has drifted across React Query v5, navigation params, DTOs, Firestore document models, mock data, callable envelopes, and legacy compatibility layers.

Final type health score: **38 / 100**.

Severity: **Critical**. The main risk is not one broken type. The system has multiple type authorities for the same concepts: `contracts/apiContracts.ts`, copied function contracts under `functions/src/contracts/shared`, `types/entities.ts`, `services/db.types.ts`, service-local DTO parsing, Firestore document shapes, mock DTOs, and component-level route params. These authorities are not consistently generated, validated, or enforced in CI.

The highest-risk architectural zones are:

1. React Query v5 migration drift across hooks and components.
2. Firestore canonical book/search/read schema divergence across backend materialization and legacy frontend `Book`/`BookEdition` views.
3. Callable/API contract duplication and multiple client envelope unwrap implementations.
4. Production bundle contamination from `data/mocks.ts`.
5. Root compiler/test configuration that includes the wrong surfaces while Vite build ignores TypeScript failure.

## Global Type Health

### Required Command Results

| Command | Result | Evidence |
|---|---:|---|
| `npx tsc --noEmit` | Failed, exit 2 | 369 TypeScript errors, 511 log lines |
| `npm run build` | Passed, exit 0 | Vite built 1207 modules in 5.29s |
| `npm test` | Failed, exit 1 | 69 failed / 44 passed files, 85 failed / 204 passed tests |
| `npm --prefix functions run build` | Passed, exit 0 | `contract:sync` then strict `tsc` succeeded |
| `npm --prefix functions test` | Failed, exit 1 | 3 failed / 29 passed files, 89 failed / 193 passed tests |

### Compiler Error Distribution

| Error Code | Count | Dominant Cause |
|---|---:|---|
| TS2339 | 146 | Removed/renamed properties, especially React Query `isLoading`, `.raw` Firestore compatibility, route/data DTO fields |
| TS2559 | 103 | React Query v5 filter object API required, legacy array keys passed directly |
| TS2345 | 32 | Wrong mutation variable generic order, route/object literals widened to invalid contracts |
| TS2741 | 30 | Mock/test DTOs missing newly required fields |
| TS2352 | 21 | Unsafe structural casts to `Record<string, unknown>` and attachment/book DTOs |
| TS2322 | 13 | DTO assignments incompatible with canonical types |
| TS2307 | 5 | Missing modules, especially `functions/src/shared/tokenization` and route imports |
| TS2353 | 4 | Object literals contain fields outside target types |
| TS2304 | 4 | Missing local symbols such as `showToast` |
| TS2769 | 3 | Overload failures, especially React Query v5 and Vite config typing |
| Other | 8 | Smaller type predicate, spread, call arity, and comparison issues |

Top unstable files:

| File | Error Count | Domain |
|---|---:|---|
| `lib/hooks/useProjectMutations.ts` | 35 | React Query / publishing hooks |
| `data/mocks.ts` | 29 | Mock DTO drift |
| `app/shelf-details.tsx` | 18 | Route/component/data contract |
| `app/drawer/admin.tsx` | 17 | Admin mutations / React Query |
| `lib/hooks/useBookmarkToggle.ts` | 16 | React Query optimistic updates |
| `services/librarySearchService.ts` | 14 | Firestore adapter drift |
| `lib/hooks/useFollowUser.ts` | 12 | React Query invalidation |
| `app/drawer/profile.tsx` | 11 | Component contract drift |
| `lib/hooks/useNotifications.ts` | 10 | Infinite query/cache drift |
| `app/immersive/post-composer.tsx` | 8 | Navigation + attachment DTO drift |

### Root Architectural Causes

1. **Build truth is split**: Vite transpiles and bundles without running `tsc`; root `tsconfig.json` has no explicit include/exclude, `allowJs: true`, no `strict`, and no CI-style type gate.
2. **React Query migration is incomplete**: code uses v4-era positional filters and `isLoading` mutation state while dependency is `@tanstack/react-query@5.90.20`.
3. **Contract ownership is duplicated**: root `contracts/*.ts` are copied into `functions/src/contracts/shared` by `functions/scripts/syncContracts.cjs`; frontend clients still define local envelope types and endpoint-specific unwrap logic.
4. **Firestore schema authority is spread across layers**: backend writes canonical `books` with rich authority fields; frontend reads through legacy `Book`, `BookEdition`, `SearchResultDTO`, `db.types`, and local normalizers.
5. **Mock DTOs are production-visible**: Vite emits `dist/assets/mocks-*.js`; production routes import `data/mocks.ts`.
6. **Any-type leakage is systemic**: source scan found 835 `any`-style occurrences, 1203 `Record<string, unknown>` occurrences, and 123 `FIX:` comments in TypeScript/TSX surfaces.

## Compiler Error Matrix

| Error | File | Domain | Severity | Architectural Cause | User Impact | Recommended Fix Strategy |
|---|---|---|---|---|---|---|
| TS2559, 103 occurrences | `lib/hooks/*`, components | React Query | P0 | v5 requires filter objects; legacy `invalidateQueries(queryKey)` and `cancelQueries(queryKey)` remain | Stale cache, broken optimistic updates, compile failure | Centralize query key helpers and migrate every cache call to `{ queryKey }` |
| TS2339 `isLoading`, 35+ occurrences | `app/*`, `components/*`, `lib/hooks/*` | React Query | P0 | v5 mutation result uses `isPending`; components still consume v4 state | Buttons/loading states wrong or untyped | Replace mutation `isLoading` with `isPending`; keep query `isLoading` only for queries |
| TS2345 / TS2339 mutation variables inferred as `void` | `lib/hooks/useProjectMutations.ts`, `app/drawer/admin.tsx`, `app/immersive/goodreads-import.tsx` | React Query | P0 | `useMutation<TData, TVariables>` used as if second generic were variables; v5 second generic is error | Runtime mutation payload assumptions not type-checked | Use object options with explicit `UseMutationOptions<TData, Error, TVariables, TContext>` or infer from `mutationFn` |
| TS2769 `keepPreviousData` | `lib/hooks/useShelfDetails.ts` | React Query | P1 | Deprecated v4 option kept after v5 upgrade | Pagination/detail screens may flicker or fail compile | Use `placeholderData: keepPreviousData` imported from React Query |
| TS2741 / TS2353 mock DTO fields | `data/mocks.ts` | Mock/schema | P0 | Mock `Book`, `User`, `PostAttachment`, and `SearchResultDTO` shapes lag production types | Production mock bundle can render invalid data | Move mocks under test/dev-only boundary; generate fixtures from canonical schemas |
| TS2339 `.raw` | `services/librarySearchService.ts` | Firestore | P0 | Service expects `getFirebaseDb()` to return compatibility wrapper, but it returns `Firestore`; wrapper is exported separately as `db.raw` | Library read state silently returns null or cannot compile | Inject the Firestore adapter explicitly; remove `.raw` compatibility access |
| TS2352 `Book` to `Record<string, unknown>` | `app/book-details.tsx`, attachment files | UI DTO normalization | P1 | UI accesses canonical/provider fields outside `Book` interface via casts | Reader/acquisition paths can miss ebook provider fields | Promote provider/read fields into canonical read DTO or dedicated `BookDetailDTO` |
| TS2322 `SearchResultDTO.available` | `test/*`, `types/bookSearch.ts` | Search DTO | P1 | `available` became required; tests/builders still produce older DTO | Search UI/test fixtures lie about read availability | Create one `SearchResultDTO` test factory generated from contract schema |
| TS2307 missing `shared/tokenization` | `functions/src/library/search/__tests__/searchHarness.test.ts` | Functions tests | P1 | Test imports a module path not present under functions source | Search harness cannot validate transliteration behavior | Move tokenization into shared contract package or fix bounded functions test imports |
| TS2769 Vite config `test` | `vite.config.ts` | Build config | P2 | `defineConfig` imported from `vite`, not `vitest/config` | Type gate fails though build passes | Import `defineConfig` from `vitest/config` or split Vitest config |
| TS2677 type predicate | `services/firebaseDbService.ts` | Agent sessions | P1 | Predicate narrows to a shape where `isPinned?: true`, incompatible with `AgentSession.isPinned?: boolean` | Agent session filtering can discard valid sessions | Normalize pinned sessions with explicit boolean predicate |
| TS2322 agent role | `services/realAgentService.ts` | AI contract | P1 | Normalized role inferred as string, not `'user' | 'model'` | AI callable payload loses compile-time contract safety | Use typed mapper returning `AgentMessage` and validate via shared zod schema |
| TS2352 attachment metadata casts | `lib/media/AttachmentAnalytics.ts`, `store/attachment-viewer.tsx` | Attachments | P1 | Structured metadata lacks index signature; analytics treats it as arbitrary map | Analytics payload can diverge from attachment schema | Add typed metadata-to-analytics mapper |
| TS2345 write content node literals | `lib/templates/writeTemplates.ts` | Editor/write schema | P1 | Literal arrays widen `type` to `string`; no factory for `WriteContentNode` | Template generation can drift from editor schema | Use typed node factory or `satisfies WriteContentNode` |
| TS2304 `showToast` | `app/drawer/profile.tsx` | Component state | P2 | Component references missing dependency | Profile action error paths break compile | Inject toast hook consistently at screen boundary |

## Schema Drift Analysis

| Collection/Entity | Canonical Shape | Observed Drift | Affected Layers | Severity | Recommended Authority |
|---|---|---|---|---|---|
| `books` canonical work | Backend `materializeBookAuthority.ts` writes `bookId`, `canonicalTitle`, `workIdentity`, `canonicalFieldTrust`, `ontology`, `rightsMode`, `visibility`, `cover`, `hasEbook` | Frontend `Book` remains a legacy UI view with required `titleEn/titleAr/authorEn/authorAr`, optional provider fields, `rawBook?: any` | Functions library, `lib/services/firebaseCatalogService.ts`, `types/entities.ts`, UI screens | Critical | Backend zod schema + generated frontend `CanonicalBookDTO` and mapped `BookCardView` |
| `editions` / `ebooks` | Backend creates separate edition/ebook-adjacent records | Frontend `BookEdition` assumes old bibliographic shape; `librarySearchService` reads `editions`, `ebooks`, and `edition_reading_state` through invalid `.raw` access | Search, reader, acquisition | Critical | Backend-owned read models: `EditionDTO`, `EbookDTO`, `ReaderAccessDTO` |
| `SearchResultDTO` | Contract requires `available`, `ebookClass`, `readAccess`, `sourceClass`, `languageTruth` | Tests and some factories still omit `available`; UI tests expect old read affordance behavior | Search service, tests, card components | High | `contracts/apiContracts.ts` should generate DTO type and fixture builder |
| `users` / `public_profiles` | Backend/profile services normalize Firestore records into `User` | Frontend expects `joinDate`; some profile reads use `createdAt` and local fallback; mocks are stale | Profile, notifications, follows | High | Canonical `PublicProfileDTO` and `PrivateUserDTO`, no direct `User` for both |
| `shelves` and shelf entries | Backend callable shelf models include `items`, `entries`, counts, visibility | Frontend `Shelf` interface expanded with many optional flags and virtual/system fields; components pass incomplete props | Read tab, shelf details, carousel | High | `ShelfDTO`, `ShelfEntryDTO`, `ShelfViewModel` separation |
| `posts/comments/attachments` | Backend social contracts use strict structured attachments and thread comments | UI has legacy `PostAttachment` union requiring hydrated fields while composer passes `{ type, entityId }`; optimistic comments synthesize author fields client-side | Social feed, composer, comments | Critical | Backend attachment hydrator DTO and client-only draft attachment type |
| `projects/releases/publications` | Functions project publish and bridge callables return release/publication/book results | Hooks use incorrect mutation generics; profile publication view mixes `blog` and `ebook` records | Write, publish, profile | High | `ProjectReleaseDTO` + separate publish result unions generated from contracts |
| `notifications` | Infinite notification hooks expect pages and unread count | Cache shapes use `any`, page flatten casts, invalid v5 invalidations | Notifications feed | Medium | `NotificationPageDTO` from callable schema |
| `agent_sessions/messages` | Firestore stores sessions/messages under `users/{uid}/agent_sessions` | Frontend predicate conflicts with `isPinned?: boolean`; AI messages map roles inconsistently | Discover agent/chat | High | Shared `AgentSessionDTO`, `AgentMessageDTO` |
| `quotes/reviews` | Backend quote/review callables use canonical ids, projections, transactions | Tests lack transaction mock; quote service has separate envelope parsing | Quotes, reviews, profile | High | Shared quote/review contract package and Firebase test harness |

## React Query Audit

| Hook/File | Deprecated Pattern | Current Risk | Migration Requirement | Priority |
|---|---|---|---|---|
| `lib/hooks/useProjectMutations.ts` | Direct array `invalidateQueries`, wrong generic order | 35 compile errors; publish/update cache invalidation unreliable | Use v5 object filters and infer variables from `mutationFn` | P0 |
| `lib/hooks/useBookmarkToggle.ts` | `as unknown as any[]`, direct filters | Optimistic rollback/cross-cache state can be wrong | Typed query key helpers returning `ReadonlyArray<unknown>` and v5 filters | P0 |
| `lib/hooks/useThreadComments.ts` | `useInfiniteQuery(... as any)`, missing `initialPageParam`, `isLoading` mutation state | Infinite cache type is `InfiniteData<unknown, unknown>`; optimistic comments unsafe | Declare full `useInfiniteQuery<CommentsPage, Error, InfiniteData<CommentsPage>, QueryKey, string | undefined>` and `initialPageParam` | P0 |
| `lib/hooks/useNotifications.ts` | Infinite query page casts, legacy invalidation | Unread count and feed page caches can diverge | Explicit notification page type and coordinated cache update helper | P1 |
| `lib/hooks/useShelfDetails.ts` | `keepPreviousData` option | v5 overload failure | Use `placeholderData: keepPreviousData` | P1 |
| `lib/hooks/useFollowUser.ts` | Direct invalidation arrays | Follow status/stats/follow-list caches can drift | Centralize follow mutation invalidation set | P1 |
| `lib/hooks/useMessenger.ts` | Direct array invalidations | Message and conversation list cache invalidation not v5-compatible | `{ queryKey }` filters and typed mutation variables | P1 |
| `app/drawer/admin.tsx` | Wrong mutation generic order and `isLoading` | Admin actions inferred as `void` variables | Explicit `UseMutationOptions` or typed `mutationFn` inference; `isPending` | P0 |
| `components/admin/CatalogAuthorityTab.tsx` | Mutation `isLoading`, mixed casts | Admin catalog state uses partially typed invalidations | Use generated admin service query keys and v5 state names | P1 |
| `lib/react-query.ts` | Thin re-export plus subclass compatibility alias | Legacy wrapper hides actual v5 API shape and invites casts | Replace compatibility alias with typed utility functions only | P1 |

React Query root cause: the project partially upgraded the dependency to v5 without a contract-level migration of cache APIs, mutation generics, and infinite query types. The comments saying casts “fix” readonly query keys are now actively misleading: v5 expects filter objects, not mutable arrays.

## Frontend/Backend Contract Audit

### Callable Contracts

The strongest contract asset is `contracts/apiContracts.ts`: it defines request/response envelopes with zod and is copied into functions by `functions/scripts/syncContracts.cjs`. Backend `wrapCallableV2` validates request and response shapes, then returns `{ success: true, data }` or `{ success: false, error }`.

Contract integrity failures:

1. `contracts/apiContracts.ts` is copied, not imported from one package. Root uses zod v4, functions use zod v3. This passes today but is not deterministic long term.
2. `functions/src/contracts/types.ts` extends callable keys manually with `"adminMergeCanonicalBooks"`, even though that endpoint also appears in the registry. This is legacy contract leakage.
3. Frontend has multiple callable clients: `lib/callable.ts`, `services/firebaseDbService.ts`, `services/firebaseProjectService.ts`, `services/quoteService.ts`, `lib/services/firebaseCatalogService.ts`, and ad hoc `httpsCallable` usages. Each duplicates envelope types and unwrap/error behavior.
4. `services/realAgentService.ts` calls some AI paths through REST and others through callable, with fallback acceptance of raw non-envelope payloads.

### REST API Contracts

`wrapRestExport.ts` normalizes REST requests, wraps successful raw responses into a success envelope, validates response schemas, and emits failure envelopes. This is structurally sound.

The drift is at the client boundary:

1. `bookSearchService.normalizeResponse` accepts both enveloped and raw payloads.
2. `realAgentService.callEndpoint` explicitly returns raw payload as a backward-compatible fallback.
3. `/api/ai/chat` is documented as a deterministic stub and returns `{ text }`; it is contract-wrapped only if exported through `domains/ssr.ts`. Any direct import/export of `apiRaw` would bypass the contract layer.

Required default: keep `wrapRestExport` as the only production export for REST and remove raw payload fallback from clients once all endpoints are enveloped.

## Firestore Integrity Audit

Firestore access is split between client SDK direct reads/writes, backend Admin SDK writes, callable wrappers, and adapter layers.

Critical findings:

1. `services/firebaseDbService.ts` remains a large client-side repository with direct collection reads/writes across users, profiles, shelves, posts, drafts, notifications, venues, reviews, feedback, and social relations. This conflicts with backend authority for business logic.
2. `services/librarySearchService.ts` calls `getFirebaseDb()` and expects `.raw`, but `getFirebaseDb()` returns `Firestore`; `lib/firebase.ts` separately exports `db.raw`. This is a concrete adapter contract break.
3. `lib/infrastructure/firebase/firestoreAdapter.ts` claims “No Firebase imports outside this boundary”, but Firebase imports exist throughout services and hooks. The boundary is aspirational, not real.
4. Backend canonical book materialization writes rich authority fields, but frontend maps to `Book` through `buildLegacyBookView`, defaulting required UI fields when missing. This hides schema drift rather than enforcing it.
5. Timestamp handling is inconsistent: backend uses `FieldValue.serverTimestamp()` and Admin `Timestamp`, while frontend interfaces often type timestamps as ISO strings or `any`. Local converters silently default to `new Date().toISOString()`.
6. Some query paths have bounded limits, which is good, but large client repository reads still mix direct Firestore access with callable-backed access, making security/rule behavior hard to reason about.

Recommended authority: backend owns all write/business invariants; frontend owns only view models. Firestore document DTOs must be generated or manually declared once per collection in a shared schema package, then converted to UI view models through named mappers.

## Mock Contamination Audit

| Mock/Stub | Reachable From | Production Visible | Severity | Recommended Action |
|---|---|---:|---|---|
| `data/mocks.ts` | `app/editor/[id].tsx` imports `mockAgents` | Yes | Critical | Replace with real agent catalog/config DTO or dev-only fixture boundary |
| `data/mocks.ts` | `app/bookflow/feed.tsx` imports `mockBookFlowData` | Yes | Critical | Remove route or gate behind non-production build flag excluded from bundle |
| `data/mocks.ts` | `app/book-details.tsx` imports `mockBooks` | Yes | High | Use catalog service fallback view only, no mock book source |
| `data/mocks.ts` | `app/discovery/flow.tsx` imports flow mocks | Yes | Critical | Move discovery mocks to tests/stories only |
| `data/mocks.ts` | `app/agent.tsx`, `app/tabs/discover.tsx` import `mockAgents` | Yes | High | Define production agent registry outside mock file |
| `data/mocks.ts` | `lib/hooks/useQuickRecs.ts` imports `mockFallbackBookIds` | Yes | Critical | Replace with backend recommendation fallback or empty state |
| `/api/ai/chat` | `services/realAgentService.ts` | Yes | High | Endpoint comment says deterministic stub; either promote to real engine or mark unavailable explicitly |
| `generateSpeech` / `analyzeShelfVibe` fallbacks | `services/realAgentService.ts` | Yes | Medium | Return typed unsupported errors, not `null` silent fallbacks |
| Root tests importing `functions/lib/**/*.js` | `npm test` | Test config visible | High | Exclude `functions/lib` from root test include |

Vite build emitted `dist/assets/mocks-5b857931.js` at 76.58 kB. This is definitive production bundle contamination.

## AI Contract Audit

The AI/agent system has two quality levels.

Strong areas:

1. `functions/src/ai/discoverAgentCallable.ts` validates request and response with zod, enforces auth, App Check, consent, bounded messages, max instances, and logs structured success/failure diagnostics.
2. `/api/ai/librarian` enforces auth, App Check, consent, request normalization, context loading, quota handling, and structured logging.

Drift and risks:

1. `services/realAgentService.ts` accepts raw REST payload fallback and legacy array response fallback for librarian recommendations. This undermines deterministic contracts.
2. AI DTOs are not fully generated from `contracts/apiContracts.ts`; the client normalizes responses with `any` and `Record<string, unknown>`.
3. `AgentMessage` role normalization has a compiler error because `{ role: string; content: string }[]` is assigned to `AgentMessage[]`.
4. `/api/ai/chat` is marked as a deterministic stub. It returns context-bound placeholder text, not a real chat contract. Keeping it production reachable is acceptable only if product behavior explicitly treats it as unavailable/preview.
5. Tool invocation/streaming contracts are not present as first-class types. Current AI calls are request/response only; streaming would currently require new schema authority.

Recommended default: define one AI contract family in `contracts/apiContracts.ts` for `AgentMessage`, `LibrarianRecommendation`, `LibrarianEnvelope`, and future stream events. Generate client types and remove raw fallback acceptance.

## Route and Component Contract Audit

Navigation uses `types/navigation.ts`, but `NavigationParams` is `[key: string]: any`. This makes every route param implicit and forces screens to locally inspect/cast params.

Concrete issues:

1. `app/immersive/post-composer.tsx` widens `{ type: 'tab', id: 'social' }` to `{ type: string; id: 'social' }`, causing invalid `View` assignment.
2. Screens read params by hand, e.g. `currentView.params?.bookId`, `publicationId`, `authorId`, `attachedBook`, `attachedQuote`, `from`, etc. There is no route-param schema per immersive screen.
3. Drawer/navigation schema is a flat union of screen names; params are not tied to screen ids.
4. Component prop drift is visible in `app/drawer/profile.tsx`, where `ShelfCarousel` is rendered without required menu/action props.
5. Non-null assertions exist in reader/PDF selection code; those are localized but should be bounded by explicit guards because reader state is user-facing.

Recommended authority: replace `NavigationParams` any-index with a `RouteParamMap` keyed by `ImmersiveScreenName`, `TabName`, and `StackScreenName`. `View` should be a discriminated union generated from that map.

## Service Layer Integrity

Service ownership is not coherent.

Findings:

1. `services/dataService.ts` casts `firebaseDbService as DataService`, mutates `rawService.librarySearch`, and wraps it in a `Proxy` using `any`. This hides missing implementations until runtime.
2. `firebaseDbService.ts` is a large mixed repository handling profiles, shelves, social, messaging, notifications, venues, drafts, feedback, agent sessions, upload, and more. It is not a bounded domain service.
3. `firebaseCatalogService.ts` and `firebaseDbService.ts` duplicate callable envelope parsing and error normalization.
4. `WriteRepository`, `firebaseProjectService`, and `dataService.projects` coexist, creating mixed write authority for projects.
5. Client-side business logic remains in services and hooks: shelf counts, social optimistic counters, profile normalization, user stats assumptions, and search/read acquisition behavior.
6. Circular dependency risk is non-trivial because services import lib modules and lib modules import services.

Required default: split service ownership by backend domain contracts. Frontend services should be thin clients around typed backend APIs and pure view mappers. No frontend service should own canonical business invariants.

## Build and Compilation Integrity

Vite build passes while TypeScript fails because Vite does not type-check by default. It transpiles modules and bundles reachable code. The build proved that runtime bundle generation is possible, not that contracts are valid.

Root `tsconfig.json` issues:

1. No `strict`.
2. No `include` / `exclude`.
3. `allowJs: true`.
4. `skipLibCheck: true`.
5. Includes config/test/functions/legacy surfaces unintentionally.
6. Does not isolate frontend app from functions compiled outputs.

Root `npm test` issues:

1. It loads `functions/lib/**/*.js`, including CommonJS-compiled Vitest tests that fail with “Vitest cannot be imported in a CommonJS module using require()”.
2. It also loads `functions/src` tests, duplicating backend test execution inside the root suite.
3. It has UI tests with stale DTO expectations.

Functions build integrity:

1. `functions/tsconfig.json` is strict, bounded to `src`, excludes tests, and passes.
2. `npm --prefix functions run build` runs `contract:sync`, which copies root contracts into functions. It did not produce tracked diffs during this audit, but it is still a duplicated-source process.
3. Functions tests fail because mocks are stale and search harness imports are broken, not because strict compile fails.

## Architectural Debt Map

Most dangerous scaling risks:

1. Firestore document drift between canonical authority writes and legacy frontend reads.
2. Client-side writes/business logic that bypass backend invariants.
3. Production-visible mocks and stub AI paths.
4. React Query cache inconsistency during high-concurrency social/write workflows.
5. Root CI/build truth mismatch.

Domains most likely to collapse under iteration:

1. Catalog/search/reader acquisition.
2. Social attachments/comments/feed cache.
3. Write/publish release bridge.
4. AI librarian/agent recommendation contracts.
5. Admin canonical authority tools.

Highest maintenance-cost systems:

1. `services/firebaseDbService.ts`.
2. `types/entities.ts`.
3. `data/mocks.ts`.
4. `lib/hooks/useProjectMutations.ts` and related React Query hooks.
5. `functions/src/library/materializeBookAuthority.ts` unless paired with generated DTOs/tests.

Areas safe to defer:

1. Cosmetic type cleanup in isolated UI components after P0 React Query fixes.
2. Bundle chunk optimization, except mock bundle removal.
3. Non-critical `FIX:` comment cleanup after type authority stabilization.

Areas requiring immediate stabilization:

1. React Query v5 migration.
2. Production mock import removal.
3. Root compiler/test configuration.
4. Search/book/read DTO authority.
5. Callable client unification.

## Architecture Stabilization Matrix

| Area | Problem | Root Cause | Complexity | Priority | Recommended Sequence |
|---|---|---|---|---|---|
| Type gate | Vite passes while `tsc` fails | Build does not run typecheck; root tsconfig unbounded | Medium | P0 | Add bounded frontend `tsconfig.app.json`, CI `tsc -p`, exclude generated/build outputs |
| React Query | v4 patterns on v5 dependency | Incomplete migration | Medium | P0 | Fix mutation generics/states, then invalidate/cancel filters, then infinite queries |
| Contracts | Multiple envelope clients | No generated client package | Medium | P0 | Export root contracts as single package; generate client helpers |
| Firestore schemas | Canonical backend and legacy frontend types diverge | `types/entities.ts` mixes document, DTO, and view models | High | P0 | Define collection DTO schemas, then UI view mappers |
| Mocks | Mocks imported by production routes | No fixture boundary | Low | P0 | Move mocks to `test/fixtures` or dev-only dynamic import excluded from prod |
| Search/read | `Book`, `BookEdition`, `SearchResultDTO` drift | Work/edition/ebook model migration incomplete | High | P0 | Canonical `SearchResultDTO` factory and reader access DTO |
| AI | Raw fallback and stub paths | AI contracts not fully shared/generated | Medium | P1 | Generate AI DTOs and remove raw fallback |
| Tests | Root tests include functions build output | Vitest include/exclude not scoped | Low | P1 | Split root and functions test configs |
| Navigation | Route params are `any` | No route param map | Medium | P1 | Add typed param map and navigation builders |
| Service layer | `dataService` proxy hides ownership | Large mixed repository and runtime guards | High | P1 | Domain clients per backend contract |

## Stabilization Strategy

### Immediate Critical Fixes

1. Create a bounded frontend typecheck target and make it truthful:
   - `tsconfig.app.json` includes only `app`, `components`, `lib`, `services`, `types`, `contracts`, `store`, and intentional tests.
   - Exclude `functions`, `functions/lib`, `dist`, `audit`, and generated artifacts.
   - Add script `typecheck:app`.

2. Complete React Query v5 migration:
   - Replace mutation `isLoading` with `isPending`.
   - Replace every `invalidateQueries(queryKey)` / `cancelQueries(queryKey)` / `removeQueries(queryKey)` with `{ queryKey }`.
   - Fix all `useMutation<TData, TVariables>` usages.
   - Add `initialPageParam` for infinite queries.

3. Remove production mock imports:
   - No app route or production hook may import `data/mocks.ts`.
   - Keep production agent registry separate from mock fixtures.
   - Verify `npm run build` emits no `mocks-*.js` chunk.

4. Split tests:
   - Root Vitest must exclude `functions/**` and `functions/lib/**`.
   - Functions Vitest must test only `functions/src/**/*.test.ts`.

### Core Architecture Stabilization

1. Treat backend as business authority.
2. Convert frontend services into typed API clients and pure mappers.
3. Remove direct Firestore writes for business operations from frontend.
4. Keep direct Firestore reads only for explicitly read-only, rule-safe, bounded views, and type them through DTO mappers.

### Type Authority Consolidation

1. `contracts/apiContracts.ts` becomes the source for callable and REST request/response DTOs.
2. Firestore collection schemas become separate backend-owned schemas.
3. `types/entities.ts` is split into:
   - backend DTOs,
   - frontend view models,
   - local UI draft/input types,
   - test fixture types.
4. Contract sync must become package import/generation, not copy.

### Contract Normalization Plan

1. Replace local `SuccessEnvelope` / `FailureEnvelope` duplicates with one imported type.
2. Replace endpoint string calls with typed endpoint keys.
3. Generate `callCallableEndpoint<K>()` from `apiContracts.callable`.
4. Generate `callRestEndpoint<K>()` from `apiContracts.rest`.
5. Remove raw payload fallback once all exported endpoints pass through wrappers.

### React Query Modernization

1. Keep `queryKeys.ts`, but add type aliases:
   - `type AppQueryKey = readonly unknown[]`.
   - `invalidateKey(queryClient, key)`.
   - `cancelKey(queryClient, key)`.
2. No hook should cast query keys to `any[]`.
3. Mutation functions should own variable types; callers should not manually provide incorrect generics.
4. Add regression tests for optimistic update rollback in comments, bookmarks, shelves, and project publish.

### Schema Alignment Strategy

1. Start with `books`, `editions`, `ebooks`, `search results`, `posts`, `attachments`, and `projects`.
2. For each entity, define:
   - Firestore document schema,
   - API DTO schema,
   - UI view model,
   - mapper function,
   - fixture builder.
3. Make timestamps explicit:
   - Firestore docs: `Timestamp | FieldValue` at write boundary.
   - API DTOs: ISO strings.
   - UI: ISO strings only.
4. Ban `new Date().toISOString()` as a silent fallback in canonical mappers; missing server timestamps must be validation errors or explicitly nullable fields.

### Safe Technical Debt Postponement

Defer only after P0 gates pass:

1. Bundle manual chunk optimization.
2. Cosmetic component prop cleanup.
3. Internal comments cleanup.
4. Non-hot-path `Record<string, unknown>` mappers that already validate outputs.

### Long-Term Type Governance

1. CI must require:
   - frontend typecheck,
   - functions build,
   - root tests excluding functions,
   - functions tests,
   - contract parity check.
2. No production file may import `data/mocks.ts`.
3. No new `any` in production code without a local validation boundary and justification.
4. Every new callable/REST endpoint must be registered in `contracts/apiContracts.ts`.
5. Every Firestore collection write path must name its authoritative schema and owner.

## Final Architectural Verdict

BookTown has a real backend contract foundation, but the frontend and root toolchain are not enforcing it. The application currently builds because the build pipeline is permissive, not because the type architecture is coherent.

The decisive stabilization path is:

1. Make compiler/test truth reliable.
2. Finish React Query v5 migration.
3. Remove production mocks.
4. Consolidate callable/REST clients around generated contracts.
5. Split Firestore document DTOs from UI view models.

Until those five are complete, future feature work will continue to create schema drift and cache regressions even when `npm run build` succeeds.
