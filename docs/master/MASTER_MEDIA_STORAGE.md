---
id: BT-MASTER-MEDIA-STORAGE-001
title: "BookTown Media and Storage Master Document"
status: active
authority_level: master
owner: media-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Media and Storage Master Document

## Purpose

This document is the Master Layer entry point for BookTown Attachments, Uploads, Covers, Reader Assets, Media Pipelines, and Storage systems. It summarizes authority and routes to lower-level sources without replacing attachment architecture, storage rules, or operational runbooks.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Attachment upload and finalization.
- Media metadata.
- Signed URLs and access boundaries.
- Image derivatives.
- Cover derivatives.
- EPUB and reader asset attachment handling.
- Feedback, social, messaging, and reader media support.

Out of scope:

- New storage policy.
- New media processing behavior.
- New attachment product features.
- New access rules.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/attachments.ts`
- `functions/src/attachments/*`
- `functions/src/triggers/attachmentTriggers.ts`
- `functions/src/admin/cleanupAttachments.ts`
- `functions/src/admin/recoverMediaAssetProjections.ts`
- `functions/src/covers/canonicalFallbackCover.ts`
- `functions/src/library/uploadUserBook.ts`
- `lib/media/*`
- `lib/books/coverUrls.ts`
- `storage.rules`

Backend runtime owns upload tokens, finalization, metadata authority, signed URL generation, cleanup, derivative processing, and storage access checks. Client runtime owns upload selection, preview state, and rendering only.

## Documentation Authority

Primary authority documents:

- [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md)
- [DM_ATTACHMENTS.md](../architecture/messaging/DM_ATTACHMENTS.md)
- [DM_SHELF_ATTACHMENTS.md](../architecture/messaging/DM_SHELF_ATTACHMENTS.md)
- [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

Operational evidence:

- [AttachmentMetadataRecoveryRunbook.md](../operations/projections/AttachmentMetadataRecoveryRunbook.md)
- [AttachmentImageDerivativesRecoveryRunbook.md](../operations/projections/AttachmentImageDerivativesRecoveryRunbook.md)
- [AttachmentCleanupCountersRecoveryRunbook.md](../operations/projections/AttachmentCleanupCountersRecoveryRunbook.md)
- [CoverDerivativesRecoveryRunbook.md](../operations/projections/CoverDerivativesRecoveryRunbook.md)

Audit evidence:

- [T3_social_attachment_post_authority_stabilization_execution.md](../audits/evidence/audit/T3_social_attachment_post_authority_stabilization_execution.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Attachments | Media Platform | Attachment domain and attachment modules | Messaging attachment docs and projection runbooks. |
| Uploads | Media Platform; Catalog Platform | Upload token and upload finalization runtime | Uploaded EPUB lock and attachment runtime. |
| Covers | Catalog Platform; Media Platform | Cover URL and derivative runtime | Cover derivative runbook and catalog authority. |
| Reader assets | Reader Platform; Media Platform | Reader and attachment runtime | Reader Master plus upload/media authority. |
| Feedback media | Feedback Operations; Media Platform | Feedback attachment runtime | Feedback runtime and attachment authority. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Social / Messaging | Downstream | Posts and DMs may use attachments and media references. |
| Reader | Downstream | EPUB/PDF and reader asset availability depends on media. |
| Catalog / Library | Upstream and downstream | Covers, uploaded books, and canonical catalog assets depend on catalog authority. |
| Writing / Publishing | Downstream | Publication assets depend on media and storage handling. |
| Projection / Recovery | Downstream | Metadata, derivatives, cleanup counters, and covers require recovery coverage. |
| Admin / Control Plane | Downstream | Cleanup and recovery require privileged workflows. |

## Authority Routing

| Question | Route |
|---|---|
| DM media attachment behavior | [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md). |
| Generic attachment authority | Attachment runtime and attachment recovery runbooks. |
| Uploaded EPUB authority | [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md). |
| Cover derivatives | [CoverDerivativesRecoveryRunbook.md](../operations/projections/CoverDerivativesRecoveryRunbook.md). |
| Reader asset consumption | [MASTER_READER.md](MASTER_READER.md). |
| Cleanup and recovery | Projection / Recovery authority and attachment runbooks. |

## System Architecture

Media and Storage is a shared infrastructure and product-support system. It manages the lifecycle of uploads, attachments, metadata, derivatives, signed access, cleanup counters, cover fallbacks, and reader/publication assets.

The architecture separates:

- Upload request and token issuance.
- Upload finalization.
- Attachment metadata.
- Signed URL generation.
- Image and cover derivatives.
- Cleanup and lifecycle counters.
- Domain-specific attachment use by Social, Messaging, Reader, Feedback, Catalog, and Publishing.

## Core Components

| Component | Role |
|---|---|
| Upload tokens | Control allowed upload initiation. |
| Attachment finalization | Converts uploaded assets into durable media metadata. |
| Media service | Provides access and rendering support. |
| Signed URLs | Grants bounded asset access. |
| Image derivatives | Produces display-optimized image records. |
| Cover derivatives | Supports book and catalog cover rendering. |
| Cleanup counters | Tracks cleanup and lifecycle operations. |
| Storage rules | Enforce storage-level access boundaries. |

## Data Authority

| Data | Authority |
|---|---|
| Attachment metadata | Attachment backend runtime. |
| Upload token state | Attachment backend runtime. |
| Signed URL decisions | Attachment/storage runtime. |
| Image derivative metadata | Attachment derivative runtime and recovery. |
| Cover derivative metadata | Cover derivative runtime and recovery. |
| Reader asset availability | Reader plus media runtime. |
| Client preview state | Client only; not durable authority. |

## User-Facing Surfaces

- Social post attachments.
- Direct message attachments.
- Feedback attachments.
- Book covers.
- Reader EPUB/PDF access.
- Uploaded book flows.
- Publication assets.
- Media previews and thumbnails.

## Operational Dependencies

- Storage rules.
- Attachment triggers.
- Cleanup workflows.
- Derivative workers.
- Projection registry.
- Admin recovery.
- Catalog and Reader authority.
- Observability for upload, cleanup, and derivative failures.

## Projection Dependencies

Media and Storage depend on:

- `attachment_metadata`
- `attachment_image_derivatives`
- `attachment_cleanup_counters`
- `cover_derivatives`
- `reader_epub_indexes`
- `reader_manifests`
- `catalog_identity_projection`

## Governance Rules

- Client-selected media is never durable authority before backend finalization.
- Signed access must be backend-controlled.
- Media metadata and derivatives are recoverable projections or backend-owned records, not client truth.
- Domain-specific media behavior routes through the owning domain plus Media / Storage authority.
- Duplicate media attachment docs must be rationalized during archive migration.
- Storage and cleanup workflows require privileged operational control.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented.

Documentation maturity: Partial.

Readiness: Closed Beta Ready for constrained media and attachment workflows.

## Known Gaps

- Unified media architecture authority remains missing.
- Attachment authority is split across messaging docs, runtime, storage rules, and runbooks.
- Duplicate media attachment documentation should be rationalized during migration.
- Reader, publishing, social, messaging, and feedback media boundaries need stronger consolidated ownership.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_READER.md](MASTER_READER.md)
- [MASTER_SOCIAL_MESSAGING.md](MASTER_SOCIAL_MESSAGING.md)
- [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md)
- [DM_MEDIA_ATTACHMENTS.md](../architecture/messaging/DM_MEDIA_ATTACHMENTS.md)
- [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future media and storage changes should be documented in unified media authority documents and reflected here as routing updates. This Master document must not introduce new media behavior, storage policy, or access rules directly.
