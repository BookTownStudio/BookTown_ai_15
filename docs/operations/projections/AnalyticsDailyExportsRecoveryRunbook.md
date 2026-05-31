# Analytics Daily Exports Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `analytics_daily_exports`

## Authority Source

Authority collections:

- `system_metrics`
- `system_metrics_daily`
- `system_events`

Projection target:

- `analytics_exports/{dateKey}`

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "single_day",
  "dateKey": "2026-05-30",
  "reason": "Verify analytics export for date"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "single_day",
  "dateKey": "2026-05-30",
  "reason": "Rerun analytics export for date after dry-run verification"
}
```

## Date Rerun Procedure

Use `recoverAnalyticsDailyExports` with `scope=single_day`.

The write path recomputes the exact export document from current authority data and writes `analytics_exports/{dateKey}` idempotently. It does not delete historical exports.

## Checkpointed Full Recovery

```json
{
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "checkpointId": "analytics_daily_exports:checkpointed_full:global",
  "batchSize": 100,
  "reason": "Checkpointed analytics export verification"
}
```

Resume with the same `checkpointId`.

## Verification Query

Verifier reads bounded pages from `system_metrics_daily` and compares each `analytics_exports/{dateKey}` against:

- `system_metrics/global`
- `system_metrics/growth`
- `system_metrics/engagement`
- `system_metrics/moderation`
- `system_metrics_daily/{dateKey}`
- `system_metrics_daily/{previousDateKey}`
- `system_events.count()`

Detected drift:

- missing export
- stale export
- metric mismatch
- export drift

## Failure Modes

- missing daily metrics authority
- stale export document
- system event count query failure
- write failure
- checkpoint cannot advance

## Operator Steps

1. Run dry-run for the target date or checkpointed scope.
2. Review verification and failure ledger records.
3. Rerun in write repair mode for affected dates.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if:

- verification success rate is below `0.995`
- export recomputation disagrees after repair
- `system_events.count()` fails repeatedly
- required indexes are missing in production
