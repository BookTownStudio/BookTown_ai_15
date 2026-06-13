---
id: BT-MASTER-PROJECTION-RECOVERY-001
title: "BookTown Projection and Recovery Master Document"
status: active
authority_level: master
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Projection and Recovery Master Document

## Purpose

This document is the Master Layer entry point for BookTown Projection and Recovery. It consolidates existing projection registry, recovery framework, runbook, and Phase 8A closure authority without creating new architecture or operational procedure.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Projection architecture.
- Projection registry.
- Recovery procedures.
- Operational ownership.
- Dependency graph.
- Projection governance.
- System resilience.
- Runbook routing.

Out of scope:

- New projection classes.
- New recovery commands.
- New certification rules.
- New operational policy.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/operations/projectionRegistry.ts`
- `functions/src/operations/projectionRecoveryControlPlane.ts`
- `functions/src/operations/recoveryRunManager.ts`
- `functions/src/operations/projectionCheckpointManager.ts`
- `functions/src/operations/projectionFailureLedger.ts`
- `functions/src/operations/projectionHealthManager.ts`
- `functions/src/operations/projectionVerificationReports.ts`
- `functions/src/admin/recover*.ts`
- `functions/src/domains/admin.ts`

The runtime registry and recovery control plane own executable projection certification, recovery, verification, checkpointing, health integration, and failure-ledger behavior.

## Documentation Authority

Primary authority documents:

- [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)
- [ProjectionRecoveryFramework.md](../architecture/ProjectionRecoveryFramework.md)
- [ProjectionCertificationGate.md](../operations/ProjectionCertificationGate.md)
- [ProjectionRecoveryRunbookTemplate.md](../operations/ProjectionRecoveryRunbookTemplate.md)

Runbooks:

- `docs/operations/projections/*RecoveryRunbook.md`
- `docs/operations/projections/*DeprecationRunbook.md`

## System Architecture

Projection and Recovery is BookTown's certified operational resilience layer for derived read models, fanout documents, search fields, aggregate counters, media derivatives, operational projections, and compatibility projections.

The architecture separates:

- Authority sources.
- Projection collections and fields.
- Certification metadata.
- Recovery control plane.
- Verification framework.
- Reconciliation where drift is possible.
- Failure ledger.
- Health reporting.
- Runbooks.

## Core Components

| Component | Role |
|---|---|
| Projection registry | Enumerates projection families, authority sources, status, consumers, and runbooks. |
| Recovery control plane | Standardizes recovery requests, dry-run behavior, write repair, and reports. |
| Certification gate | Determines whether projection requirements are satisfied. |
| Checkpoint manager | Supports bounded, restartable recovery. |
| Failure ledger | Records projection failures for audit and replay. |
| Verification reports | Compare projection state with authority. |
| Projection health manager | Updates operational health from verification/recovery outcomes. |
| Runbooks | Operator instructions for each projection family. |

## Data Authority

Projection data is derived data. It is not canonical authority unless explicitly classified as authority in the registry.

| Projection Class | Authority Pattern |
|---|---|
| Fanout projection | One authority document materializes one or more derived documents. |
| Aggregate projection | Many authority documents produce counters, summaries, or rollups. |
| Search projection | Search/discovery optimized denormalized fields or collections. |
| Media derivative projection | Storage/media authority produces derivative metadata or files. |
| Operational projection | Metrics, health, anomaly, audit, or dashboard summaries. |
| Compatibility projection | Legacy or DTO surface derived for older consumers. |

## User-Facing Surfaces

Projection and Recovery is mostly operational, but it supports user-facing surfaces including:

- Search results.
- Social feed.
- Notification feed.
- Reader continue-reading and reader manifests.
- Book cards and review summaries.
- User library and shelves.
- Media rendering.
- Profile stats.
- Admin dashboards.

## Operational Dependencies

- Admin/control plane.
- Firestore indexes and bounded query support.
- System metrics and events.
- Failure ledger.
- Runbook coverage.
- Domain-specific authority documents.
- Recovery callables and scheduled workers.

## Projection Dependencies

Projection families include:

- Quote fanout projections.
- Review fanout projections.
- Notification summary.
- Search feed/bookmarks/notifications.
- User library books.
- Book stats and catalog counters.
- User stats domains.
- Post engagement and post analytics.
- Reader manifests and reader EPUB indexes.
- Reader highlights/bookmarks/events/sync diagnostics.
- Attachment metadata and derivatives.
- Cover derivatives.
- Catalog identity.
- Authored author links.
- Social post render projection.
- System metrics/events and analytics exports.
- Intelligence signal queue and aggregates.
- Deletion/cascade cleanup projections.

See [ProjectionRegistry.md](../architecture/ProjectionRegistry.md) for authoritative projection status and names.

## Governance Rules

- Production projections must be registered.
- Production-ready projections must have authority source, rebuild, verification, failure ledger, health, structured reporting, and runbook coverage.
- Recovery must be bounded, checkpointed, idempotent, and restartable where applicable.
- Dry run is the default.
- Deprecated surfaces must not be promoted through documentation.
- Compatibility sidecars must be explicitly classified.
- Caches and ledgers must not be confused with projection authority.

## Current Maturity

Product maturity: First-Class operational infrastructure.

Architecture maturity: Locked.

Documentation maturity: Authority Complete.

Readiness: Production Ready.

## Known Gaps

- This system is highly mature, but domain teams must keep projection documentation synchronized with runtime registry changes.
- Deprecated and compatibility projection language must remain precise to avoid accidental authority promotion.
- Future projection families must not bypass registry and runbook requirements.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [Phase8AClosureRecord.md](../architecture/Phase8AClosureRecord.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)
- [ProjectionRecoveryFramework.md](../architecture/ProjectionRecoveryFramework.md)
- [ProjectionCertificationGate.md](../operations/ProjectionCertificationGate.md)
- [ProjectionRecoveryRunbookTemplate.md](../operations/ProjectionRecoveryRunbookTemplate.md)

## Future Evolution

Future projection evolution must update the runtime registry, relevant runbook, and governing architecture documents first. This Master document should then be updated as an index and consolidation layer only.
