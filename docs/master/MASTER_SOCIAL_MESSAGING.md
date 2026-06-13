---
id: BT-MASTER-SOCIAL-MESSAGING-001
title: "BookTown Social and Messaging Master Document"
status: active
authority_level: master
owner: social-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Social and Messaging Master Document

## Purpose

This document is the Master Layer entry point for BookTown Social, Community, Messaging, DMs, interactions, moderation, and community systems. It summarizes authority and routes to lower-level sources without replacing architecture documents, runtime authority, or audit evidence.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Social feed and posts.
- Comments, reactions, bookmarks, and interactions.
- Direct messages and message requests.
- Social attachments and entity references.
- Social reporting and moderation handoff.
- Follow graph and notification dependencies.
- Community-facing social surfaces.

Out of scope:

- New social behavior.
- New moderation policy.
- New messaging roadmap commitments.
- New community product specifications.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/social.ts`
- `functions/src/social/*`
- `functions/src/domains/messaging.ts`
- `functions/src/messaging/directMessages.ts`
- `functions/src/domains/feedback.ts`
- `functions/src/feedback/*`
- `app/tabs/social.tsx`
- `app/social/*`
- `app/messenger/*`
- `components/content/*`

Backend runtime owns writes, access checks, participant validation, reporting, moderation state, notification fanout, and projection-producing social events. Client runtime owns composition UI, read state, optimistic rendering, and local interaction affordances only.

## Documentation Authority

Primary authority documents:

- [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md)
- [DM_ARCHITECTURE.md](../architecture/messaging/DM_ARCHITECTURE.md)
- [DM_PRIVACY.md](../architecture/messaging/DM_PRIVACY.md)
- [DM_REQUESTS.md](../architecture/messaging/DM_REQUESTS.md)
- [DM_ATTACHMENTS.md](../architecture/messaging/DM_ATTACHMENTS.md)
- [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md)
- [DM_SHELF_ATTACHMENTS.md](../architecture/messaging/DM_SHELF_ATTACHMENTS.md)

Audit evidence:

- [T3_social_attachment_post_authority_stabilization_execution.md](../audits/evidence/audit/T3_social_attachment_post_authority_stabilization_execution.md)

Operational evidence:

- [PostEngagementRecoveryRunbook.md](../operations/projections/PostEngagementRecoveryRunbook.md)
- [PostAnalyticsRecoveryRunbook.md](../operations/projections/PostAnalyticsRecoveryRunbook.md)
- [SocialPostRenderProjectionRecoveryRunbook.md](../operations/projections/SocialPostRenderProjectionRecoveryRunbook.md)
- [FollowGraphRecoveryRunbook.md](../operations/projections/FollowGraphRecoveryRunbook.md)
- [NotificationSummaryRecoveryRunbook.md](../operations/projections/NotificationSummaryRecoveryRunbook.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Social posts | Social Platform | Social domain and social modules | Social runtime and T3 audit evidence until dedicated architecture exists. |
| Comments and reactions | Social Platform | Social interaction modules | Social runtime and projection runbooks. |
| Direct messages | Messaging Platform | Messaging domain and direct message runtime | Messaging architecture and V1 lock docs. |
| Social reporting | Feedback Operations | Feedback and social reporting runtime | Feedback/Reporting Master and admin/moderation evidence. |
| Moderation handoff | Social Platform; Control Plane | Social moderation and admin/control runtime | Runtime authority until dedicated moderation authority exists. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Users and profiles | Upstream | Identity, display, permissions, and social graph context. |
| Media / attachments | Upstream and downstream | Posts and messages may carry media or entity attachments. |
| Notifications | Downstream | Social and messaging events produce notification summaries. |
| Projection / Recovery | Downstream | Feed, engagement, analytics, notification, and follow projections must be recoverable. |
| Admin / Control Plane | Downstream | Reporting, moderation, deletion, and privileged review depend on control surfaces. |
| Observability | Downstream | Social safety and health require operational visibility. |

## Authority Routing

| Question | Route |
|---|---|
| Messaging behavior | [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md), then messaging docs. |
| DM privacy | [DM_PRIVACY.md](../architecture/messaging/DM_PRIVACY.md). |
| DM attachments | [DM_ATTACHMENTS.md](../architecture/messaging/DM_ATTACHMENTS.md), [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md), [DM_SHELF_ATTACHMENTS.md](../architecture/messaging/DM_SHELF_ATTACHMENTS.md). |
| Social post authority | Social runtime and T3 audit evidence until a dedicated social architecture doc exists. |
| Social recovery | Relevant social, follow, post, and notification runbooks. |
| Moderation or reporting | [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md), feedback/social runtime, and Admin / Control Plane authority. |

## System Architecture

Social and Messaging are user-facing communication systems backed by server-owned write authority and projection-supported read experiences.

The architecture separates:

- Social publishing and post access.
- Comments, reactions, bookmarks, and feed interactions.
- Direct message conversation state.
- Message requests and participant validation.
- Attachment and entity-reference handling.
- Reporting and moderation handoff.
- Notification and engagement projections.

## Core Components

| Component | Role |
|---|---|
| Social feed | Presents community posts and social activity. |
| Post composer | Collects user-authored social content and attachments. |
| Comments | Supports threaded or contextual response behavior. |
| Reactions and bookmarks | Records lightweight user interactions. |
| Direct messages | Owns private conversation state and message delivery. |
| Message requests | Controls inbound messaging boundaries. |
| Reporting | Captures user reports and feedback handoff. |
| Moderation | Applies social safety and administrative review paths. |

## Data Authority

| Data | Authority |
|---|---|
| Posts | Social backend runtime. |
| Comments | Social backend runtime. |
| Reactions/bookmarks | Social interaction runtime. |
| Conversations/messages | Messaging backend runtime. |
| Message request state | Messaging backend runtime. |
| Reports | Feedback/social reporting runtime. |
| Feed render projections | Projection system, derived from social authority. |
| Engagement counters | Projection system, derived from social authority. |

## User-Facing Surfaces

- Social tab.
- Post detail and discussion surfaces.
- Post composer.
- Comments and reactions.
- Message inbox.
- Conversation thread.
- Message request surfaces.
- Feedback/reporting drawers.
- Profile/social activity surfaces.

## Operational Dependencies

- Auth and user identity.
- Media and attachment handling.
- Notifications.
- Follow graph.
- Admin/control review.
- Projection registry and recovery runbooks.
- Feedback/reporting workflows.

## Projection Dependencies

Social and Messaging depend on:

- `social_post_render_projection`
- `post_engagement`
- `post_analytics`
- `follow_graph`
- `notification_summary`
- `activity_log_notifications`
- `projected_viewer_state`
- `attachment_metadata`

## Governance Rules

- Client social state is not durable authority.
- Social and messaging writes must pass backend validation and access control.
- Audit files are evidence, not current operating authority.
- Messaging roadmap documents are future context unless locked.
- Reports and moderation handoff must route through privileged backend/control paths.
- Social projections must be recoverable through Projection / Recovery governance.

## Current Maturity

Product maturity: Functional.

Architecture maturity: Governed for messaging; partial for broader social.

Documentation maturity: Partial.

Readiness: Social is Internal Ready; Messaging is Closed Beta Ready for constrained flows.

## Known Gaps

- Dedicated social architecture authority remains incomplete.
- Moderation policy requires stronger explicit documentation before broad exposure.
- Community systems need clearer boundary definition beyond posts, DMs, and reporting.
- Social and messaging authority is split across runtime, messaging docs, runbooks, and audit evidence.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)
- [MASTER_FEEDBACK_REPORTING.md](MASTER_FEEDBACK_REPORTING.md)
- [MESSENGER_V1_LOCK.md](../architecture/messaging/MESSENGER_V1_LOCK.md)
- [DM_ARCHITECTURE.md](../architecture/messaging/DM_ARCHITECTURE.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future social and messaging changes should be documented in dedicated social, messaging, moderation, or reporting authority documents, then reflected here as routing updates. This Master document must not introduce new social, messaging, or moderation behavior directly.
