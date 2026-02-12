
# BookTown Read-Path Contract v1.0

This document defines the strictly allowed query patterns for BookTown. Any data access outside these patterns is considered an architectural violation.

## 1. Social & Engagement Surfaces (V1 Locked)

| Surface | Primary Source | Supplemental Reads (Signals) | Constraints |
| :--- | :--- | :--- | :--- |
| **Social Feed** | `feeds/{feedId}/items` | `post_stats/{postId}`, `users/{uid}/likes/{postId}` | Must order by `createdAt` DESC. |
| **Post Detail** | `posts/{postId}` | `post_stats/{postId}`, `users/{uid}/likes/{postId}` | Max 4 parallel reads per view. |
| **User Profile** | `users/{userId}` | `user_stats/{userId}`, `users/{uid}/follows/users/{userId}` | Counts must come from `user_stats`. |

## 2. Catalog & Discovery

| Surface | Primary Source | Supplemental Reads | Constraints |
| :--- | :--- | :--- | :--- |
| **Book Card** | `books/{bookId}` | `book_stats/{bookId}` | Review aggregation at runtime is forbidden. |
| **Shelf View** | `shelves/{shelfId}` | `shelf_items/{shelfId}`, `shelf_stats/{shelfId}` | Paged access to shelf items only. |
| **Search Results** | Federated Search Service | `book_stats/{bookId}` | Hydrate with precomputed stats. |

## 3. Required Composite Indexes

The following indexes are mandated for production scalability:

### Feeds & Posts
* `feeds/{feedId}/items`: `feedId` (ASC), `createdAt` (DESC)
* `posts`: `authorId` (ASC), `createdAt` (DESC)
* `posts`: `visibility` (ASC), `createdAt` (DESC)

### Relationships & Activity
* `users/{uid}/bookmarks`: `timestamp` (DESC)
* `users/{uid}/likes`: `timestamp` (DESC)
* `users/{uid}/reposts`: `timestamp` (DESC)

## 4. Query Limits
* **Max Parallel Reads**: 5 per view component.
* **Max Screen Latency Target**: 200ms for primary document fetch.
* **No `count()`**: Use `*_stats` precomputed fields only.
