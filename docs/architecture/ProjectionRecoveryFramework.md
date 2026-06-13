---
id: BT-DOCS-ARCHITECTURE-PROJECTIONRECOVERYFRAMEWORK
title: "Projection Recovery Framework"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Recovery Framework

Status: Phase 8A control-plane standard
Applies to: every BookTown derived projection
Authoritative registry: `docs/architecture/ProjectionRegistry.md`
Technical contract: `functions/src/operations/projectionRecoveryControlPlane.ts`

## Architecture Decisions

### ADR-001: One Recovery Control Plane

BookTown uses one operational recovery contract for every projection. Projection-specific rebuilds may differ in implementation, but they must all accept the shared request shape, produce the shared summary shape, update checkpoints the same way, report verification the same way, and record trigger failures in the same ledger.

This prevents one-off rebuild scripts from becoming hidden production dependencies.

### ADR-002: Dry Run Is the Default

Every recovery entry point defaults to `dry_run`. Write mode must be explicit. A dry run must scan the same authority records and compute the same intended projection writes as write mode, but it must not mutate projection documents.

### ADR-003: Checkpointed, Bounded, Restartable Work Only

Recovery jobs must be cursor or checkpoint based. A production recovery job must not load an entire collection into memory, must not delete a projection collection before rebuilding it, and must not require a single uninterrupted run to complete.

Default batch size is `100`; hard max batch size is `500`.

### ADR-004: Verification Is Part of Recovery

Recovery is not complete until verification runs. Verification compares authority records with projection records and reports missing, stale, and extra projection documents. For large projections, verification may be checkpointed, but it must produce a structured result.

### ADR-005: Trigger Failures Are Data Integrity Events

Every trigger-maintained projection must record failures into the projection failure ledger. Partial fanout is a failure. Logging alone is not sufficient.

### ADR-006: Certification Is Enforced by Missing Capabilities

A projection cannot be `production_ready` unless the certification gate finds no missing requirements. The gate is intentionally strict: beta-operable projections remain blocked from production until rebuild, verification, failure recovery, and runbook requirements are met.

## Control-Plane Collections

The shared control plane reserves these operational collections:

| Collection | Purpose |
|---|---|
| `projection_recovery_runs` | One document per recovery execution. |
| `projection_recovery_checkpoints` | Restart cursors and leases for checkpointed jobs. |
| `projection_failure_ledger` | Trigger and recovery failures requiring retry, ignore, or dead-letter decision. |
| `projection_health` | Current health and certification posture per projection. |
| `projection_recovery_reports` | Structured verification and recovery reports. |

These collections are operational metadata only. They are not business authority.

## Shared Types

The TypeScript contract is defined in `functions/src/operations/projectionRecoveryControlPlane.ts`.

Required exported types:

| Type | Purpose |
|---|---|
| `ProjectionDefinition` | Registry entry for one projection or projection family. |
| `RecoveryRequest` | Operator or scheduled recovery request. |
| `RecoverySummary` | Structured report for a recovery run. |
| `ProjectionFailureRecord` | Failure ledger record for trigger/rebuild/reconcile failures. |
| `ProjectionHealth` | Current projection health and certification state. |
| `ProjectionCertificationStatus` | `not_ready`, `beta_ready`, `production_ready`, or `deprecated`. |
| `RecoveryCheckpoint` | Restart state for bounded recovery jobs. |
| `VerificationResult` | Authority-vs-projection verification result. |

## Recovery Request Contract

Every recovery implementation must accept:

```ts
type RecoveryRequest = {
  projectionName: string;
  mode?: "dry_run" | "write";
  scope: "single_doc" | "owner" | "collection_page" | "checkpointed_full";
  targetId?: string;
  ownerId?: string;
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  requestedBy: string;
  reason: string;
  correlationId?: string;
};
```

Rules:

- Missing `mode` means `dry_run`.
- `batchSize` is clamped to `1..500`.
- `verify` defaults to `true`.
- `requestedBy` and `reason` are mandatory for auditability.
- `write` mode must produce a `RecoverySummary`.

## Recovery Summary Contract

Every run must report:

```ts
type RecoverySummary = {
  runId: string;
  projectionName: string;
  mode: "dry_run" | "write";
  scope: RecoveryScope;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  scanned: number;
  eligible: number;
  wouldWrite: number;
  written: number;
  skipped: number;
  failed: number;
  verified: number;
  verificationFailures: number;
  nextCursor: string | null;
  checkpointUpdated: boolean;
};
```

Counts must be deterministic. `wouldWrite` is required in both dry-run and write mode.

## Failure Ledger Design

Every projection failure record must include:

- projection name
- projection collection
- trigger or job name
- source document path
- source event id where available
- operation type
- failure class
- severity
- retry status
- retry count
- next retry timestamp
- last error code/message
- audit timestamps

Failure classes are fixed:

| Class | Meaning |
|---|---|
| `validation_failed` | Source data cannot produce a valid projection. |
| `authority_missing` | Required authority document or storage object is missing. |
| `permission_denied` | IAM, rules, or service account failure. |
| `index_missing` | Firestore index required by recovery or verification is missing. |
| `write_failed` | Projection write failed. |
| `timeout` | Work exceeded runtime or external dependency budget. |
| `partial_fanout` | Some projection writes succeeded and others failed. |
| `unknown` | Failure does not fit a known class. |

Retry statuses are fixed:

| Status | Meaning |
|---|---|
| `pending` | Failure is waiting for retry. |
| `retrying` | Recovery worker is actively retrying. |
| `recovered` | Projection was repaired. |
| `ignored` | Operator intentionally ignored it with note. |
| `dead_letter` | Recovery cannot proceed automatically. |

## Checkpoint Design

Each checkpoint stores:

- checkpoint id
- projection name
- recovery scope
- cursor
- last processed document path
- batch size
- cumulative scanned/written/failed counts
- run status
- lease owner and lease expiry
- update timestamp

Checkpoint rules:

- A checkpoint must be safe to resume after process termination.
- A checkpoint must never imply success unless the summary and verification also completed.
- Long-running full rebuilds must write checkpoints after every committed batch.
- A stale lease can be taken over by a later run.

## Verification Design

Verification must compare canonical authority state to derived projection state. It must classify:

- missing projection
- stale projection
- extra projection
- schema/version mismatch
- unverified due to cap or missing index

Verification may be targeted or checkpointed. For production certification, every projection must have at least one documented verification query and a bounded full verification strategy.

## Certification Gate

The pure certification evaluator is `evaluateProjectionCertification`. It fails production certification when any required capability is missing:

- registered definition
- authority source
- maintainer
- bounded rebuild path
- dry-run support
- checkpoint support
- idempotent execution
- restartable execution
- structured reporting
- verification support
- failure ledger support
- operator runbook
- documented indexes
- no global destructive rebuild
- bounded production queries

## Implementation Roadmap for Phase 8A.2+

1. Convert the registry table into typed `ProjectionDefinition` entries.
2. Add the first failure ledger writer.
3. Add quote projection recovery using the shared contract.
4. Add notification summary recovery and reconciliation using the shared contract.
5. Add canonical review projection recovery using the shared contract.
6. Add search projection recovery using the shared contract.
7. Replace destructive global backfills with checkpointed recovery jobs.
8. Add projection health documents and certification gate reporting.
9. Add projection-specific runbooks from the template.
10. Block production certification when any required projection fails the gate.

