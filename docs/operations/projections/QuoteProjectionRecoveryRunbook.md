---
id: BT-DOCS-OPERATIONS-PROJECTIONS-QUOTEPROJECTIONRECOVERYRUNBOOK
title: "Projection Recovery Runbook: Quote Projections"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Runbook: Quote Projections

## Projection Name

`user_quotes`, `book_quote_projection`, `social_quote_projection`

## Classification

`fanout_projection`

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
quotes/{quoteId}
```

No quote projection rebuild may use existing quote projection documents as authority.

## Projection Collections

```text
user_quotes
book_quote_projection
social_quote_projection
```

## Maintainer

```text
Normal path: onQuoteProjectionWritten
Recovery path: recoverQuoteProjections
```

## Current Consumers

```text
quote APIs
quote discovery
social composer quote attachments
```

## Expected Indexes

```text
quotes ordered by __name__
quotes where authorUid == ownerId ordered by __name__
quotes where ownerId == ownerId ordered by __name__
quotes where bookId == bookId ordered by __name__
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`
- Reason: each source quote can write or delete up to three projection documents, keeping one batch below Firestore write limits.

## Rebuild Commands

Dry run is the default and must be run first.

```json
{
  "scope": "single_quote",
  "quoteId": "<quoteId>",
  "mode": "dry_run",
  "reason": "Inspect quote projection drift"
}
```

```json
{
  "scope": "single_quote",
  "quoteId": "<quoteId>",
  "mode": "write",
  "reason": "Repair quote projection drift"
}
```

Owner-scoped recovery:

```json
{
  "scope": "owner",
  "ownerId": "<uid>",
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect owner quote projection drift"
}
```

Book-scoped recovery:

```json
{
  "scope": "book",
  "bookId": "<bookId>",
  "mode": "dry_run",
  "batchSize": 100,
  "reason": "Inspect book quote projection drift"
}
```

Checkpointed full recovery:

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed quote projection audit"
}
```

## Verification Query

```text
Authority: quotes/{quoteId}
Projection: user_quotes/{ownerId_quoteId}
Projection: book_quote_projection/{quoteId}
Projection: social_quote_projection/{quoteId}
Expected: projection payload equals buildQuoteProjectionPayload(source quote) plus projectionSurface
```

Private, archived, deleted, or invalid quote authority records must not have public book/social projections.

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- Verification status is `passed`.
- `missingProjectionCount` is `0`.
- `staleProjectionCount` is `0`.
- `extraProjectionCount` is `0`.
- Projection health is `healthy`.

## Rollback Strategy

Quote projection recovery is idempotent and derived only from `quotes/{quoteId}`. Rollback is a re-run after correcting the source quote or projection builder. Do not restore projection documents from backups unless the canonical quote source is also restored.

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| invalid source quote | projection omitted from expected public surfaces | inspect `quotes/{quoteId}` |
| missing projection | verification `missingProjectionCount > 0` | run write recovery for the quote/scope |
| stale projection | verification `staleProjectionCount > 0` | run write recovery |
| extra public projection | verification `extraProjectionCount > 0` | run write recovery |
| missing index | callable failure from Firestore query | deploy required index and retry |
| write failure | failure ledger entry | retry targeted recovery |

## Operator Steps

1. Run dry-run targeted recovery for known `quoteId`, `ownerId`, or `bookId`.
2. Review `wouldWrite`, `failed`, and verification counts.
3. Run the same request with `mode: "write"`.
4. Confirm the verification report passes.
5. Check `projection_health/user_quotes`.
6. If checkpointed full recovery returns `nextCursor`, repeat with the same checkpoint or cursor.
7. Resolve or dead-letter any failure ledger entries.

## Escalation Criteria

Escalate before write mode if dry run reports unexpected high `extraProjectionCount`, repeated write failures, or missing indexes. Do not bypass canonical `quotes/{quoteId}` as the authority source.

