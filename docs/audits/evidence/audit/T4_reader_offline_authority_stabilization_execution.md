---
id: BT-AUDIT-T4-READER-OFFLINE-AUTHORITY-STABILIZATION-EXECUTION
title: "BookTown T4 Reader And Offline Contract Authority Stabilization Execution"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/T4_reader_offline_authority_stabilization_execution.md
---

# BookTown T4 Reader And Offline Contract Authority Stabilization Execution

## Executive Summary

T4 stabilized Reader and Offline contract authority without changing Reader UX, navigation, route exposure, feature governance, Shelf/Profile, Write, Search/Book, Social/Post, or global entity architecture.

The execution separated offline persistence records from reader runtime DTOs, clarified continuity/progress DTO ownership, and localized EPUB/browser speech runtime adapters so third-party runtime shapes no longer leak into application contracts.

| Metric | Before T4 | After T4 | Result |
|---|---:|---:|---|
| Runtime/root TypeScript errors | 39 | 34 | 5 fewer errors |
| Files with runtime/root TypeScript errors | 24 | 20 | 4 fewer files |
| Reader/Offline compiler errors | Present | 0 | Stabilized |
| EPUB runtime typing errors | Present | 0 | Stabilized |
| Currently-reading continuity typing errors | Present | 0 | Stabilized |
| Offline record duplication | Present | Removed | Stabilized |

## Reader Runtime DTO Changes

Added explicit Reader runtime boundary types in:

- `/Users/solofilms/BookTown_ai_15/types/readerRuntime.ts`

New DTO boundaries:

- `ReaderRuntimeDTO`
- `ReaderContinuityDTO`
- `OfflineReaderRecordDTO`
- `ReaderInsightsDTO`

These types clarify the distinction between:

- reader runtime session state
- backend reader session snapshots
- offline persistence records
- currently-reading continuity projections

No monolithic Reader model was introduced.

## Offline Persistence Authority Changes

Changed file:

- `/Users/solofilms/BookTown_ai_15/app/lib/offline/offlineExpiryManager.ts`

The expiry manager no longer defines a partial local `OfflineEbookRecord` interface. It imports the authoritative offline persistence DTO through `OfflineReaderRecordDTO`, which derives from `/Users/solofilms/BookTown_ai_15/app/lib/offline/offlineManager.ts`.

This removes the drift where expiry enforcement accepted a smaller record shape that was not assignable to the real offline manager contract.

## Continuity And Progress Authority Changes

Changed file:

- `/Users/solofilms/BookTown_ai_15/lib/hooks/useCurrentlyReading.ts`

Currently-reading now maps the backend `getReaderInsights` response into `ReaderContinuityDTO`. The hook no longer relies on an `any`-typed React Query options object, and `queryResult.data` is now correctly inferred as `CurrentlyReadingItem[]`.

Boundary after T4:

```text
getReaderInsights
  -> ReaderInsightsDTO
  -> ReaderContinuityDTO[]
  -> useCurrentlyReading display projection
```

This preserves backend authority over continuity and progress while keeping the frontend as a typed projection layer.

## EPUB Runtime Stabilization

Changed file:

- `/Users/solofilms/BookTown_ai_15/components/reader/EpubViewer.tsx`

T4 added a localized `resolveEpubFactory` adapter for the `epubjs` runtime factory and typed the `selected` event overload explicitly. This removes unsafe direct conversion of the imported module into the app's runtime `EpubBook` contract and aligns EPUB selected-event callbacks with the actual runtime event shape.

The EPUB engine architecture was not rewritten.

## Reader Runtime Boundary Clarification

Changed file:

- `/Users/solofilms/BookTown_ai_15/lib/reader/narration/browserSpeechSynthesisProvider.ts`

Browser speech synthesis now uses a narrow `SpeechSynthesisRuntimeWindow` adapter for the optional `SpeechSynthesisUtterance` constructor. This keeps browser runtime feature detection explicit and prevents the app from assuming every `Window` type exposes that constructor.

Boundary after T4:

- browser capability detection remains runtime-owned
- narration provider consumes an explicit runtime window adapter
- reader narration DTOs remain in `lib/reader/runtime/contracts.ts`

## Validation Results

| Command | Status | Evidence |
|---|---|---|
| `npm run build` | Passed | Production truth precheck passed, Vite built 1208 modules, production bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync completed and functions TypeScript build passed. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `npx tsc --noEmit` | Failed | 34 scoped runtime errors remain across 20 files. No Reader/Offline/EPUB errors remain. |

T4-specific verification:

| Check | Status |
|---|---|
| Offline persistence record duplication removed | Passed |
| Currently-reading continuity DTO typed | Passed |
| React Query data inference restored for currently-reading | Passed |
| EPUB runtime factory adapter localized | Passed |
| EPUB selected-event callback typed | Passed |
| Browser speech synthesis runtime constructor typed | Passed |
| Phase A production truth regression | None detected |
| T1 React Query regression | None detected |
| T2 Search/Book regression | None detected |
| T3 Social/Post regression | None detected |

## Remaining Runtime Drift

Remaining `tsc` failures are outside the approved T4 Reader/Offline scope.

| Area | Remaining Drift | Scope Status |
|---|---|---|
| Author canonicalization | Callable envelope narrowing drift | Out of scope |
| Profile/Shelf UI | Toast wiring and ShelfCarousel prop contract drift | Out of scope |
| Write templates | `WriteContentNode` literal widening | Out of scope |
| Notifications/read stats | User/profile stats field mismatches | Out of scope |
| Firestore/infrastructure | Generic Firestore adapter and notification preferences drift | Out of scope |
| Admin quotes | Required quote payload fields remain optional locally | Out of scope |
| Misc UI contracts | Home/discover/review modal local prop/import drift | Out of scope |

Dominant remaining error codes:

- `TS2339`: property drift in non-Reader domains.
- `TS2345`: argument contract mismatches in non-Reader domains.
- `TS2304`: unresolved local UI symbol drift.

## Architectural Risks

Reader/Offline authority is now materially clearer, but broader type stability still depends on later domain passes.

Residual risks to track later:

- Reader session bootstrap still trusts callable response normalization locally; a future backend contract pass should make the callable surface contract-derived.
- Offline persistence is local-only by design; future sync features should keep persistence records separate from runtime session DTOs.
- Reader progress write payloads remain intentionally scoped to reader sync clients and should not be reused as UI state.

T4 avoided EPUB architecture rewrites, broad casts, and Reader UX redesign.

## Post-T4 Verdict

T4 is successful for its approved scope.

Reader runtime DTO authority is clarified, offline persistence records are separated from runtime reader DTOs, continuity/progress display projections are typed, EPUB runtime drift is removed, and Phase A through T3 guarantees remain intact.

The codebase is not yet globally type-stable. Remaining compiler failures are concentrated in Author canonicalization, Profile/Shelf, Write templates, notifications/read stats, and infrastructure contracts, not Reader/Offline authority.
