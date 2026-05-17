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
- `literaryCoordinateMap`: durable section/passage/range coordinate pointer for future semantic systems.
- `passageIndex`: canonical passage-reference pointer for future search, quote, and annotation intelligence.
- `annotationIdentityIndex`: render-independent annotation target pointer.
- `literaryMemoryPrimitives`: canonical reading-memory unit pointer, explicitly separate from social/activity feeds.

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
- `literaryCoordinateMap`: server-generated passage and range coordinates derived from canonical spine and section structure.
- `passageIndex`: bounded passage references with stable ids, text hashes, and future search/quote readiness flags.
- `annotationIdentityIndex`: render-independent annotation targets mapped to canonical passages and CFIs.
- `literaryMemoryPrimitives`: revisitability units for future literary memory systems with no feed coupling.

If preprocessing fails or the location payload exceeds the inline safety budget, the manifest remains compatible but pending. Runtime fallback remains the continuity safety path.

## EPUB Ecosystem Hardening Principles

Canonical promotion is fail-closed. Malformed spine references, missing package documents, dangerously malformed XHTML, unstable generated CFIs, and oversized location payloads must not be marked `ready`.

Recoverable EPUB inconsistencies may still produce partial canonical infrastructure when the readable spine remains healthy:

- Missing or invalid navigation trees degrade `navigationIndex`; they do not block location maps.
- Missing optional metadata must not be trusted as identity and must not block readable spine processing.
- Broken minority spine items are recorded as producer warnings; excessive missing or malformed spine content blocks canonical promotion.

Every canonical EPUB payload carries a declared CFI fidelity class. The current producer emits `syntactic_epub_cfi_v1`, which is deterministic and cross-session stable, but still requires continued real-world CFI validation before it should be treated as universal EPUB coverage.

## Semantic Literary Infrastructure Boundaries

Semantic infrastructure consumes canonical reading structure; it does not create independent reading truth. Canonical literary coordinates, passage references, annotation identity targets, and literary memory primitives are generated by the backend producer from the same manifest-owned EPUB structure used by the reader.

The reader runtime may read these pointers when future product surfaces need them, but it must not perform heavyweight semantic extraction, indexing, or AI interpretation on-device. Continuity remains owned by `reading_progress`, `reader_highlights`, `reader_bookmarks`, and their backend replay/sync contracts.

Semantic systems must degrade as optional infrastructure:

- Missing semantic indexes must not block opening or reading a book.
- Failed semantic processing must not mutate progress, highlights, bookmarks, or manifest authority.
- Literary memory is a canonical user-layer primitive, not an activity feed or social ranking system.
- Passage and annotation identity may help future search, quotes, and references, but must not override canonical anchors or server continuity arbitration.

## Non-Negotiable Boundaries

- Client code must not write reader authority collections directly.
- Offline replay must converge through backend validation and idempotency.
- AI systems may annotate or recommend, but must not become authority for continuity.
- Reader runtime may cache binary files locally, but local cache validity never replaces server read permission.
