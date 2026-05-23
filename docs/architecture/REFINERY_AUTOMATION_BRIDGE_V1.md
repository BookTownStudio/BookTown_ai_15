# BookTown Refinery Automation Bridge V1

## Authority Boundary

`booktown-canonical-factory` produces local intelligence artifacts. It does not write Firestore and does not own canonical truth.

`n8n` orchestrates transport only. It reads `refinery_payload.json` and calls the backend callable `submitRefineryArtifacts`.

BookTown backend owns validation, authority gating, canonical locks, and all database writes through `submitRefineryArtifacts` and `materializeBookAuthority`.

## Local Export

Run:

```bash
node scripts/refineryAutomationBridge.mjs \
  --input-dir /path/to/booktown-canonical-factory/output \
  --output-dir /path/to/booktown-canonical-factory/export \
  --factory-version 2026.05.23
```

Inputs:

- `semantic_enrichment.jsonl`
- `book_vectors.jsonl`

Outputs:

- `refinery_payload.json`
- `.booktown-refinery-ledger.json`

The exporter combines records by exact normalized title and emits only records not previously exported at the same artifact and embedding versions.

## Payload Shape

`refinery_payload.json` is a local envelope:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-23T00:00:00.000Z",
  "provider": "booktownRefinery",
  "callableName": "submitRefineryArtifacts",
  "callablePayload": {
    "artifacts": []
  },
  "observability": {
    "processed": 0,
    "rejected": 0,
    "failed": 0,
    "duplicate": 0,
    "exported": 0,
    "durationMs": 0,
    "exportBatchSize": 0
  }
}
```

n8n must POST only `callablePayload` to the callable transport. The local envelope is not a backend contract.

## n8n Integration

Use a scheduled trigger, not a folder watch. A scheduled trigger gives deterministic retries and avoids partial-file reads while the local refinery is still writing JSONL.

Recommended schedule:

- every 15 minutes for active refinery runs
- hourly for normal operation

HTTP request:

- Method: `POST`
- URL: Firebase callable endpoint for `submitRefineryArtifacts`
- Body: `refinery_payload.json.callablePayload`
- Auth: Firebase callable authentication with a `superadmin` or `system` role
- App Check: required by the callable

Do not expose this endpoint to client UI. This is an operator/system transport path only.

## Retry Behavior

Default exports skip ledger records with terminal status `exported` or `accepted` when artifact versions are unchanged.

If n8n/backend transport fails, mark the ledger record `status` as `failed`. The next normal export will not replay it automatically.

To intentionally retry failed records:

```bash
node scripts/refineryAutomationBridge.mjs \
  --input-dir /path/to/output \
  --output-dir /path/to/export \
  --retry-failed
```

Retry increments `retryCount` and re-emits the artifact.

## Replay Behavior

Replay is version-based. A previously exported artifact is emitted again only when:

- semantic artifact content changes
- embedding descriptor/version changes
- the ledger status is `failed` and `--retry-failed` is used

Manual replay requires changing the source artifact version or explicitly marking a ledger record failed.

## Failure Handling

Local exporter failures:

- invalid JSONL fails closed
- invalid ledger schema fails closed
- missing input files are treated as empty inputs

Backend callable failures:

- schema mismatch is rejected by `submitRefineryArtifacts`
- provider mismatch is rejected
- authority field ownership is rejected
- missing or ambiguous canonical target is rejected

Rejected artifacts remain local evidence only. They are not canonical truth.

## Observability

The exporter records:

- `processed`
- `rejected`
- `failed`
- `duplicate`
- `exported`
- `durationMs`
- `exportBatchSize`

Backend observability remains in `submitRefineryArtifacts` logs.
