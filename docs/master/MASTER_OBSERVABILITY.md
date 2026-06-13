---
id: BT-MASTER-OBSERVABILITY-001
title: "BookTown Observability Master Document"
status: active
authority_level: master
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Observability Master Document

## Purpose

This document is the Master Layer entry point for BookTown Metrics, Analytics, Monitoring, Health, Telemetry, Auditing, and Operational Visibility. It summarizes authority and routes to lower-level sources without replacing operations runbooks, runtime health systems, or monitoring policy.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Metrics and analytics events.
- Daily analytics exports.
- Runtime health.
- System events.
- System metrics.
- Runtime anomaly detection.
- Operational dashboards.
- Audit logging as operational evidence.

Out of scope:

- New telemetry events.
- New monitoring policy.
- New analytics product behavior.
- New operational SLOs.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/analytics/*`
- `functions/src/contracts/observability.ts`
- `functions/src/control/analyticsMetrics.ts`
- `functions/src/control/operationalDashboard.ts`
- `functions/src/control/systemEventsAdmin.ts`
- `functions/src/control/auditLogger.ts`
- `functions/src/operations/projectionHealthManager.ts`
- `functions/src/operations/projectionVerificationReports.ts`
- `app/admin/*`
- `components/admin/IntelligenceAggregateDashboard.tsx`

Backend runtime owns event logging, metric idempotency, daily exports, operational dashboard data, health summaries, anomaly records, and privileged audit logging. Client dashboards render operational visibility and do not own monitoring truth.

## Documentation Authority

Primary authority documents:

- [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md)
- [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)
- [ProjectionRecoveryFramework.md](../architecture/ProjectionRecoveryFramework.md)
- [ProjectionCertificationGate.md](../operations/ProjectionCertificationGate.md)

Operational evidence:

- [SystemMetricsRecoveryRunbook.md](../operations/projections/SystemMetricsRecoveryRunbook.md)
- [SystemEventsRecoveryRunbook.md](../operations/projections/SystemEventsRecoveryRunbook.md)
- [RuntimeHealthProjectionRecoveryRunbook.md](../operations/projections/RuntimeHealthProjectionRecoveryRunbook.md)
- [RuntimeAnomalyProjectionRecoveryRunbook.md](../operations/projections/RuntimeAnomalyProjectionRecoveryRunbook.md)
- [AnalyticsDailyExportsRecoveryRunbook.md](../operations/projections/AnalyticsDailyExportsRecoveryRunbook.md)
- [IntelligenceAggregatesRecoveryRunbook.md](../operations/projections/IntelligenceAggregatesRecoveryRunbook.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Metrics | Operations Platform | Analytics and control runtime | Firestore monitoring and metrics runbooks. |
| Analytics | Operations Platform | Analytics runtime and daily export modules | Analytics export runbook and monitoring docs. |
| Runtime health | Operations Platform | Projection health manager and health projections | Runtime health runbook and Projection Registry. |
| System events | Control Plane; Operations Platform | Control/system event runtime | System events runbook and control runtime. |
| Audit logging | Control Plane | Control audit logger | Admin/Control authority and operational evidence. |
| Dashboards | Control Plane | Operational dashboard runtime | Admin Operations and Observability routing. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Projection / Recovery | Upstream and downstream | Health and recovery outcomes produce observability signals. |
| Admin / Control Plane | Downstream | Dashboards and privileged views expose operational visibility. |
| All product domains | Upstream | Product and platform systems emit events, metrics, and health signals. |
| Firestore safety | Upstream | Monitoring must preserve bounded query and scan safety. |
| Analytics exports | Downstream | Aggregated operational and product analytics depend on event authority. |
| AI / Intelligence | Downstream | Intelligence aggregate dashboards depend on observable intelligence signals. |

## Authority Routing

| Question | Route |
|---|---|
| Firestore monitoring | [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md). |
| Runtime health | Runtime health runbook and Projection Registry. |
| System metrics | System metrics runbook and analytics runtime. |
| System events | System events runbook and control runtime. |
| Analytics exports | Analytics daily export runbook and analytics runtime. |
| Operational dashboards | Admin / Control Plane authority plus observability runtime. |

## System Architecture

Observability is BookTown's operational visibility layer. It converts runtime activity, projection status, recovery outcomes, system events, metrics, analytics exports, anomalies, and audit logs into bounded operational evidence.

The architecture separates:

- Event logging.
- Metric generation and idempotency.
- Analytics exports.
- Runtime health.
- Runtime anomaly tracking.
- System event administration.
- Operational dashboards.
- Audit logging for privileged actions.

## Core Components

| Component | Role |
|---|---|
| Event logger | Records operational and product events. |
| Metrics utilities | Normalize and aggregate system metrics. |
| Metric idempotency | Prevents duplicate metric writes where required. |
| Daily exports | Produces bounded analytics export records. |
| Runtime health | Summarizes operational health signals. |
| Runtime anomaly tracking | Records abnormal runtime conditions. |
| Operational dashboard | Presents privileged operational visibility. |
| Audit logger | Records privileged control-plane actions. |

## Data Authority

| Data | Authority |
|---|---|
| Events | Analytics/system event backend runtime. |
| Metrics | Analytics and system metrics runtime. |
| Daily exports | Analytics export runtime. |
| Runtime health | Projection health manager and runtime health projections. |
| Runtime anomalies | Runtime anomaly projection and operations runtime. |
| Dashboard summaries | Control and observability runtime. |
| Audit logs | Control audit logger/runtime. |

## User-Facing Surfaces

Observability is primarily privileged and operational. Surfaces include:

- Admin operational dashboard.
- Metrics dashboards.
- Intelligence aggregate dashboard.
- Recovery reports and health summaries.
- Admin system event views.
- Audit log review surfaces.

## Operational Dependencies

- Projection registry and recovery framework.
- Admin/control access.
- Firestore monitoring and safety.
- Analytics event logging.
- System metrics.
- Runtime health projections.
- Failure ledger and verification reports.

## Projection Dependencies

Observability depends on:

- `system_metrics`
- `system_events`
- `runtime_health`
- `runtime_anomaly_projection`
- `analytics_daily_exports`
- `intelligence_aggregates`
- `intelligence_signal_queue`
- Recovery verification reports from projection families.

## Governance Rules

- Observability records are operational evidence, not product truth.
- Dashboards must not become implicit authority for canonical data.
- Metrics and analytics must be bounded, recoverable where projected, and governed by operational safety.
- Audit logs are evidence unless promoted into authority through governance.
- Health and anomaly projections must route through Projection / Recovery authority.
- Privileged observability surfaces must route through Admin / Control Plane authority.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented.

Documentation maturity: Partial.

Readiness: Internal Ready.

## Known Gaps

- Dedicated observability architecture authority is still needed.
- Monitoring documentation is strong for Firestore but broader observability remains distributed.
- Product analytics, operational health, and privileged dashboards need clearer separation.
- Public beta readiness requires stronger visibility around user-facing failure modes.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md)
- [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future observability changes should be documented in dedicated monitoring, analytics, health, or audit logging authority documents, then reflected here as routing updates. This Master document must not introduce new telemetry, monitoring policy, or dashboard behavior directly.
