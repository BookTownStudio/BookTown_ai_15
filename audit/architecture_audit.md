# Architecture Audit — BookTown
**Scope:** Full system architecture — frontend layer structure, domain layer, API boundary, backend functions organization, data flow, AI integration, and inter-module coupling.

---

## 1. Overview

BookTown is a React + Vite SPA with Firebase (Auth, Firestore, Storage, Cloud Functions v2). The intended architecture separates:
- **UI layer:** `app/` (pages), `components/` (shared components)
- **Domain/service layer:** `lib/hooks/` (data hooks), `services/` (service abstraction)
- **API layer:** Cloud Functions callable endpoints
- **Data layer:** Firestore + Firebase Storage
- **AI layer:** Vertex AI (Gemini) via `functions/src/ai/`, Librarian callable

---

## 2. Key Findings (High Severity First)

- **The `services/` layer is a thin pass-through, not a real domain layer** — `firebaseDbService.ts` calls Firestore directly. `dataService.ts` adds a Proxy guard but does not add domain logic, transformation, or validation. All domain logic lives either in the Cloud Functions or scattered across 90+ hooks in `lib/hooks/`. There is no domain model layer in the traditional sense.
- **90+ hooks in `lib/hooks/` are unbounded in scope** — hooks perform data fetching, caching, optimistic updates, mutation, and side effects all in the same file. There is no distinction between query hooks, mutation hooks, and state hooks. The `useBookSearch` hook, for example, integrates search state management, debouncing, query execution, and result reranking. This creates test-hostile, tightly coupled units.
- **AI layer (`functions/src/ai/librarian.ts`, 5,269 lines) violates single-responsibility** — the Librarian function contains: recommendation generation, book deduplication, session caching, quota management, search engine invocation, Firestore writes for suggestion sessions, intelligence signal emission, and response formatting. This is a god function.
- **Two parallel search implementations co-exist** — `functions/src/library/search/searchEngine.ts` (backend, 4,123 lines) implements unified search. `lib/books/bookSearchRanking.ts` implements a client-side re-ranker using Orama. These are two layers of an unacknowledged two-stage pipeline. The interface contract between them is not documented, and either layer can independently produce results that contradict the other.
- **`functions/src/index.ts` is the sole export hub** — all ~80 Cloud Functions are registered in a single `index.ts`. This creates a cold-start problem: any function invocation cold-starts the entire module graph, including unused AI imports, Vertex AI client initialization, and 4,000+ lines of search engine code.
- **No clear API contract enforcement layer** — `functions/src/contracts/wrapCallableV1.ts` and `wrapCallableV2.ts` exist, but not all callables use them. `likeSocialPost`, `repostSocialPost`, `addBookToShelf`, and others use raw `onCall` directly. The contract wrapper system is inconsistently applied.
- **Intelligence subsystem writes to Firestore from signal queue without backpressure** — `enqueueIntelligenceSignal` writes to `intelligence_signal_queue`, which is consumed by `aggregationWorker`. At high signal volume (100+ users, each triggering multiple signals per session), the queue has no rate limiting, no dead-letter handling, and no monitoring.
- **The offline queue (`lib/reader/offline/`) is architecturally disconnected** — the reader has a separate offline sync layer (`readerSyncClient.ts`, `readerSyncQueue.ts`) that operates independently of the main React Query cache. These two caching layers can hold conflicting state for the same data (e.g., reading progress), with no reconciliation protocol defined.

---

## 3. Detailed Findings

### 3.1 Thin Service Layer — No Domain Model

- **Issue:** `services/firebaseDbService.ts` maps directly to Firestore operations. No entity classes, no invariant enforcement, no transformation layer.
- **Location:** `services/firebaseDbService.ts`, `services/dataService.ts`
- **Why it is a problem:** Business rules (e.g., "a book can only be on one currently-reading shelf at a time") are enforced by the Cloud Function (`currentlyReadingInvariant.ts`), but the client-side `dataService` has no knowledge of this. A client making direct callable invocations bypasses the invariant only if the callable is called through the backend. Any client-side optimistic state that violates this rule will render correctly until the backend rejects it.
- **Impact:** Architecture — business rules not enforceable at the domain layer; invariants only enforced at the API boundary.

### 3.2 Librarian God Function

- **Issue:** `functions/src/ai/librarian.ts` is 5,269 lines performing 8+ distinct concerns.
- **Location:** `functions/src/ai/librarian.ts`
- **Why it is a problem:** Any change to quota logic, caching, ranking, or Firestore schema requires touching the same file. The function is untestable in parts because it combines I/O (Firestore reads/writes), AI calls (Vertex AI), and pure computation (ranking, deduplication) without separation.
- **Impact:** Maintainability — change blast radius is the entire AI recommendation stack; testability — unit testing requires mocking Firestore, Vertex AI, and search engine simultaneously.

### 3.3 Cold-Start Risk from Monolithic `index.ts`

