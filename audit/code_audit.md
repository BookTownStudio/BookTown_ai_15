# Code Audit — BookTown
**Scope:** Full frontend (React/Vite), backend (Cloud Functions v2), services layer, hooks, domain logic, store, and scripts.

---

## 1. Overview

This audit covers the entire codebase across:
- `app/` — page-level React components
- `components/` — shared UI components
- `lib/hooks/` — data-fetching and mutation hooks (~90 files)
- `services/` — data service layer (firebaseDbService, librarySearchService, etc.)
- `functions/src/` — Cloud Functions (callables, triggers, admin, AI)
- `store/` — global state (Zustand-style context stores)
- `scripts/` — one-off admin/backfill scripts

---

## 2. Key Findings (High Severity First)

- **Duplicate helper functions replicated across 10+ files** — `asRecord`, `asNonEmptyString`, `asStringArray`, `normalizeIsbn`, `normalizeSearchText`, `tokenize`, and `uniqueStrings` are independently copy-pasted in `ingestBook.ts`, `materializeBookAuthority.ts`, `searchEngine.ts`, `canonicalIngest.ts`, `searchIndexing.ts`, `bookSearchRanking.ts`, `aggregationTriggers.ts`, etc. No shared utility module is used in many of these critical files.
- **Dead / superseded hook** — `useLikeBook` in `lib/hooks/useLikeBook.ts` has an in-file comment "Replaced with useAddReaction" but the old export still exists and is exported. Any caller importing `useLikeBook` directly uses the deprecated path.
- **`any` types in critical paths** — `aggregationTriggers.ts` casts shelf `before` data as `any` on line 136 (`const before = snap.data() as any`). This disables type safety in the library-book delta logic.
- **Client-side `rawBook: any`** — `BookIngestionParams` in `services/bookIngestionService.ts` types `rawBook` as `any`, allowing arbitrary unvalidated payloads to flow into the ingestion callable. No schema guard exists at the service boundary.
- **Silent catch-all in `bookIngestionService.ingest`** — the service is documented "Never throws (UX must not dead-end)" but silently returns `null` on failure, making downstream callers unable to distinguish between "book not found" and "network error" and "schema rejection". All three are collapsed to `null`.
- **`social` domain missing from `dataService` domain whitelist check** — `dataService.ts` whitelists `"social"` but `useLikeBook` calls `dataService.social.addReaction(uid || 'guest', ...)` passing the literal string `'guest'` when no user is authenticated, which writes under an invalid UID.
- **`domainProxyCache` is a module-level singleton** — caching domain proxy objects at module scope means the cache persists across hot reloads and tests, causing stale method bindings.
- **Separation of concerns violation in `ingestBook.ts`** — the file contains search index field building (`tokenizeSearch`, `SEARCH_STOPWORDS`) that duplicates identical logic already in `functions/src/library/search/searchIndexing.ts` and `functions/src/search/normalization.ts`. The ingestion module should import from the canonical normalization module, not re-implement it.
- **`isActiveSignedIn()` in Firestore rules makes two cross-document reads per request** — this function reads the user document to check `isSuspended` and `status`. Under load, every secured read triggers 2 extra Firestore reads, doubling costs and latency at scale.
- **Benchmark / test pages shipped in production bundle** — `app/benchmark/ReaderHighlightBenchmarkApp.tsx` and `app/benchmark/ReaderPerfBenchmarkApp.tsx` are registered routes in `App.tsx` with no environment guard. These load heavy benchmarking fixtures in production.
- **`store/` state containers have no persistence or hydration guards** — `store/reading-prefs.tsx`, `store/theme.tsx`, etc. use React context but never persist to `localStorage` or Firestore. Preferences reset on every reload.
- **`app/lib/hooks/` is a shadow of `lib/hooks/`** — there exists both `app/lib/hooks/` (with `useEbookReaderAccess.ts`, `useReaderInsights.ts`) and `lib/hooks/` (with `useEbookReaderAccess.ts`). Two hooks with the same name exist in different directories; one is unreachable from the main module graph.

---

## 3. Detailed Findings

### 3.1 Duplicated Helper Utilities

- **Issue:** `asRecord`, `asNonEmptyString`, `asStringArray`, `normalizeIsbn`, `normalizeSearchText`, `tokenize`, `uniqueStrings`, `SEARCH_STOPWORDS` are independently redefined in at minimum:
  - `functions/src/library/ingestBook.ts`
  - `functions/src/library/materializeBookAuthority.ts`
  - `functions/src/library/search/searchEngine.ts`
  - `functions/src/library/normalization/canonicalIngest.ts`
  - `functions/src/library/search/searchIndexing.ts`
  - `lib/books/bookSearchRanking.ts`
  - `functions/src/triggers/aggregationTriggers.ts`
- **Location:** All files above, lines 1–100 of each
- **Why it is a problem:** Any normalization bug must be fixed in 7+ locations. Each copy has subtle differences (e.g., `asNonEmptyString` returns `string | null` in `ingestBook.ts` vs. always `string` in `materializeBookAuthority.ts`), creating inconsistent behavior between ingestion and materialization.
- **Impact:** Data integrity — a title normalized differently in ingestion vs. search will fail to deduplicate correctly.

### 3.2 Dead `useLikeBook` Hook

