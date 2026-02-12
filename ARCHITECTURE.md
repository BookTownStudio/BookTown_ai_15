
# BookTown v1.0 Architecture Specification

**Status:** LOCKED & VALIDATED 🔒
**Last Updated:** Phase 4 Lockdown Complete (V1 Interaction Architecture)

## 1. Data Authority Contract (Phase 4 Enforcement)

BookTown operates on a **Backend-Only Aggregation** model. This ensures scalability and data integrity across all social surfaces.

### 1.1 Invariant: Derived Stats Authority
*   **Definition**: All numeric counters (likes, followers, review counts, etc.) are **Derived Data**.
*   **Write Restriction**: Clients are strictly forbidden from mutating numeric fields at the database level. Updates occur exclusively via Firestore Triggers or Admin-level backfills.
*   **Read Path**: UI must fetch numeric counters from specialized `*_stats` collections (e.g., `post_stats/{postId}`) using canonical field names (`likesCount`, etc).

### 1.2 Invariant: Existence Document signals
*   **Definition**: Social interactions (Like, Repost, Bookmark) are represented by the **existence of a document** in a subcollection under the user's domain.
*   **Locality Rule**: Truth resides in `users/{uid}/{type}/{entityId}`. This ensures user-centric scaling and simple history retrieval.
*   **No Arrays**: Array-based interactions (e.g., `likes: [uid1, uid2]`) are strictly forbidden.

## 2. Social & Engagement Contract (V1 Locked)

| Action | Client Requirement (Write Path) | Backend Response |
| :--- | :--- | :--- |
| **Like Post** | Create `users/{uid}/likes/{postId}` | Trigger increments `post_stats/{postId}.likesCount` |
| **Repost** | Create `users/{uid}/reposts/{postId}` | Trigger increments `post_stats/{postId}.repostsCount` |
| **Bookmark** | Create `users/{uid}/bookmarks/{postId}` | Trigger increments `post_stats/{postId}.bookmarksCount` |
| **Follow User** | Create `users/{uid}/follows/users/{targetId}` | Trigger increments actor and target stats |

## 3. Deletion Semantics
*   **Social Envelopes**: Posts, Reviews, and Events use **Soft Delete** via a `deletedAt` timestamp. This preserves interaction references.
*   **Transient Data**: Drafts and temporary uploads may be hard-deleted.

## 4. AI & Canonical Separation
AI-generated data (recommendations, vibes) is stored in secondary indices and treated as **Non-Authoritative**. AI may never overwrite primary user-authored content.
