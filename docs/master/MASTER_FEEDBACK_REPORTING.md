---
id: BT-MASTER-FEEDBACK-REPORTING-001
title: "BookTown Feedback and Reporting Master Document"
status: active
authority_level: master
owner: feedback-operations
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Feedback and Reporting Master Document

## Purpose

This document is the Master Layer entry point for user feedback, social reporting, abuse reports, moderation handoff, feedback exports, and feedback administration. It consolidates existing routing without creating new moderation policy, runtime behavior, or public exposure.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- User feedback submissions.
- Social and messaging reports.
- Feedback attachments.
- Feedback triage and export surfaces.
- Moderation handoff.
- Admin review surfaces for feedback/reporting.

Out of scope:

- New moderation policy.
- New enforcement actions.
- New feedback schemas.
- New public reporting guarantees.
- New admin workflow behavior.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/feedback.ts`
- Social reporting and moderation runtime.
- Feedback and report tests.
- Admin/control surfaces that review or export feedback.
- Attachment/media runtime when feedback includes uploaded evidence.

The backend owns validation, persistence, triage data, attachment handling, export generation, and moderation handoff. Client surfaces submit feedback or reports and render returned status only.

## Documentation Authority

Primary authority documents:

- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)

This document is the dedicated Master route for Feedback / Reporting. It does not replace Admin or Social/Messaging authority for privileged review, moderation, or report-source behavior.

## System Architecture

Feedback and Reporting is an operational support system that accepts user-provided signals, normalizes them into backend-owned records, and routes them to admin or moderation surfaces. It is not a content authority system and must not redefine social, messaging, attachment, user, or admin policy.

The architecture separates:

- User submission.
- Backend validation and persistence.
- Attachment evidence handling.
- Social or messaging report source authority.
- Admin triage and export.
- Moderation handoff.
- Observability and audit evidence.

## Core Components

| Component | Role |
|---|---|
| Feedback callable domain | Validates and persists feedback submissions. |
| Report source surfaces | Social and messaging entry points for reports. |
| Attachment handling | Stores and references feedback evidence through media authority. |
| Admin review | Allows privileged users to inspect and triage records. |
| Export support | Produces operational review data where implemented. |
| Moderation handoff | Routes actionable safety concerns to social/admin authority. |
| Observability | Tracks operational health and error diagnostics. |

## Data Authority

| Data | Authority |
|---|---|
| Feedback submission content | Feedback backend runtime. |
| Reported social content | Social/Messaging authority. |
| Feedback attachments | Media/Attachments authority. |
| Triage status | Admin/Control Plane and feedback runtime. |
| Moderation action | Social/Admin authority, not feedback alone. |
| Client local state | Client only; not durable authority. |

## User-Facing Surfaces

- Feedback submission surfaces.
- Social report actions.
- Messaging report actions.
- Admin feedback and report review surfaces.
- Feedback export surfaces where implemented.

## Operational Dependencies

- Admin / Control Plane.
- Social / Messaging.
- Media / Attachments.
- User/Auth authority.
- Observability.
- Projection / Recovery where report or feedback summaries are projected.

## Projection Dependencies

Feedback and Reporting may depend on:

- `runtime_health`
- `runtime_anomaly_projection`
- `system_events`
- `attachment_metadata`
- Social/reporting projections where implemented.

## Governance Rules

- Feedback records are operational evidence, not canonical product truth.
- Reports must route to the owning content domain before moderation decisions are inferred.
- Feedback attachments must follow Media/Storage authority.
- Client-submitted data is untrusted until backend validation persists it.
- Admin review requires privileged backend authority.
- Broad moderation policy must be documented separately before broad exposure.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented, with moderation policy still distributed.

Documentation maturity: Good after this Master route.

Readiness: Closed Beta Ready for constrained feedback/reporting workflows.

## Known Gaps

- Dedicated moderation policy authority remains needed before broad social exposure.
- Report lifecycle states should be consolidated outside runtime evidence.
- Cross-domain deletion/privacy handling needs explicit policy routing.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)

## Future Evolution

Future feedback/reporting changes must update the owning runtime/domain authority and this Master route. This document must not introduce moderation policy or runtime behavior directly.

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Feedback submissions | Feedback Operations | Feedback backend runtime | This Master document and Admin Operations. |
| Social reports | Social Platform | Social reporting runtime | Social/Messaging Master and this document. |
| Messaging reports | Messaging Platform | Messaging/reporting runtime | Social/Messaging Master and this document. |
| Feedback administration | Control Plane | Admin/control runtime | Admin Operations Master and this document. |
| Feedback attachments | Media Platform | Attachment/media runtime | Media Storage Master. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Admin / Control Plane | Downstream | Feedback and reports require privileged review. |
| Social / Messaging | Upstream and downstream | Reports originate from social/messaging content and return to moderation authority. |
| Media / Attachments | Upstream | Evidence attachments depend on media authority. |
| Observability | Downstream | Operational health and error rates must be visible. |
| Auth / Users | Upstream | Reporter identity and privileges must be validated by backend authority. |

## Authority Routing

| Question | Route |
|---|---|
| User feedback submission behavior | This document, then feedback runtime. |
| Social or messaging report source behavior | [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md). |
| Admin triage or export behavior | [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md). |
| Feedback attachments | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md). |
| Metrics, health, or anomaly handling | [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md). |
