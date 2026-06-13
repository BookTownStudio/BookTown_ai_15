---
id: BT-DOCS-OPERATIONS-PROJECTIONCERTIFICATIONGATE
title: "Projection Certification Gate"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Projection Certification Gate

Status: Phase 8A production gate
Registry: `docs/architecture/ProjectionRegistry.md`
Contract: `functions/src/operations/projectionRecoveryControlPlane.ts`

## Purpose

The certification gate prevents BookTown from treating a derived projection as production-ready until it is rebuildable, verifiable, recoverable, documented, and safe for large production datasets.

## Gate Input

Every projection must have a `ProjectionDefinition`:

```ts
type ProjectionDefinition = {
  projectionName: string;
  classification: ProjectionClassification;
  authoritySources: string[];
  projectionCollections: string[];
  maintainer: ProjectionMaintainer;
  currentConsumers: string[];
  rebuildSupported: boolean;
  verificationSupported: boolean;
  reconciliationSupported: boolean;
  failureLedgerSupported: boolean;
  dryRunSupported: boolean;
  checkpointSupported: boolean;
  structuredReportingSupported: boolean;
  idempotent: boolean;
  restartable: boolean;
  destructiveRebuildAllowed: false;
  maxBatchSize: number;
  maxRuntimeSeconds: number;
  requiredIndexes: string[];
  runbookPath: string | null;
  currentCertificationStatus: ProjectionCertificationStatus;
  requiredCertificationStatus: ProjectionCertificationStatus;
};
```

## Required Production Criteria

The gate fails when any of these are missing:

| Requirement | Production Rule |
|---|---|
| registered definition | Projection name must be present. |
| authority source documented | At least one canonical authority source must be listed. |
| maintainer documented | Trigger, scheduled job, manual rebuild, or hybrid owner must be listed. |
| bounded rebuild path | `rebuildSupported` must be true. |
| dry-run support | `dryRunSupported` must be true. |
| checkpoint support | `checkpointSupported` must be true. |
| idempotent execution | `idempotent` must be true. |
| restartable execution | `restartable` must be true. |
| structured reporting | `structuredReportingSupported` must be true. |
| verification support | `verificationSupported` must be true. |
| failure ledger support | `failureLedgerSupported` must be true. |
| operator runbook | `runbookPath` must be present. |
| documented indexes | `requiredIndexes` must be non-empty. Use `none_required` only when no index is needed. |
| no global destructive rebuild | `destructiveRebuildAllowed` must be false. |
| bounded production queries | `maxBatchSize <= 500` and `maxRuntimeSeconds <= 540`. |

## Gate Output

The gate returns:

```ts
type ProjectionCertificationGateResult = {
  projectionName: string;
  requestedStatus: ProjectionCertificationStatus;
  allowedStatus: ProjectionCertificationStatus;
  passed: boolean;
  missingRequirements: ProjectionCertificationRequirement[];
};
```

`allowedStatus` is `production_ready` only when `passed` is true. Otherwise it is `not_ready`.

## Certification Status Rules

| Status | Meaning |
|---|---|
| `not_ready` | Missing one or more production requirements. |
| `beta_ready` | Operable in limited beta with manual oversight, but missing at least one production requirement. |
| `production_ready` | Passes the certification gate and has an operator runbook. |
| `deprecated` | Projection is retained only for migration or legacy compatibility and has a sunset owner. |

## Production Release Rule

Production certification fails when any projection with `requiredCertificationStatus = "production_ready"` does not pass `evaluateProjectionCertification`.

The release decision is binary:

```text
All required projections pass -> production projection certification passes.
Any required projection fails -> production projection certification fails.
```

## Operator Workflow

1. Load all projection definitions from the registry implementation.
2. Run the certification gate.
3. Review missing requirements per projection.
4. Fix missing recovery, verification, ledger, index, or runbook capability.
5. Re-run the gate.
6. Do not approve production until all required projections pass.

## Initial Phase 8A Result

Based on the current registry, BookTown has no projection that fully passes the production gate. This is expected at the start of Phase 8A. The gate exists to make future recovery work deterministic and auditable.