- **Issue:** `lib/hooks/useLikeBook.ts` exports both `useLikeBook` (deprecated) and `useAddReaction` (current), with an in-file comment noting the replacement. The old hook calls `dataService.social.addReaction(uid || 'guest', ...)` — a guest-mode write that was likely never intended to be real.
- **Location:** `lib/hooks/useLikeBook.ts`, lines 7–13
- **Why it is a problem:** Callers of `useLikeBook` bypass the `useAddReaction` naming convention and pass literal `'guest'` as a UID when unauthenticated.
- **Impact:** Security — ghost writes under `'guest'` UID; dead code confusion.

### 3.3 `any` Cast in Library Delta

- **Issue:** `const before = snap.data() as any` in `aggregationTriggers.ts`
- **Location:** `functions/src/triggers/aggregationTriggers.ts`, line 136
- **Why it is a problem:** Disables TypeScript safety on the data object used to drive shelf membership and reading progress state in `user_library_books`. An incorrect field name would fail silently at runtime.
- **Impact:** Data integrity — silent corruption of library membership records.

### 3.4 `rawBook: any` in Ingestion Service

- **Issue:** `BookIngestionParams.rawBook` typed as `any`
- **Location:** `services/bookIngestionService.ts`, line 23
- **Why it is a problem:** Arbitrary client-controlled data flows through to a Firebase callable with no schema validation at the service boundary. The callable itself validates, but the service layer provides a false safety guarantee.
- **Impact:** Reliability — if a caller passes a malformed payload, failure is opaque.

### 3.5 Benchmark Routes in Production

- **Issue:** `app/benchmark/ReaderHighlightBenchmarkApp.tsx` and `app/benchmark/ReaderPerfBenchmarkApp.tsx` are registered as real routes.
- **Location:** `App.tsx` (router configuration), `app/benchmark/`
- **Why it is a problem:** These pages load the full reader benchmark PDF fixture, exercise performance timing code, and expose internal performance internals to any user who navigates to the route.
- **Impact:** Security, performance — internal benchmarking infrastructure exposed in production.

### 3.6 Shadow Hook Directory

- **Issue:** `app/lib/hooks/useEbookReaderAccess.ts` and `lib/hooks/useEbookReaderAccess.ts` both exist.
- **Location:** Both paths
- **Why it is a problem:** Import resolution depends on which path is used. If both are referenced, they may hold different state instances or have diverged implementations.
- **Impact:** Correctness — dual hook instances for ebook access checks could show inconsistent access states.

### 3.7 `isActiveSignedIn()` Rule — Double Document Read

- **Issue:** `isActiveSignedIn()` reads `users/{uid}` to check `isSuspended` and `status`.
- **Location:** `firestore.rules`, lines 16–21
- **Why it is a problem:** Every `isActiveSignedIn()`-guarded read triggers an additional document read. With Firestore billing at per-read, this doubles read costs for every authenticated action.
- **Impact:** Cost, performance — 2× Firestore reads per secured request.

### 3.8 `domainProxyCache` Module-Level Singleton

- **Issue:** `domainProxyCache` in `services/dataService.ts` is a `Map` defined at module scope.
- **Location:** `services/dataService.ts`, line 20
- **Why it is a problem:** Cached domain proxies survive hot reloads and test isolation boundaries. In testing environments, this causes stale method bindings from one test to leak into another.
- **Impact:** Reliability — test flakiness; potential stale closures in development.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| Duplicated helpers with divergent implementations | **High** |
| `any` cast in library delta trigger | **High** |
| Benchmark routes in production | **Medium** |
| Dead `useLikeBook` with guest UID | **Medium** |
| `rawBook: any` at ingestion boundary | **Medium** |
| Shadow hook directory | **Medium** |
| Double Firestore read in rules | **Medium** |
| Module-level proxy cache | **Low** |

---

## 5. Systemic Patterns

- **Copy-paste utility functions** — the codebase has a consistent pattern of re-defining the same 6–8 utility functions inline in each new module rather than importing from a shared utility. This is systemic across both the frontend (`lib/books/`, `services/`) and functions (`functions/src/library/`).
- **Silent null returns masking errors** — multiple service and hook layers return `null` on failure instead of throwing or returning a discriminated union. This pattern is used in `bookIngestionService`, `ensureCanonicalBook`, and several hooks. Callers cannot distinguish transient from permanent failures.
- **Inconsistent return types** — `asNonEmptyString` returns `string | null` in some files and `string` (empty on miss) in others. This inconsistency is a direct result of the copy-paste pattern.

---

## 6. Hidden Risks

- **Search index token cap at 80** — `resolveSearchTokens` in `searchIndexing.ts` slices tokens to 80. For books with very long title alias lists (multilingual canonical seeds with many variants), later tokens are silently dropped, causing search misses on secondary titles.
- **`computeServerVerifiedDownloadable` false positive** — in `ingestBook.ts`, `computeServerVerifiedDownloadable` returns `true` if either `ebookAttachmentId` or `ebookStoragePath` is non-empty. A partially ingested book with a stale `storagePath` from a deleted file would show as downloadable in search results.
- **`store/reading-prefs.tsx` has no persistence** — user reading preferences (font size, theme, scroll position) are lost on every reload. For an ebook reader, this is a primary UX failure at first retention.
- **Offline queue (`lib/reader/offline/readerSyncQueue.ts`) not audited for idempotency** — the sync queue accumulates operations client-side, but no deduplication key is verified on replay, risking duplicate progress writes on reconnect.
