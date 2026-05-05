# Firestore Audit — BookTown
**Scope:** All Firestore collections, document shapes, security rules (`firestore.rules`), index definitions (`firestore.indexes.json`), write paths (callables + triggers), and client-side Firestore usage.

---

## 1. Overview

BookTown uses Firestore as its primary database with the following top-level collections identified across rules, triggers, and code:

`users`, `public_profiles`, `authors`, `books`, `editions`, `shelves`, `posts`, `post_stats`, `book_stats`, `reading_progress`, `user_library_books`, `attachments`, `notifications`, `notification_preferences`, `user_settings`, `user_stats`, `user_reviews`, `venues`, `events`, `search_feed`, `search_bookmarks`, `search_notifications`, `librarian_suggestions`, `library_books`, `activity_log`, `audit_log`, `deletion_requests`, `intelligence_signal_queue`, `user_intelligence_profiles`, `intelligence_aggregates_global`, `intelligence_aggregation_checkpoint`, `system_metrics`, `system_metrics_daily`, `agent_sessions` (subcollection under users), `messages` (subcollection).

---

## 2. Key Findings (High Severity First)

- **`shelves` collection stores book entries as a map field (`entries.{bookId}`)** — this is a Firestore anti-pattern. When a shelf has many books, the entire `entries` map is read and written on every shelf operation. Firestore documents are capped at 1 MB; a shelf with ~1,000 books with snapshot data will approach this limit.
- **Dual shelf storage: `/users/{uid}/shelves/{shelfId}` (legacy) and `/shelves/{shelfDocId}` (canonical)** — both paths exist and are written to by different code paths. The legacy user-subcollection shelf path has an `onShelfCreated` trigger tagged "legacy path (kept for backward compatibility)". The canonical `/shelves/` path is the server-written SSoT. Two different representations of the same entity with no reconciliation guarantee is a schema drift risk.
- **`post_stats` counter incremented by trigger without idempotency on initial values** — `updateStatCounter` in `aggregationTriggers.ts` uses `FieldValue.increment(delta)` but does NOT read the current value first. If the `post_stats` document does not exist, `increment` initializes to `delta`, which is correct. However, `syncPostStatsToSearchIndex` reads `likesCount` directly off `newData` (the stats document fields), while `updateStatCounter` writes to `counters.{field}`. These are different field paths — the stats trigger reads a flat field; the counter writes to a nested `counters` object.
- **`user_library_books` uses a composite document ID `{uid}_{bookId}`** — this creates predictable, enumerable document IDs. A malicious actor who knows another user's UID can construct library membership document IDs. While the rules block client reads, backend processes that enumerate these IDs expose user reading patterns.
- **`reading_progress` has no explicit unique constraint** — a user can theoretically create multiple progress documents for the same book+user pair because the callable (`recordReadingProgress`) uses a generated session ID as the document ID, not a deterministic `{uid}_{bookId}` key. Multiple progress documents per user+book are possible if the client calls `getOrCreateReadingSession` concurrently.
- **`activity_log` has no Firestore security rules defined** — the `activity_log` collection is written by callables (`likeSocialPost`, `repostSocialPost`) and read by notification triggers, but no rule exists for it in `firestore.rules`. This means the collection falls through to the default `allow read, write: if false` behavior, which is correct — but it also means no admin read access, making debugging production events impossible without service account access.
- **`search_notifications` mirrors the entire `notifications` collection to a flat index** — `syncNotificationToSearchIndex` in `searchTriggers.ts` creates a `search_notifications` document for every notification document. For a user who receives 1,000 notifications, this doubles the document count with no TTL or cleanup.
- **Multiple write paths to `public_profiles`** — `aggregationTriggers.ts` writes to `public_profiles` directly for follower/following counts using `new Date().toISOString()` (client-generated timestamp). This violates the pattern of using `FieldValue.serverTimestamp()` and creates clock skew risks.
- **`venues` allows direct client creation and update** — `firestore.rules` lines 628–677 allow any signed-in user to create and update venue documents directly without a Cloud Function intermediary. The validation in rules is minimal (string length bounds only) — no image URL validation, no duplicate venue detection, no geocoding authority.
- **`venues/reviews` allows direct client writes** — similarly, venue reviews are written directly by clients. There is no deduplication check (one review per user per venue is not enforced by the rules), allowing a user to create unlimited reviews.