- **Issue:** All 80+ functions are exported from a single `functions/src/index.ts`.
- **Location:** `functions/src/index.ts`
- **Why it is a problem:** Node.js module loading is synchronous. When any function cold-starts, the entire module graph is evaluated: VertexAI client, 4,000-line search engine, all trigger handlers, all admin functions. Cold-start latency for the Librarian callable can be 3–8 seconds under this pattern.
- **Impact:** Performance — high cold-start latency on all callables; user experience — first search after idle period is slow.

### 3.4 Contract Wrapper Inconsistency

- **Issue:** `wrapCallableV1` and `wrapCallableV2` exist but are not used by all callables.
- **Location:** `functions/src/contracts/wrapCallableV1.ts`, `wrapCallableV2.ts` vs. `functions/src/social/interactions.ts`, `functions/src/shelves/addBookToShelf.ts`
- **Why it is a problem:** Callables that bypass the wrapper lack: structured error mapping, envelope versioning, observability hooks, and idempotency correlation IDs. Two-tier callable behavior makes debugging inconsistent across the surface area.
- **Impact:** Observability — non-wrapped callables produce unstructured error responses; reliability — no idempotency key support.

### 3.5 Offline Queue / React Query Dual Cache

- **Issue:** Reader progress is tracked by both the React Query cache (via `useReaderProgress`) and the offline sync queue (`lib/reader/offline/readerSyncQueue.ts`).
- **Location:** `lib/reader/offline/`, `lib/hooks/useReaderProgress.ts`
- **Why it is a problem:** The two caches are not coordinated. React Query's stale time and refetch behavior can overwrite progress tracked in the offline queue before it is synced to the backend.
- **Impact:** Data integrity — reading progress can regress when coming back online if React Query refetch overwrites the offline queue's uncommitted state.

### 3.6 Intelligence Signal Queue — No Backpressure

- **Issue:** `emitIntelligenceSignalSafe` writes to `intelligence_signal_queue` synchronously within interaction triggers.
- **Location:** `functions/src/intelligence/profileBuilder.ts`, `functions/src/triggers/aggregationTriggers.ts`
- **Why it is a problem:** Post like/unlike triggers write a signal. At 1,000 concurrent users, each triggering 5 interactions/minute, this is 5,000 signal queue writes/minute. There is no write batching, no rate limiting, and no dead-letter queue.
- **Impact:** Scalability — signal queue growth rate is proportional to interaction volume; at scale, writes will contend and trigger Firestore hot-spot limits.

### 3.7 Two Parallel Search Implementations

- **Issue:** Backend search engine + client Orama reranker are parallel systems with no shared contract.
- **Location:** `functions/src/library/search/searchEngine.ts`, `lib/books/bookSearchRanking.ts`
- **Why it is a problem:** The interface between them is the `SearchResponseDTO` type (from `types/bookSearch.ts`), but the client reranker uses fields (`rawBook`, `isbn13`, `isbn10`) that are optionally populated by the backend. If the backend omits them (which it does for external results), the client reranker degrades silently.
- **Impact:** Architecture — two uncoordinated ranking systems; debugging ranking issues requires understanding both systems simultaneously.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| No domain model — rules only at API boundary | **High** |
| Librarian god function (5,269 lines, 8+ concerns) | **High** |
| Cold-start from monolithic `index.ts` | **High** |
| Dual cache (React Query + offline queue) | **High** |
| Intelligence signal queue — no backpressure | **High** |
| Contract wrapper inconsistency | **Medium** |
| Two parallel search systems | **Medium** |

---

## 5. Systemic Patterns

- **Vertical slices without horizontal layers** — each feature area (shelves, reader, social, search) has its own hook → callable → trigger chain. There are no horizontal layers (e.g., a single authorization layer, a single normalization layer). Cross-cutting concerns are duplicated per feature.
- **Backend as validation layer, not domain layer** — the backend enforces invariants (currently-reading, shelf ownership, canonical protection) but does not model the domain. Callables are organized by operation, not by domain concept.
- **AI writes authoritative data through a side door** — the Librarian callable writes `librarian_suggestions/{sessionId}` documents. The intelligence aggregation worker writes to `user_intelligence_profiles`. Both use the Firebase Admin SDK, bypassing Firestore rules. This means AI-generated data lands in Firestore with the same authority as manually curated canonical data, with no separate write channel.

---

## 6. Hidden Risks

- **`functions/src/index.ts` module evaluation order** — if any imported module throws on initialization (e.g., missing environment variable), all 80+ functions become unavailable simultaneously. There is no per-function isolation.
- **`lib/offline/OfflineProvider.tsx` wraps the entire app** — if the offline provider throws, the entire application is unmounted. There is no error boundary around the offline provider.
- **Reader engine selection (`lib/reader/runtime/engineSelection.ts`)** — two reader engines exist (PDF and EPUB). Engine selection is based on runtime conditions. If the wrong engine is selected, the reader silently fails to render. There is no fallback rendering path in `app/reader.tsx`.
- **`server/routes/gemini.ts`** — there is a server-side Gemini route. The relationship between this and the Vertex AI Librarian callable is unclear. Two AI pathways may exist with different rate limits, authentication, and data handling.
