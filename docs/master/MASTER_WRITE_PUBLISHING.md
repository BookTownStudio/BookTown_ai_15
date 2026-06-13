---
id: BT-MASTER-WRITE-PUBLISHING-001
title: "BookTown Writing and Publishing Master Document"
status: active
authority_level: master
owner: writing-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Writing and Publishing Master Document

## Purpose

This document is the Master Layer entry point for BookTown Writing, Publishing, Projects, Manuscripts, Publications, and creator workflows. It summarizes authority and routes to lower-level sources without creating new publishing architecture or product commitments.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Writing projects.
- Manuscripts and editor runtime.
- Draft recovery and operational writing state.
- Publishing preflight and release generation.
- Publication reader handoff.
- Creator workflows and write tab surfaces.

Out of scope:

- New editor behavior.
- New publishing policy.
- New creator monetization rules.
- New roadmap commitments.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/write.ts`
- `functions/src/projects/create.ts`
- `functions/src/publishing/*`
- `functions/src/publishWriteProject.ts`
- `functions/src/publishWriteCollaborationOperation.ts`
- `lib/editor/*`
- `lib/publishing/*`
- `app/tabs/write.tsx`
- `app/project/*`
- `components/write/*`

Backend runtime owns durable project mutation, publication release generation, write-operation intake, publish preflight, and publication handoff. Client runtime owns editor interaction state, local drafts, collaboration transport state, and preview UI only.

## Documentation Authority

Primary authority currently comes from runtime plus audit evidence:

- [T6_write_publishing_authority_stabilization_execution.md](../audits/evidence/audit/T6_write_publishing_authority_stabilization_execution.md)
- [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md)

Related authority:

- [MASTER_READER.md](MASTER_READER.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Writing projects | Writing Platform | Write domain and project runtime | T6 audit evidence and runtime authority. |
| Manuscripts | Writing Platform | Editor runtime and write domain | Runtime authority until dedicated manuscript architecture exists. |
| Publishing | Publishing Platform | Publishing modules and release generation | T6 audit evidence and publishing runtime. |
| Publications | Publishing Platform; Reader Platform | Publishing output and Reader handoff | Publishing runtime plus Reader authority. |
| Creator workflows | Writing Platform | Write tab and project surfaces | Product/Vision context plus runtime authority. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Reader | Downstream | Published works may be consumed through reader surfaces. |
| Catalog / Library | Downstream | Published output may require catalog linkage and discoverability. |
| Media / Storage | Upstream | Manuscripts, covers, EPUB/PDF assets, and attachments depend on asset handling. |
| Projection / Recovery | Downstream | Publication and reader-facing projections require recovery coverage. |
| Search / Discovery | Downstream | Published content may become discoverable after authority approval. |
| Admin / Control Plane | Downstream | Creator workflow administration and recovery require privileged tools. |

## Authority Routing

| Question | Route |
|---|---|
| Writing project mutation | Write runtime authority and T6 audit evidence. |
| Manuscript operational behavior | Editor runtime and write domain authority. |
| Publishing release generation | Publishing runtime and T6 audit evidence. |
| Publication reading | [MASTER_READER.md](MASTER_READER.md). |
| Uploaded EPUB authority | [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md). |
| Media assets | [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md). |

## System Architecture

Writing and Publishing form a creator workflow system that moves from private drafting to publication-ready output and reader-facing consumption.

The architecture separates:

- Project creation and ownership.
- Manuscript editing and local drafting.
- Operational write events and collaboration state.
- Release preflight.
- Publication artifact generation.
- Publication reader handoff.
- Creator-facing project surfaces.

## Core Components

| Component | Role |
|---|---|
| Write tab | Entry point for creator workflows. |
| Project runtime | Owns project creation and durable project state. |
| Manuscript editor | Supports writing, editing, recovery, and collaboration semantics. |
| Local drafts | Protects temporary client-side writing continuity. |
| Publish preflight | Validates readiness before release generation. |
| Release generation | Produces publication-ready reader artifacts. |
| Publication reader | Consumes published output through Reader authority. |

## Data Authority

| Data | Authority |
|---|---|
| Project ownership | Write backend runtime. |
| Durable project metadata | Write backend runtime. |
| Manuscript authority | Write backend/runtime where persisted; client local drafts are temporary. |
| Collaboration operations | Write collaboration runtime. |
| Publication release state | Publishing backend runtime. |
| Reader consumption state | Reader backend runtime. |
| Generated publication assets | Publishing and Media / Storage authority. |

## User-Facing Surfaces

- Write tab.
- Project editor.
- Project preview.
- Project publish surface.
- Published project confirmation.
- Publication reader.
- Creator project summary surfaces.

## Operational Dependencies

- Auth and project ownership.
- Media and storage asset handling.
- Reader availability.
- Catalog/discovery exposure rules.
- Admin/control recovery tooling.
- Projection and recovery framework.
- Observability for write and publish operations.

## Projection Dependencies

Writing and Publishing may depend on:

- `reader_manifests`
- `reader_epub_indexes`
- `cover_derivatives`
- `attachment_metadata`
- `attachment_image_derivatives`
- `catalog_identity_projection`
- `search_feed`
- `runtime_health`

## Governance Rules

- Client editor state is not durable product authority until persisted through governed write paths.
- Publication output must route through publishing authority before reader exposure.
- Publishing evidence in audits is evidence only unless reflected in current authority.
- Reader behavior remains governed by Reader authority.
- Media and generated assets remain governed by Media / Storage authority.
- Future creator workflow changes require dedicated authority updates before this Master document changes behavior.

## Current Maturity

Product maturity: Operational.

Architecture maturity: Implemented, with documentation authority still distributed.

Documentation maturity: Partial.

Readiness: Closed Beta Ready for constrained writing and publishing workflows.

## Known Gaps

- Dedicated writing/publishing architecture authority is still needed.
- Creator workflow boundaries with catalog, discovery, and reader require stronger consolidation.
- Publishing policy and public exposure rules need explicit documentation before broad release.
- Current authority relies heavily on runtime and audit evidence.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_READER.md](MASTER_READER.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_MEDIA_STORAGE.md](MASTER_MEDIA_STORAGE.md)
- [UPLOADED_EPUB_SYSTEM_LOCK.md](../architecture/uploads/UPLOADED_EPUB_SYSTEM_LOCK.md)

## Future Evolution

Future writing and publishing changes should be documented in dedicated authority documents for projects, manuscripts, publishing, and creator workflow boundaries, then reflected here as routing updates. This Master document must not introduce new writing or publishing behavior directly.
