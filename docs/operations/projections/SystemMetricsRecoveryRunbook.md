# System Metrics Recovery Runbook

## Authority

Canonical authorities are existing metric writes in `system_metrics`, daily buckets in `system_metrics_daily`, and retained `system_events` replay evidence. No new authority collection is introduced.

## Projection

`system_metrics` is an operational projection consumed by admin dashboards and daily exports. `system_metrics_daily` is the date-bucket companion surface used by analytics export recovery.

## Dry Run Command

```json
{
  "projectionName": "system_metrics",
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "reconciliationMode": "report_only",
  "reason": "Phase 8A system metrics verification"
}
```

## Write Command

```json
{
  "projectionName": "system_metrics",
  "scope": "checkpointed_full",
  "mode": "write",
  "reconciliationMode": "repair",
  "reason": "Approved Phase 8A system metrics marker repair"
}
```

## Verification Query

Use `recoverTier1PublicBetaProjection` with `scope=checkpointed_full` for bounded registry verification. For export-specific drift, use the certified analytics daily export verifier against `system_metrics`, `system_metrics_daily`, and `system_events`.

## Failure Modes

- Missing metric document.
- Stale or incomplete operational marker fields.
- Daily bucket drift detected by analytics export verification.
- Event retention gap that prevents historical replay.
- Recovery checkpoint write failure.

## Operator Steps

1. Run dry-run verification first.
2. Review verification report, recovery run summary, and projection health for `system_metrics`.
3. Inspect failure ledger entries before approving write mode.
4. Run write mode only for approved marker or compatibility repair.
5. Re-run dry-run verification and confirm zero missing or stale records.

## Escalation Criteria

Escalate if retained event history cannot explain metric state, if export verification reports daily bucket drift after repair, or if checkpoint progress fails repeatedly.

## Event Replay Procedures

Historical metric values may be validated against retained `system_events` and daily export evidence. Do not replay application behavior from this runbook; use date-targeted analytics export recovery for export regeneration and escalate any full metric recomputation requirement.