---

## 3. Detailed Findings

### 3.1 Shelf `entries` Map Anti-Pattern

- **Issue:** Books added to shelves are stored as map entries (`entries.{bookId}`) inside the shelf document.
- **Location:** `functions/src/shelves/addBookToShelf.ts`, line 127; `firestore.rules` shelf section; `functions/src/triggers/aggregationTriggers.ts` shelf triggers
- **Why it is a problem:** Firestore document size is capped at 1 MB. Each `entries.{bookId}` object contains `bookId`, `addedAt`, `snapshot` (title, cover URL), and optional `recommendationOrigin`. At ~500 bytes per entry, a document is capped at ~2,000 entries. Prolific users will hit this limit. More importantly, every `addBookToShelf` call reads and writes the entire shelf document (including all entries) due to the transaction in `addBookToShelf.ts`.
- **Impact:** Scalability — hard document size limit; performance — full document read/write per book add.

### 3.2 Dual Shelf Storage Paths

- **Issue:** `/users/{uid}/shelves/{shelfId}` (legacy, trigger-only) and `/shelves/{shelfDocId}` (canonical, callable-written)
- **Location:** `functions/src/triggers/aggregationTriggers.ts` (`onShelfCreated` trigger on legacy path); `functions/src/shelves/manageShelves.ts`; `firestore.rules` (`/users/{uid}/shelves/{shelfId}` has `allow read: if isOwner(uid)`)
- **Why it is a problem:** The legacy user-scoped shelf subcollection still exists and is triggered on create, but client reads are served from the top-level `/shelves/` collection. If the two ever diverge (e.g., due to a failed fan-out), users could see stale shelf data.
- **Impact:** Data integrity — diverged shelf state between legacy and canonical paths.

### 3.3 `post_stats` Counter vs. `search_feed` Flat Field Mismatch

- **Issue:** `updateStatCounter` writes to `post_stats/{postId}.counters.likes` (nested). `syncPostStatsToSearchIndex` reads `newData.likesCount` (flat field). These are different field paths.
- **Location:** `functions/src/triggers/aggregationTriggers.ts`, line 44 (write path); `functions/src/triggers/searchTriggers.ts`, line 115 (read path)
- **Why it is a problem:** The search index will perpetually read `undefined` for `likesCount` if the stats document only populates `counters.likes`. The search feed's engagement signals will always be 0, breaking social ranking.
- **Impact:** Data integrity — search feed engagement signals permanently broken if documents use the nested `counters` structure.

### 3.4 `public_profiles` Client-Timestamp Write

- **Issue:** Follower/following count updates use `updatedAt: new Date().toISOString()` (JavaScript Date, not server timestamp).
- **Location:** `functions/src/triggers/aggregationTriggers.ts`, lines 404–418
- **Why it is a problem:** Server functions should use `FieldValue.serverTimestamp()` for consistency. Client-side `new Date()` in a Cloud Function is generally acceptable (since it runs on Google servers), but it introduces clock drift compared to other fields using `serverTimestamp()`, making time-based sorting unreliable.
- **Impact:** Data consistency — `updatedAt` field on profiles inconsistent with other timestamp fields.

### 3.5 No Idempotency on Reading Session Creation

