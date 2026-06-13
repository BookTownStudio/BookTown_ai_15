---
id: BT-MASTER-READER-001
title: "BookTown Reader Master Document"
status: active
authority_level: master
owner: reader-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Reader Master Document

## Purpose

This document is the Master Layer entry point for the BookTown Reader system. It consolidates existing reader authority, runtime evidence, operations coverage, and known gaps without creating new architecture.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Reader runtime.
- EPUB support.
- PDF support.
- Reading progress.
- Reading sessions.
- Reader manifests.
- Offline capabilities.
- Reader diagnostics.
- Rights and acquisition boundaries.

Out of scope:

- New reader architecture.
- New rights policy.
- New offline sync behavior.
- New product commitments.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/reader.ts`
- `functions/src/reader/*`
- `components/reader/*`
- `lib/reader/*`
- `app/reader.tsx`
- `app/publication-reader.tsx`
- `app/lib/offline/*`

The backend owns durable reader state such as reading progress, reading sessions, manifests, highlights/bookmarks sync, access decisions, offline access, and diagnostics. Client runtime owns viewport state, rendering state, local preferences, and optimistic/offline transport state only.

## Documentation Authority

Primary authority documents:

- [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md)
- [READER_MOBILE_SLOS.md](../architecture/READER_MOBILE_SLOS.md)
- [READER_STRESS_CORPUS.md](../architecture/READER_STRESS_CORPUS.md)
- [READER_EXPERIENCE_PRINCIPLES.md](../architecture/READER_EXPERIENCE_PRINCIPLES.md)

Operational evidence:

- [ReaderManifestsRecoveryRunbook.md](../operations/projections/ReaderManifestsRecoveryRunbook.md)
- [ReaderEpubIndexesRecoveryRunbook.md](../operations/projections/ReaderEpubIndexesRecoveryRunbook.md)
- [ReaderHighlightsBookmarksRecoveryRunbook.md](../operations/projections/ReaderHighlightsBookmarksRecoveryRunbook.md)
- [ReaderSyncIdempotencyRecoveryRunbook.md](../operations/projections/ReaderSyncIdempotencyRecoveryRunbook.md)
- [ReaderAuthorityProjectionRecoveryRunbook.md](../operations/projections/ReaderAuthorityProjectionRecoveryRunbook.md)
- [ReaderAuditDiagnosticsRecoveryRunbook.md](../operations/projections/ReaderAuditDiagnosticsRecoveryRunbook.md)

Audit evidence:

- [T4_reader_offline_authority_stabilization_execution.md](../audits/evidence/audit/T4_reader_offline_authority_stabilization_execution.md)

## System Architecture

Reader is a backend-authoritative reading system with a client rendering runtime.

The reader architecture separates:

- Durable reading authority: backend callables and Firestore-backed state.
- Manifest authority: backend-generated reader manifests and EPUB structural indexes.
- Runtime rendering: React reader surfaces, EPUB/PDF viewers, chrome, settings, and narration controls.
- Offline transport: local queue and replay state that never becomes source of truth.
- Diagnostics: backend-recorded reader diagnostic records and operational projection coverage.

## Core Components

| Component | Role |
|---|---|
| Reader access | Determines whether a user may read a book or publication. |
| EPUB viewer | Renders EPUB content and consumes canonical or cached location structures. |
| PDF viewer | Renders PDF content through the reader surface. |
| Reading progress | Stores durable continuity state. |
| Reading sessions | Tracks active reading context and session continuity. |
| Reader manifests | Bootstrap durable reader infrastructure and manifest slots. |
| Reader sync | Synchronizes highlights, bookmarks, progress, and offline operations. |
| Offline manager | Maintains local transport state and cached reading availability. |
| Reader diagnostics | Records runtime health and diagnostic signals. |

## Data Authority

| Data | Authority |
|---|---|
| `reading_progress` | Backend reader callables. |
| `reading_sessions` | Backend reader session callables. |
| `reader_manifests` | Backend reader manifest service. |
| `reader_highlights` | Backend sync reader operations. |
| `reader_bookmarks` | Backend sync reader operations. |
| Offline queue | Client transport buffer only. |
| Reader preferences | Client UX preference only. |
| Viewport/render state | Client runtime only. |

## User-Facing Surfaces

- `app/reader.tsx`
- `app/publication-reader.tsx`
- `components/reader/ReaderChrome.tsx`
- `components/reader/ReaderContent.tsx`
- `components/reader/EpubViewer.tsx`
- `components/reader/PdfViewer.tsx`
- `components/reader/ReaderSettings.tsx`
- `components/reader/NarrationMicroPlayer.tsx`

## Operational Dependencies

- Firebase Functions reader domain.
- Firestore reader collections and projections.
- Storage-backed ebook/PDF assets.
- Reader manifest generation.
- Reader stress corpus fixtures.
- Reader performance and device-lab gates.
- Projection recovery and verification.

## Projection Dependencies

Reader depends on these projection families:

- `reader_manifests`
- `reader_epub_indexes`
- `reader_highlights_bookmarks`
- `reader_events`
- `reader_sync_idempotency`
- `reader_audit_diagnostics`
- `reader_authority_projection`
- `reading_progress_compatibility_fields`
- `reader_insights_dto`
- `user_library_books`

## Governance Rules

- Backend durable reader state is authoritative.
- Client-generated EPUB structures are cache/fallback only.
- Offline queue state is transport state, not source of truth.
- Manifests must not own viewport state, UI mode, or social attachment state.
- Reader availability must respect access, rights, storage, and manifest state.
- Recovery must be bounded, checkpointed, and verifiable through Phase 8A controls.

## Current Maturity

Product maturity: First-Class.

Architecture maturity: Validated.

Documentation maturity: Authority Complete.

Readiness: Public Beta Ready for constrained reader workflows.

## Known Gaps

- Reader rights and acquisition boundaries need a dedicated master-level consolidation.
- Public beta readiness depends on broader product exposure decisions, not reader runtime alone.
- Offline conflict behavior must remain governed and tested as multi-device use expands.
- Publication reader and canonical book reader authority should remain explicitly routed through Reader and Publishing documents.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md)
- [READER_AUTHORITY_AND_MANIFEST.md](../architecture/READER_AUTHORITY_AND_MANIFEST.md)
- [READER_MOBILE_SLOS.md](../architecture/READER_MOBILE_SLOS.md)
- [READER_STRESS_CORPUS.md](../architecture/READER_STRESS_CORPUS.md)
- [ProjectionRegistry.md](../architecture/ProjectionRegistry.md)

## Future Evolution

Future reader evolution should be documented by updating Reader authority documents and then routing changes through this Master document. This file should not be used to introduce new reader behavior directly.
