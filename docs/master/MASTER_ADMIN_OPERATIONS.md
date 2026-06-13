---
id: BT-MASTER-ADMIN-OPERATIONS-001
title: "BookTown Admin and Operations Master Document"
status: active
authority_level: master
owner: control-plane
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Admin and Operations Master Document

## Purpose

This document is the Master Layer entry point for BookTown Admin, Control Plane, Moderation, Recovery, Operational tooling, and governance surfaces. It summarizes authority and routes to lower-level operational sources without replacing runbooks, safety policy, or runtime controls.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Admin surfaces.
- Control plane callables.
- Privileged role assertions.
- Deletion and recovery administration.
- Moderation and reporting review surfaces.
- Operational dashboards.
- Governance-facing tooling.

Out of scope:

- New privileged operations.
- New access policy.
- New operational procedure.
- New moderation policy.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/admin.ts`
- `functions/src/control/*`
- `functions/src/admin/*`
- `functions/src/domains/feedback.ts`
- `functions/src/feedback/*`
- `app/admin/*`
- `app/drawer/admin.tsx`
- `components/admin/*`
- `lib/services/adminService.ts`
- `lib/feedback/adminFeedbackRealtime.ts`

Backend runtime owns privileged operation validation, role assertions, deletion flows, recovery invocation, audit logging, operational dashboard data, and admin-only data access. Client admin surfaces are invocation and review surfaces only.

## Documentation Authority

Primary authority documents:

- [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md)
- [FIRESTORE_AUDIT_REPORT.md](../engineering/FIRESTORE_AUDIT_REPORT.md)
- [FIRESTORE_MONITORING.md](../engineering/FIRESTORE_MONITORING.md)
- [FIRESTORE_SCRIPT_QUARANTINE.md](../engineering/FIRESTORE_SCRIPT_QUARANTINE.md)
- [ProjectionCertificationGate.md](../operations/ProjectionCertificationGate.md)
- [ProjectionRecoveryRunbookTemplate.md](../operations/ProjectionRecoveryRunbookTemplate.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

Related Master documents:

- [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)
- [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Admin surfaces | Control Plane | Admin app and admin service runtime | Firestore safety and control runtime. |
| Control plane | Control Plane | Control modules and privileged callables | Firestore safety and operational docs. |
| Recovery administration | Operations Platform | Admin recovery modules and recovery control plane | Projection/Recovery Master and runbooks. |
| Moderation review | Control Plane; Social Platform; Feedback Operations | Social, feedback, and admin runtime | Feedback/Reporting, Social/Messaging, and Admin Operations routing until moderation policy is consolidated. |
| Governance surfaces | Documentation Governance; Control Plane | Admin/governance UI where present | Governance docs and Master routing. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Auth and roles | Upstream | Privileged operations require role assertion. |
| Firestore safety | Upstream | Admin workflows must preserve bounded, safe data access. |
| Projection / Recovery | Upstream and downstream | Admin surfaces invoke recovery and display recovery status. |
| Observability | Downstream | Admin dashboards consume health, events, metrics, and reports. |
| Social / Messaging | Downstream | Moderation and reporting reviews depend on social/reporting data. |
| Feedback / Reporting | Downstream | Feedback administration depends on feedback runtime and admin surfaces. |

## Authority Routing

| Question | Route |
|---|---|
| Firestore safety | [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md). |
| Privileged operation authority | Admin/control runtime and Firestore safety docs. |
| Projection recovery invocation | [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md). |
| Operational visibility | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md). |
| Moderation/reporting | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md), [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md), and admin runtime until dedicated moderation policy authority exists. |
| Deletion/cascade cleanup | Admin/control runtime and relevant projection runbooks. |

## System Architecture

Admin and Operations form BookTown's privileged operational control plane. The system provides constrained access to high-risk workflows, operational dashboards, recovery controls, reporting review, deletion support, and governance-facing administration.

The architecture separates:

- Admin UI surfaces.
- Role assertion and privileged access control.
- Operational dashboards.
- Recovery invocation.
- Deletion and cleanup workflows.
- Reporting and moderation review.
- Audit logging and operational evidence.

## Core Components

| Component | Role |
|---|---|
| Admin shell | Provides privileged navigation and operational surfaces. |
| Control auth | Validates privileged access and role claims. |
| Operational dashboard | Displays system status and operational summaries. |
| Recovery controls | Invokes approved recovery workflows. |
| Deletion controls | Supports controlled deletion and cleanup paths. |
| Feedback administration | Reviews feedback and reporting data. |
| Audit logger | Records privileged operational actions. |

## Data Authority

| Data | Authority |
|---|---|
| Admin role assertions | Auth/control runtime. |
| Privileged operation requests | Control plane runtime. |
| Recovery reports | Projection / Recovery runtime. |
| Operational dashboard summaries | Observability and projection runtime. |
| Feedback administration state | Feedback backend runtime. |
| Deletion status | Admin/control runtime and deletion runbooks. |
| Audit logs | Control audit logger/runtime. |

## User-Facing Surfaces

- Admin dashboard.
- Partner dashboard.
- Admin drawer.
- Catalog authority tab.
- Home governance tab.
- Spaces authority tab.
- Intelligence aggregate dashboard.
- Feedback administration surfaces.
- Operational dashboards.

## Operational Dependencies

- Auth and role management.
- Firestore safety rules and bounded access patterns.
- Projection and recovery framework.
- Observability and metrics.
- Feedback/reporting runtime.
- Deletion and cleanup runbooks.
- Audit logging.

## Projection Dependencies

Admin and Operations depend on:

- `runtime_health`
- `runtime_anomaly_projection`
- `system_events`
- `system_metrics`
- `analytics_daily_exports`
- `deletion_cascade_cleanup`
- `notification_summary`
- `feedback/reporting` operational records where present.

## Governance Rules

- Admin clients never own privileged authority.
- Privileged operations must be backend-owned and role-validated.
- Firestore scan safety controls apply to admin and recovery work.
- Recovery procedures must route through Projection / Recovery authority.
- Moderation and reporting decisions must not be inferred from UI state alone.
- Audit logs and operational reports are evidence unless promoted into authority.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented.

Documentation maturity: Partial.

Readiness: Internal Ready.

## Known Gaps

- Dedicated admin/control architecture authority is still needed.
- Moderation governance remains distributed across runtime, feedback, social, and admin surfaces.
- Admin operational visibility is strong but should remain separated from Observability authority.
- Public beta readiness depends on stricter privileged workflow documentation and review.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_PROJECTION_RECOVERY.md](MASTER_PROJECTION_RECOVERY.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)
- [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md)
- [FIRESTORE_SAFETY.md](../engineering/FIRESTORE_SAFETY.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future admin and operations changes should be documented in dedicated control-plane, moderation, deletion, or governance-surface authority documents, then reflected here as routing updates. This Master document must not introduce new privileged behavior directly.
