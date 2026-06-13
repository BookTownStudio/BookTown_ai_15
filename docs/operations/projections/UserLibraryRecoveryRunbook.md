---
id: BT-DOCS-OPERATIONS-PROJECTIONS-USERLIBRARYRECOVERYRUNBOOK
title: "Projection Recovery Runbook: User Library Books"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Runbook: User Library Books

## Projection Name

`user_library_books`

## Classification

`aggregate_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
shelf_books
reading_progress
```

No recovery, verification, or reconciliation path may use `user_library_books`, client state, cached state, or another projection as authority.

## Projection Collections

```text
user_library_books
```

## Maintainer

```text
Normal path: onShelfEntriesWritten, onReadingProgressWritten
Recovery path: recoverUserLibraryBooks
```

## Current Consumers

```text
library
profile
search
admin
```

## Expected Indexes

```text
user_library_books where uid == uid ordered by updatedAt desc
shelf_books ordered by __name__
shelf_books where ownerId == uid ordered by __name__
shelf_books where bookId == bookId ordered by __name__
shelf_books where ownerId == uid and bookId == bookId
reading_progress ordered by __name__
reading_progress where uid == uid ordered by __name__
reading_progress where userId == uid ordered by __name__
reading_progress where bookId == bookId ordered by __name__
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each candidate recomputes one `{uid, bookId}` projection from bounded authority reads and writes at most one projection document.

## Rebuild Commands

Dry run is the default and must run before write mode.

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect user library projection drift"
}
```

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "write",
  "batchSize": 100,
  "verify": true,
  "reason": "Repair user library projection drift"
}
```

Book-scoped recovery:

```json
{
  "scope": "single_book",
  "bookId": "<bookId>",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect book library membership drift"
}
```

Checkpointed full recovery:

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed user library audit"
}
```

Repeat with the returned `nextCursor` or checkpoint until `nextCursor` is `null`. Use `mode: "write"` only after the dry-run counts match the incident scope.

## Verification Query

```text
Authority: shelf_books(ownerId, bookId) excluding isVirtual == true, plus reading_progress/{uid_bookId}
Projection: user_library_books/{uid_bookId}
Expected: uid, bookId, sorted shelfIds, and hasProgress exactly match canonical authority
```

Verification reports `missingProjectionCount`, `staleProjectionCount`, `mismatchCount`, `extraProjectionCount`, and `verificationSuccessRate`.

## Reconciliation Path

```text
report_only: dry-run/write summary and verification report without projection mutation
repair: write mode sets stale/missing projections or deletes orphan projections for the bounded candidate set
```

Reconciliation is checkpointed and restartable for `checkpointed_full`; targeted scopes are bounded by `batchSize`.

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- `verificationFailures` is `0`.
- `missingProjectionCount` is `0`.
- `staleProjectionCount` is `0`.
- `mismatchCount` is `0`.
- `extraProjectionCount` is `0`.
- `nextCursor` is `null` for full runs.
- `projection_health/user_library_books` is `healthy`.

## Rollback Strategy

Recovery is idempotent and derived exclusively from `shelf_books` and `reading_progress`. Rollback is a corrected rerun from canonical authority. Do not restore `user_library_books` from backup unless the matching canonical authority documents are also restored.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| missing projection | verification `missingProjectionCount > 0` | run write recovery for the same scope |
| stale shelf membership | verification `staleProjectionCount > 0` or `mismatchCount > 0` | run write recovery; inspect `shelf_books` authority |
| stale reading state | verification `staleProjectionCount > 0` or `mismatchCount > 0` | run write recovery; inspect `reading_progress` authority |
| orphan projection | verification `extraProjectionCount > 0` | run repair for the bounded scope |
| missing index | Firestore query failure | deploy required index and retry checkpoint |
| write failure | `projection_failure_ledger` entry | retry targeted recovery after fixing the error |

## Operator Steps

1. Check `projection_health/user_library_books`.
2. Inspect `projection_failure_ledger` for pending `user_library_books` failures.
3. Run targeted dry-run recovery for known `ownerId` or `bookId`.
4. Review `wouldWrite`, verification drift counts, and sample failures.
5. Run the same request with `mode: "write"` when counts are expected.
6. For broad drift, run `checkpointed_full` with `batchSize: 100` until `nextCursor` is `null`.
7. Confirm verification passes and health returns to `healthy`.
8. Mark related failure ledger records `recovered`, `ignored`, or `dead_letter` with an operator note.

## Escalation Criteria

Escalate before write mode if dry run reports unexpected high orphan counts, repeated write failures, missing required indexes, or drift that suggests corrupted canonical `shelf_books` or `reading_progress` authority.
