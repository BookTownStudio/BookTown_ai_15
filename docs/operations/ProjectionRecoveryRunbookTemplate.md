# Projection Recovery Runbook Template

Use this template for every projection listed in `docs/architecture/ProjectionRegistry.md`.

## Projection Name

`<projection_name>`

## Classification

`<fanout_projection | aggregate_projection | search_projection | media_derivative_projection | operational_projection | compatibility_projection>`

## Certification Status

- Current: `<not_ready | beta_ready | production_ready | deprecated>`
- Required: `<not_ready | beta_ready | production_ready | deprecated>`

## Authority Source

List canonical source collections, documents, and storage paths.

```text
<authority source>
```

## Projection Collections

List every derived collection or embedded field written by the projection.

```text
<projection collection or field>
```

## Maintainer

List triggers, scheduled jobs, callables, scripts, or manual jobs that write the projection.

```text
<maintainer>
```

## Current Consumers

List read paths and user/admin surfaces that depend on this projection.

```text
<consumer>
```

## Expected Indexes

List required Firestore indexes and query shapes. Include collection group indexes.

```text
<index or query shape>
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `500`
- Projection-specific lower limit: `<value if lower than 500>`

## Rebuild Command

Dry run must be listed first.

```bash
<dry-run command>
<write command>
```

## Recovery Request

```json
{
  "projectionName": "<projection_name>",
  "mode": "dry_run",
  "scope": "checkpointed_full",
  "batchSize": 100,
  "maxDocs": 500,
  "verify": true,
  "requestedBy": "<operator>",
  "reason": "<incident or maintenance reason>"
}
```

## Verification Query

Document the authority query and projection query used to prove recovery.

```text
Authority: <query>
Projection: <query>
Expected: <matching rule>
```

## Success Criteria

- Recovery summary status is `completed`.
- `failed` is `0`.
- `verificationFailures` is `0`.
- `nextCursor` is `null` for full runs.
- Projection health returns to `healthy`.
- Failure ledger records are `recovered` or intentionally `ignored` with operator note.

## Rollback Strategy

Projection recovery must be idempotent. Rollback is normally a re-run from canonical authority, not a projection restore. If a projection write introduced bad derived data, run write recovery again after fixing the projection builder.

```text
<projection-specific rollback or re-run notes>
```

## Known Failure Modes

| Failure Mode | Detection | Operator Action |
|---|---|---|
| validation failed | failure ledger class `validation_failed` | inspect source data |
| authority missing | failure ledger class `authority_missing` | verify source document/storage path |
| index missing | Firestore failed-precondition or ledger class `index_missing` | deploy required index, then retry |
| write failed | ledger class `write_failed` | retry bounded recovery |
| timeout | ledger class `timeout` | lower batch size, resume checkpoint |
| partial fanout | ledger class `partial_fanout` | targeted rebuild for source document |

## Operator Steps

1. Confirm incident scope in projection health.
2. Inspect recent failure ledger entries for the projection.
3. Run targeted dry-run recovery when a source id is known.
4. Review `wouldWrite`, `skipped`, and `failed` counts.
5. Run write recovery with the same scope.
6. Run verification.
7. Confirm projection health is `healthy`.
8. Mark failure records `recovered`, `ignored`, or `dead_letter`.
9. Add an incident note with run id and verification id.

## Escalation Criteria

Escalate before write mode when:

- dry run reports unexpected delete or overwrite volume
- missing authority count is above expected incident scope
- required index is missing
- batch repeatedly times out at minimum safe batch size
- verification reports extra projection documents that cannot be explained
- recovery would touch regulated deletion/privacy surfaces

