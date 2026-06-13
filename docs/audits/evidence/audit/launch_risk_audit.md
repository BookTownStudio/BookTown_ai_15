---
id: BT-AUDIT-LAUNCH-RISK-AUDIT
title: "Launch Risk Audit — BookTown"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/launch_risk_audit.md
---

# Launch Risk Audit — BookTown
**Scope:** All risks that can manifest at early scale (first 100–1,000 concurrent users), covering race conditions, optimistic UI inconsistencies, error handling gaps, permission failures, callable timeouts, data inconsistency, and high-cost query patterns.

---

## 1. Overview

This audit identifies specific failure modes that will surface during the growth phase from 0 to 1,000 users. Risks are evaluated based on probability of occurrence, blast radius, and recoverability.

---

## 2. Key Findings (High Severity First)

- **Concurrent `addBookToShelf` calls on the same shelf will contend on a single Firestore document transaction** — `addBookToShelf` runs a Firestore transaction that reads and writes the entire shelf document. Two concurrent calls for the same shelf (e.g., user clicks "Add" twice fast, or two devices simultaneously) will cause one transaction to abort and retry. At 1,000 users, hot shelves (e.g., "Want to Read") will experience contention, increasing latency and error rates.
- **Reading session race condition on device switch** — `getOrCreateReadingSession` does not use a deterministic session ID. A user opening the same book on two devices simultaneously triggers two concurrent session creation calls. Both calls see no existing session and create two session documents. Two progress streams diverge permanently.
- **`likeSocialPost` transaction reads the post document AND the like document inside a transaction** — transactions in Firestore lock read documents. If a high-engagement post (e.g., 1,000 concurrent likes) triggers simultaneous `likeSocialPost` calls, all transactions compete for the same post document read lock. This creates a hot-document bottleneck.
- **`updateStatCounter` without idempotency** — `updateStatCounter` uses `FieldValue.increment(delta)` with no deduplication. Cloud Function triggers have at-least-once delivery. If a trigger fires twice for the same event (e.g., `onPostLikeCreated` fires twice due to a network retry), the counter increments twice. The `processMetricEventIdempotently` function exists for metric events but is NOT applied to `post_stats` counters.
- **Goodreads import callable has no progress tracking or timeout recovery** — `functions/src/imports/goodreadsImport.ts` processes potentially thousands of books in a single callable invocation. Cloud Functions v2 have a maximum timeout of 9 minutes. A large Goodreads library (5,000+ books) will time out, leaving an import in a partially-complete state with no way to resume.
- **Offline queue replay on reconnect can cause reading progress regression** — `readerSyncQueue` accumulates operations while offline. On reconnect, operations are replayed. If a later operation (e.g., "paused at page 150") is in the queue but a `recordReadingProgress` callable has already stored "finished" from another device, the replay will overwrite the authoritative "finished" state with the stale "paused at page 150" state.
- **No rate limiting on the Librarian AI callable beyond a daily quota check** — `LIBRARIAN_LIMITS.DAILY_QUOTA = 30`. The quota is checked by reading a Firestore counter. Under concurrent requests, multiple requests can pass the quota check simultaneously before any of them writes the increment, allowing more than 30 requests per day. This is a classic TOCTOU (time-of-check-time-of-use) race condition.
- **`searchRequestQuota` has the same TOCTOU race** — `functions/src/utils/searchRequestQuota.ts` implements a search quota that reads and increments a counter. Without a transaction, concurrent search requests can all read the same count before any increment is committed, allowing quota bypass.
- **No circuit breaker on external provider calls** — `fetchJsonWithTimeout` (Google Books, Open Library) has a 3-second timeout but no circuit breaker. If Google Books API is degraded (returning 500s slowly), every search that falls below the internal threshold will wait 3 seconds for the external call to fail before returning. At 100 concurrent searches, this is 300 seconds of accumulated latency.
- **`isActiveSignedIn()` in Firestore rules reads the user document on every secured request** — at 1,000 concurrent users each making 10 requests/minute, this generates 10,000 additional Firestore reads per minute solely from the suspension check. This is unexpected read amplification that will spike costs.

