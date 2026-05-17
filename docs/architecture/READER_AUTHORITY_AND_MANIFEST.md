# Reader Authority And Manifest Contract

Status: Phase C canonical EPUB infrastructure baseline.

## Authority Ownership

| Domain | Canonical owner | Client role |
|---|---|---|
| `reading_progress` | Cloud Functions: `recordReadingProgress`, `syncReaderOperations` | Runtime projection and queued replay only |
| `reader_highlights` | Cloud Functions: `syncReaderOperations` | Optimistic UI plus queued replay |
| `reader_bookmarks` | Cloud Functions: `syncReaderOperations` | Optimistic UI plus queued replay |
| `reader_manifests` | Cloud Functions: `readerManifestService` | Read-only bootstrap metadata |
| `reading_sessions` | Cloud Functions: `getOrCreateReadingSession`, offline access, narration update | Session projection only |
| replay queues | Local runtime queue, server idempotency arbitration | Durable transport buffer, never source of truth |
| rendering state | Reader runtime | Ephemeral viewport state only |
| reader preferences | Client preference store | Local UX preference, not continuity authority |

## Manifest Responsibility

Reader manifests describe durable reading infrastructure. They must not own React viewport state, current scroll offsets, transient UI mode, or social attachment state.

Canonical manifest slots:

- `locationMap`: stable progress checkpoint strategy.
- `searchIndex`: future search-in-book index pointer.
- `highlightAnchors`: future durable highlight-anchor index pointer.
- `chapterMap`: future table-of-contents/chapter map pointer.
- `sectionMap`: future section/spine map pointer.
- `stableAnchors`: future canonical anchor registry pointer for search jumps, quotes, highlights, and bookmarks.
- `spineMap`: canonical EPUB spine identity and ordering pointer.
- `sectionGraph`: canonical section relationship graph pointer.
- `stableAnchorMap`: stable cross-device anchor identity pointer.
- `navigationIndex`: canonical TOC/navigation lookup pointer.
- `paginationHints`: reusable pagination/location hint pointer.

All new slots are backward-compatible and may remain `pending` until the indexing pipeline is built. Runtime code must treat `pending` as unavailable, not as failure.

## Canonical EPUB Location Contract

The EPUB runtime may consume `locationMap` payloads only when all of these are true:

- `format` is `epub`.
- `locationMap.status` is `ready`.
- `locationMap.source` is `server_precomputed`.
- `locationMap.identity` includes book id, manifest version, pipeline version, source signature hash, and generation granularity.
- `locationMap.payload` is a valid epub.js location payload for the declared generation granularity.

If any condition fails, the runtime must fall back to local reusable cache and then runtime generation. Client-generated structure remains a cache/fallback only; it never becomes canonical manifest authority.

## Producer Lifecycle

`readerManifestService` owns canonical EPUB preprocessing during manifest construction. For EPUB sources it downloads the canonical storage object, parses the package document, spine, navigation file, and XHTML sections, then writes reusable structural maps to the manifest-declared index documents.

Produced slots become `ready` only after the backend producer completes successfully:

- `locationMap`: inline bounded epub.js-compatible location payload plus stable identity.
- `spineMap`: ordered linear EPUB spine items.
- `sectionGraph`: section hierarchy baseline derived from spine content.
- `stableAnchorMap`: deterministic anchor ids and text hashes for generated location checkpoints.
- `navigationIndex`: parsed EPUB nav entries when present.
- `paginationHints`: generation granularity and location count.

If preprocessing fails or the location payload exceeds the inline safety budget, the manifest remains compatible but pending. Runtime fallback remains the continuity safety path.

## Non-Negotiable Boundaries

- Client code must not write reader authority collections directly.
- Offline replay must converge through backend validation and idempotency.
- AI systems may annotate or recommend, but must not become authority for continuity.
- Reader runtime may cache binary files locally, but local cache validity never replaces server read permission.
