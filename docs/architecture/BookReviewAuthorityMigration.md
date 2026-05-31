# Book Review Authority Migration

## Status

Phase 8A.11B locks Book Stats certification authority to:

```text
reviews/{reviewId}
```

Canonical review IDs remain:

```text
{uid}_{bookId}
```

Legacy book-scoped review and rating collections remain in place for compatibility only. They must not be used as authority for Phase 8A.11C Book Stats certification.

## Authority Contract

Canonical collection:

```text
reviews/{reviewId}
```

Canonical fields:

| Field | Requirement |
|---|---|
| `uid` | review owner uid |
| `bookId` | reviewed book id |
| `rating` | integer `1..5` |
| `reviewText` | review body |
| `visibility` | `public` or `private` |
| `status` | `active` or `deleted` |
| `createdAt` | creation timestamp |
| `updatedAt` | last update timestamp |

Certified Book Stats rebuild, verification, and reconciliation must derive these values only from canonical reviews:

| Book Stats Value | Canonical Rule |
|---|---|
| `reviews` | count active public canonical reviews |
| `ratingsCount` | count active public canonical reviews with valid rating |
| `ratingSum` | sum valid ratings from active public canonical reviews |
| `averageRating` | `ratingSum / ratingsCount`, or `0` when empty |

## Legacy Compatibility Collections

| Collection | Runtime Status | Certification Status | Required Action |
|---|---|---|---|
| `books/{bookId}/reviews/{reviewId}` | retained for Goodreads/import compatibility and existing readers | compatibility only | exclude from Book Stats authority; migrate future imports to canonical reviews |
| `books/{bookId}/ratings/{userId}` | retained for Goodreads/import compatibility | compatibility only | exclude from Book Stats authority; migrate future imports to canonical reviews |

These collections must not be deleted during Phase 8A.11B. Existing runtime compatibility is intentionally preserved.

## Legacy Dependency Inventory

| Component | Legacy Reference | Classification | Phase 8A.11B Action |
|---|---|---|---|
| `functions/src/imports/goodreadsImport.ts` | writes `books/{bookId}/reviews/{uid}` and `books/{bookId}/ratings/{uid}` | KEEP | document as Goodreads compatibility; migrate in a later import change |
| `functions/src/triggers/aggregationTriggers.ts:onLegacyBookReviewWritten` | listens to `books/{bookId}/reviews/{reviewId}` and mutates `book_stats` / `user_reviews` | DEPRECATE | compatibility only; excluded from certification authority |
| `functions/src/triggers/aggregationTriggers.ts:onBookRatingWritten` | listens to `books/{bookId}/ratings/{userId}` and mutates `book_stats` | DEPRECATE | compatibility only; excluded from certification authority |
| `functions/src/admin/reconcileReviewAggregates.ts` | reads legacy reviews and ratings to repair `book_stats` | REMOVE_FROM_CERTIFICATION | do not use for Phase 8A.11C; replace with canonical reviews-only reconciliation |
| `functions/src/admin/backfillStats.ts` | reads legacy reviews and ratings to write `book_stats` | REMOVE_FROM_CERTIFICATION | do not use for Book Stats certification; replace with canonical reviews-only recovery |
| `functions/src/operations/projectionRegistry.ts` | previously listed legacy collections as `book_stats` authority | MIGRATE | updated to `reviews/{reviewId}` only |
| `docs/architecture/ProjectionRegistry.md` | previously listed legacy collections as authority | MIGRATE | updated to canonical authority with legacy compatibility note |

## Goodreads Compatibility Strategy

Goodreads import compatibility remains intact in Phase 8A.11B. No import data is migrated and no legacy import writes are removed.

Before Book Stats reaches production-ready certification, Goodreads review/rating ingestion must stop relying on legacy book-scoped authority for certified counters. The safe migration path is:

1. Preserve legacy writes only for compatibility readers that still require them.
2. Add or route import review/rating authority into `reviews/{uid}_{bookId}`.
3. Ensure imported private reviews/ratings keep their current visibility semantics.
4. Rebuild certified Book Stats only from canonical `reviews/{reviewId}`.

## Certification Impact

Removed blocker:

- Book Stats registry authority is no longer ambiguous. `reviews/{reviewId}` is the only approved future authority.

Remaining blockers:

- Canonical reviews-only Book Stats recovery does not exist.
- Canonical reviews-only Book Stats verification does not exist.
- Canonical reviews-only Book Stats reconciliation does not exist.
- Legacy triggers still mutate `book_stats` at runtime for compatibility.
- Goodreads import still writes legacy review/rating documents.
- `books.rating` and `books.ratingsCount` remain active compatibility ranking fields and need certification or replacement.
- Book Stats failure ledger, health integration, verification reports, checkpointing, and runbook remain required.

## Phase 8A.11C Certification

Phase 8A.11C adds certified Book Stats recovery for `book_stats` and `book_catalog_counter_projection`.

The certified recovery path:

- reads only `reviews/{reviewId}` as authority,
- treats `books/{bookId}/reviews/{reviewId}` as legacy compatibility,
- treats `books/{bookId}/ratings/{userId}` as legacy compatibility,
- recomputes exact counters without increment-based repair,
- supports dry-run first,
- supports explicit write mode,
- is checkpointed,
- records failures in the Phase 8A failure ledger,
- updates projection health,
- writes verification reports,
- documents operator steps in a runbook.