---

## 3. Detailed Findings

### 3.1 Shelf Document Contention

- **Issue:** All shelf operations (add book, remove book, move book) are transactions on a single shelf document.
- **Location:** `functions/src/shelves/addBookToShelf.ts`, `removeBookFromShelf.ts`, `moveBookBetweenShelves.ts`
- **Why it is a problem:** Firestore transactions retry on contention. Under concurrent access to a popular shelf (e.g., multiple browser tabs, device sync), retry storms increase latency. The `entries` map structure means the entire book list is re-read and re-written on every transaction.
- **Impact:** Performance — latency spikes on shelves with concurrent access; reliability — transaction retries can exhaust the default retry budget.

### 3.2 Reading Session Race Condition

- **Issue:** `getOrCreateReadingSession` checks for an existing session document and creates one if absent, but this check-then-create is not atomic.
- **Location:** `functions/src/reader/getOrCreateReadingSession.ts`
- **Why it is a problem:** Two concurrent `getOrCreateReadingSession` calls can both see no existing session and both create new session documents. Progress tracked in session A is invisible to session B.
- **Impact:** Data integrity — split reading progress between devices.

### 3.3 Librarian Quota TOCTOU Race

- **Issue:** Quota check reads a counter, checks if it's under the limit, then increments it in a separate write — not atomically.
- **Location:** `functions/src/ai/librarian.ts` (quota check logic)
- **Why it is a problem:** Between the read and the increment, concurrent requests can all pass the quota check. At 30 rps, a burst of concurrent requests could each read `count: 29` and all proceed.
- **Impact:** Cost — unbounded AI API calls; Vertex AI cost overrun.

### 3.4 Search Quota TOCTOU Race

- **Issue:** Same pattern as Librarian quota, applied to `searchRequestQuota.ts`.
- **Location:** `functions/src/utils/searchRequestQuota.ts`
- **Why it is a problem:** Per-user search limits can be bypassed by concurrent requests all reading the same stale count.
- **Impact:** Abuse — search quota bypass; Firestore read cost amplification.

### 3.5 `onPostLikeCreated` Double-Fire Risk

- **Issue:** `updateStatCounter` uses `FieldValue.increment` with no idempotency key check.
- **Location:** `functions/src/triggers/aggregationTriggers.ts`, `updateStatCounter` function
- **Why it is a problem:** Firestore triggers have at-least-once delivery. A network partition during trigger execution can cause the trigger to fire twice, incrementing the counter by 2 for a single like event.
- **Impact:** Data integrity — `post_stats` counters can drift above their true values, showing inflated like counts.

### 3.6 Goodreads Import Timeout

- **Issue:** `goodreadsImport` is a single callable with no checkpoint/resume mechanism.
- **Location:** `functions/src/imports/goodreadsImport.ts`
- **Why it is a problem:** Cloud Functions v2 max timeout is 9 minutes (540 seconds). Processing 5,000 books at ~0.1s each = 500 seconds, approaching the limit. Any additional latency (book ingestion, cover fetching) pushes over the limit. A timed-out import leaves the user's library in an unknown partial state.
- **Impact:** Reliability — users with large libraries can never successfully complete import; data integrity — partial import with no recovery path.

### 3.7 Offline Replay State Regression

- **Issue:** Offline queue replays all queued operations on reconnect without checking the current authoritative state.
- **Location:** `lib/reader/offline/readerSyncClient.ts`, `readerSyncQueue.ts`
- **Why it is a problem:** If the backend state advanced (e.g., user finished a book on their phone while tablet was offline), the offline replay from the tablet will write stale "in progress" state, regressing the authoritative "finished" state.
- **Impact:** Data integrity — reading progress can regress from "finished" to "in progress" on reconnect.