- **Issue:** `getOrCreateReadingSession` creates reading progress documents with a session-ID-based document ID, not a deterministic `{uid}_{bookId}` key.
- **Location:** `functions/src/reader/getOrCreateReadingSession.ts`
- **Why it is a problem:** Concurrent calls to `getOrCreateReadingSession` (e.g., reader opens on two devices simultaneously) can create two progress documents for the same book, causing state split.
- **Impact:** Data integrity — split reading progress; progress may not be consistent across devices.

### 3.6 `activity_log` — No Rules, No TTL

- **Issue:** `activity_log` is written by callables but has no Firestore rules and no cleanup mechanism.
- **Location:** `functions/src/social/interactions.ts`, lines 54–65
- **Why it is a problem:** The collection will grow unboundedly. There is no scheduled cleanup. At 100 users with 10 interactions/day, this is 365,000 documents per year with no pruning.
- **Impact:** Cost — unbounded growth; no admin-read access without service account.

### 3.7 Venue Direct Client Writes — No Deduplication

- **Issue:** `venues` and `venues/{venueId}/reviews` allow direct client creation.
- **Location:** `firestore.rules`, lines 628–677
- **Why it is a problem:** A user can create duplicate venues (same name, same address) because the rules only validate field types, not uniqueness. A user can also create unlimited reviews for the same venue because the rule uses `reviewId` as a document ID but does not enforce uniqueness per `userId + venueId` pair (a user could write to multiple `reviewId`s for the same venue).
- **Impact:** Data integrity — duplicate venues; multiple reviews per user.

### 3.8 `user_library_books` Predictable Document IDs

- **Issue:** Document IDs are `{uid}_{bookId}` — both parts are known or guessable.
- **Location:** `functions/src/triggers/aggregationTriggers.ts`, line 69–71
- **Why it is a problem:** An adversary who knows a target user's UID can enumerate a user's library by probing document IDs (if any rule misconfiguration occurs). Currently rules block this, but the ID scheme itself is privacy-sensitive.
- **Impact:** Privacy — predictable ID scheme exposes reading history structure.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| Shelf `entries` map — 1 MB document limit | **High** |
| Dual shelf storage paths — schema drift | **High** |
| `post_stats` counter vs. search field mismatch | **High** |
| Reading session non-idempotency | **High** |
| Venue direct writes — no deduplication | **Medium** |
| `activity_log` unbounded growth | **Medium** |
| `public_profiles` client timestamp | **Low** |
| Predictable `user_library_books` IDs | **Low** |

---

## 5. Systemic Patterns

- **Mixed fan-out strategies** — some aggregations use triggers (post stats), others use transactions inside callables (shelf operations). There is no consistent pattern. Trigger-based fan-outs have at-least-once delivery semantics; if a trigger fails, counters can drift.
- **Incomplete schema documentation** — there is no single schema file defining all document shapes. Shapes are inferred from code. Several collections (e.g., `search_notifications`, `search_bookmarks`) have documents that are only defined by the trigger that creates them, with no schema type definition in the codebase.
- **No TTL or cleanup for derived projections** — `search_feed`, `search_notifications`, `search_bookmarks` grow without bound. No scheduled cleanup functions exist for stale index entries.

---

## 6. Hidden Risks

- **`canReadPostById` in rules makes multiple document reads** — the helper `canReadPostById` calls `get()` on the post document, and `isPublicPostById` also calls `get()` on the same document. If a rule uses both, the post is fetched twice.
- **`isFollowerOf` in rules reads a follower subcollection document** — every `followers`-visibility post read triggers an additional cross-document `exists()` call, adding a third Firestore read per post access check.
- **Missing index for `user_library_books` by `uid` + `updatedAt`** — the collection is queried by `uid` with ordering, but `firestore.indexes.json` was not verified to include a composite index for this query. A missing index causes a full collection scan and a runtime error that only appears at query time.
- **`editions` readable by any signed-in user** — `firestore.rules` line 586: `allow get, list: if isSignedIn()`. There is no visibility or rights check on editions. A signed-in user can list all editions in the catalog unrestricted.
