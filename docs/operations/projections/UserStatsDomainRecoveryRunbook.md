# User Stats Domain Recovery Runbook

## Projection Families

```text
library_user_stats
shelf_user_stats
content_user_stats
writing_user_stats
profile_quality_stats
storage_user_stats
```

`user_stats` is a compatibility envelope. It must not be certified as one aggregate projection.

## Authority Sources

| Domain | Authority |
|---|---|
| `library_user_stats` | `user_library_books` |
| `shelf_user_stats` | `shelves` |
| `content_user_stats` | `posts`, `reviews`, `quotes` |
| `writing_user_stats` | `users/{uid}/projects` |
| `profile_quality_stats` | `users`, certified domain stats |
| `storage_user_stats` | `attachments`, storage metadata |

`social_user_stats` is already certified separately and is not duplicated here.

## Recovery Callable

```text
recoverUserStatsDomains
```

Supported scopes:

```text
single_user
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
  "scope": "single_user",
  "uid": "user_123",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "verify": true,
  "reason": "Inspect user stats domain drift"
}
```

## Write Repair

```json
{
  "scope": "single_user",
  "uid": "user_123",
  "mode": "write",
  "reconciliationMode": "repair",
  "verify": true,
  "reason": "Repair user stats domain drift after dry-run verification"
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
  "reason": "Checkpointed user stats domain audit"
}
```

Optional domain filter:

```json
{
  "domains": ["library_user_stats", "profile_quality_stats"]
}
```

## Verification

Verification writes one report per requested domain and detects:

| Failure Mode | Detection |
|---|---|
| missing stats | `user_stats/{uid}` absent |
| stale stats | compatibility field differs from domain authority |
| orphan stats | `user_stats/{uid}` exists for missing `users/{uid}` |
| domain drift | domain-specific values differ |
| success rate | matched users divided by scanned users |

## Operator Steps

1. Run dry-run for `single_user`, `collection_page`, or `checkpointed_full`.
2. Review domain verification reports.
3. Inspect failure ledger entries if `failed > 0`.
4. Rerun with `mode=write` and `reconciliationMode=repair` only after dry-run review.
5. Confirm projection health for each domain.
6. Resolve or dead-letter failure ledger entries with an operator note.

## Compatibility Contract

The recovery path writes existing `user_stats/{uid}` fields only. It does not change profile, matchmaker, reader, UI, or social behavior.