### 3.8 External Provider No Circuit Breaker

- **Issue:** `fetchJsonWithTimeout` applies a 3-second timeout but no circuit breaker pattern.
- **Location:** `functions/src/library/search/searchEngine.ts`, `fetchJsonWithTimeout` function, line 1011
- **Why it is a problem:** During a Google Books API outage, every search that triggers the external fallback waits 3 full seconds before returning. With 100 concurrent searches, the function pool is saturated for 3 seconds per wave.
- **Impact:** Performance — search latency degrades from <500ms to >3s during external provider degradation; function instance exhaustion.

### 3.9 `likeSocialPost` Hot Document

- **Issue:** Transaction reads both `likeRef` and `postRef` inside a transaction, locking both.
- **Location:** `functions/src/social/interactions.ts`, lines 29–79
- **Why it is a problem:** For a popular post, thousands of concurrent likes all contend on the same `postRef` document. Firestore transaction contention causes exponential backoff and eventually HTTP 429 or 503 errors.
- **Impact:** Reliability — popular posts become unresponsive to new likes under load.

### 3.10 Missing Error Boundaries in Reader

- **Issue:** `app/reader.tsx` has no React error boundary wrapping the reader engine.
- **Location:** `app/reader.tsx`
- **Why it is a problem:** If the reader engine (PDF or EPUB) throws an unhandled error, the entire page crashes with a white screen. Users lose their reading position and cannot recover without a reload.
- **Impact:** UX — reader crashes are catastrophic; no graceful fallback.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| Reading session race (two devices) | **High** |
| Librarian quota TOCTOU | **High** |
| Search quota TOCTOU | **High** |
| Goodreads import timeout (large libraries) | **High** |
| `onPostLikeCreated` double-fire (counter drift) | **High** |
| Offline replay state regression | **High** |
| `likeSocialPost` hot document contention | **Medium** |
| Shelf document transaction contention | **Medium** |
| External provider no circuit breaker | **Medium** |
| `isActiveSignedIn()` read amplification at scale | **Medium** |
| Reader no error boundary | **Medium** |

---

## 5. Systemic Patterns

- **Check-then-act without transactions** — quota systems, session creation, and some counter updates follow a read-then-write pattern without Firestore transactions, enabling TOCTOU races under concurrent load.
- **At-least-once trigger delivery not handled** — multiple triggers (`onPostLikeCreated`, `onPostRepostCreated`, `onPostCommentCreated`) use `updateStatCounter` without idempotency keys. Only `processMetricEventIdempotently` is idempotent, and it is applied only to global metrics, not to per-entity counters.
- **No graceful degradation for external dependencies** — all external calls (Google Books, Open Library, Vertex AI) have timeouts but no circuit breakers, fallback responses, or health-check mechanisms.

---

## 6. Hidden Risks

- **`materializeBookAuthority` runs a Firestore transaction that can touch 6–8 documents** — the transaction reads `book_identity_index/{identityKey}` for each identity candidate (isbn13, isbn10, canonical, provider), reads the matched book document, reads the author document, and writes to book + author + identity index. This is a long-running transaction with many reads, which is expensive and contention-prone under concurrent ingestion.
- **Firestore transaction retry budget** — Firestore retries contended transactions up to 5 times with exponential backoff. If all 5 retries fail (e.g., during a hot-path book ingestion burst), the callable returns an internal error with no useful diagnostic to the client.
- **`backfillReadingProgressCanonical` admin function has no concurrency control** — admin backfill functions process documents in a loop with no parallelism controls. Running two backfills simultaneously will double the write rate and may trigger Firestore write limits (1 write/second per document under sustained load).
- **`publicationUrl.ts` generates public URLs with no CDN or cache-control** — publication cover images served via Firebase Storage signed URLs expire. If a signed URL expires while a user is viewing it (e.g., during a long reading session), cover images break with no re-fetch mechanism.
