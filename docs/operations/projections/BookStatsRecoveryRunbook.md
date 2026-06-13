---
id: BT-DOCS-OPERATIONS-PROJECTIONS-BOOKSTATSRECOVERYRUNBOOK
title: "Book Stats Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Book Stats Recovery Runbook

## Projection Families

```text
book_stats
book_catalog_counter_projection
```

## Authority Source

```text
reviews/{reviewId}
```

Legacy collections are compatibility-only and must not be used for recovery or certification:

```text
books/{bookId}/reviews/{reviewId}
books/{bookId}/ratings/{userId}
```

## Derived Counters

| Field | Rule |
|---|---|
| `reviews` | count active public canonical reviews |
| `ratingsCount` | count active public canonical reviews with rating `1..5` |
| `ratingSum` | sum valid ratings from active public canonical reviews |
| `averageRating` | `ratingSum / ratingsCount`, or `0` |
| `books.rating` | `averageRating` compatibility field |
| `books.ratingsCount` | `ratingsCount` compatibility field |
| `books.reviewCount` | `reviews` compatibility field |
| `books.reviewsCount` | `reviews` compatibility field |

## Recovery Callable

```text
recoverBookStats
```

Supported scopes:

```text
single_book
owner
collection_page
checkpointed_full
```

Default mode is dry run. Writes require:

```json
{
  "mode": "write",
  "reconciliationMode": "repair"
}
```

## Dry Run

```json
{
  "scope": "single_book",
  "bookId": "book_123",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "verify": true,
  "reason": "Inspect Book Stats drift"
}
```

## Write Repair

```json
{
  "scope": "single_book",
  "bookId": "book_123",
  "mode": "write",
  "reconciliationMode": "repair",
  "verify": true,
  "reason": "Repair Book Stats drift after dry-run verification"
}
```

## Checkpointed Full Audit

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed Book Stats audit"
}
```

Resume with the returned `nextCursor` or the persisted checkpoint id.

## Verification

Verification compares canonical review-derived counters against:

```text
book_stats/{bookId}
books/{bookId}.rating
books/{bookId}.ratingsCount
books/{bookId}.reviewCount
books/{bookId}.reviewsCount
```

Detected drift classes:

| Failure Mode | Detection |
|---|---|
| missing book stats | `book_stats/{bookId}` absent |
| stale book stats | flat or nested counters differ |
| flat/nested mismatch | `book_stats` flat fields differ from `counters.*` |
| rating sum drift | `ratingSum` differs from canonical sum |
| average rating drift | `averageRating` differs from canonical average |
| catalog counter drift | `books` compatibility fields differ |
| missing catalog counter fields | required `books` fields absent |
| orphan book stats | `book_stats` exists for missing `books/{bookId}` |

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed` for `book_stats`.
- Verification status is `passed` for `book_catalog_counter_projection`.
- `missingProjectionCount` is `0`.
- `staleProjectionCount` is `0`.
- `mismatchCount` is `0`.
- `extraProjectionCount` is `0`.
- Projection health is `healthy`.

## Operator Steps

1. Run dry-run for the affected `single_book`, `owner`, or checkpointed scope.
2. Review verification reports for `book_stats` and `book_catalog_counter_projection`.
3. Inspect failure ledger entries if `failed > 0`.
4. If drift is expected and bounded, rerun with `mode=write` and `reconciliationMode=repair`.
5. Confirm verification reports pass.
6. Confirm `projection_health/book_stats`.
7. Confirm `projection_health/book_catalog_counter_projection`.
8. Resolve or dead-letter failure ledger entries with an operator note.

## Escalation Criteria

Escalate before write mode when:

- a single book exceeds the bounded authority scan cap,
- orphan `book_stats` records are detected,
- missing book catalog documents are detected,
- repeated write failures occur,
- verification reports disagree between `book_stats` and catalog counter fields.
