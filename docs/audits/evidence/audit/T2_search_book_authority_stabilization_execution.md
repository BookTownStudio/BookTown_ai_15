---
id: BT-AUDIT-T2-SEARCH-BOOK-AUTHORITY-STABILIZATION-EXECUTION
title: "BookTown T2 Search And Book Contract Authority Stabilization Execution"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/T2_search_book_authority_stabilization_execution.md
---

# BookTown T2 Search And Book Contract Authority Stabilization Execution

## Executive Summary

T2 stabilized Search and Book runtime contract authority without changing route exposure, navigation, Shelf, Reader, Social, feature governance, or global entity architecture.

The Search DTO is now owned by `/contracts/bookSearch.ts`. Frontend runtime imports derive from that contract through `/types/bookSearch.ts`, and functions consume the synced copy at `/functions/src/contracts/shared/bookSearch.ts`. The old functions-local `SearchBookResponse` ownership was removed.

Book details runtime now uses explicit public/detail view DTOs instead of treating the canonical `Book` entity as a generic record. Runtime-critical unsafe `Book` to `Record<string, unknown>` casts were removed from the book details flow and the hooked book attachment renderer.

| Metric | Before T2 | After T2 | Result |
|---|---:|---:|---|
| Runtime/root TypeScript errors | 81 | 51 | 30 fewer errors |
| Files with runtime/root TypeScript errors | 35 | 30 | 5 fewer files |
| Duplicated functions Search response type | Present | Removed | Search authority consolidated |
| `SearchResultDTO` authority definitions | Frontend-owned plus local functions type | Contract source plus synced functions copy | Stabilized |
| Runtime `book as Record<string, unknown>` casts | Present | Removed from Search/Book runtime paths | Stabilized |

## Search Contract Authority Changes

Canonical Search contract authority now lives in:

- `/Users/solofilms/BookTown_ai_15/contracts/bookSearch.ts`

Frontend runtime derives its Search types from:

- `/Users/solofilms/BookTown_ai_15/types/bookSearch.ts`

Functions derive the same contract through the contract sync copy:

- `/Users/solofilms/BookTown_ai_15/functions/src/contracts/shared/bookSearch.ts`

The contract sync list in `/Users/solofilms/BookTown_ai_15/functions/scripts/syncContracts.cjs` now includes `bookSearch.ts`, so `npm --prefix functions run build` refreshes the functions-side copy before compiling.

Removed local ownership:

- Deleted the functions-local `SearchBookResponse` type in `/Users/solofilms/BookTown_ai_15/functions/src/api.ts`.
- Replaced it with `SearchResultDTO` and `ExternalReadableSourceDTO` from the shared contract.
- Renamed the normalization path to produce `SearchResultDTO`, not an API-private response shape.

Verification:

```text
rg "SearchBookResponse|interface SearchResultDTO" app components contracts functions/src lib services types
contracts/bookSearch.ts
functions/src/contracts/shared/bookSearch.ts
```

The two `SearchResultDTO` declarations are the canonical source and its generated functions copy.

## Book Runtime DTO Changes

Added explicit runtime view DTOs:

- `/Users/solofilms/BookTown_ai_15/types/bookRuntime.ts`

New DTO boundaries:

- `BookPublicViewDTO`: display-safe public book fields.
- `BookDetailsRuntimeDTO`: details/acquisition fields needed by the Book Details runtime.
- `toBookPublicViewDTO(book)`
- `toBookDetailsRuntimeDTO(book)`
- `buildPendingSearchBookView(result, fallbackBookId)`

This separates UI display/acquisition needs from the broader legacy `Book` entity without rewriting `types/entities.ts` or introducing a monolithic replacement type.

`/Users/solofilms/BookTown_ai_15/app/book-details.tsx` now maps catalog `Book` records into `BookDetailsRuntimeDTO` before display/readability logic. Pending external Search results are mapped through `buildPendingSearchBookView`, preserving backend-authored Search truth while avoiding ad hoc UI shape invention.

`/Users/solofilms/BookTown_ai_15/lib/books/buildLegacyBookView.ts` now supplies the required default ontology for legacy UI-facing `Book` construction, keeping the existing legacy adapter valid without widening the `Book` interface.

## Unsafe Cast Removal

Removed runtime-critical unsafe Book casts from:

- `/Users/solofilms/BookTown_ai_15/app/book-details.tsx`
- `/Users/solofilms/BookTown_ai_15/components/content/AttachmentRendererV1.tsx`

Current verification:

```text
rg "book as Record<string, unknown>|\\(book as Record<string, unknown>\\)|as unknown as Book|as Book" app components lib services types
```

Remaining matches are not unsafe runtime Book casts:

- `services/librarySearchService.ts`: `BookEdition` adapter cast from Firestore document data.
- `services/firebaseDbService.ts`: Bookmark type narrowing.
- `lib/data-validation.ts`: legacy Bookmark normalization.

## Backend-To-UI Contract Flow Changes

Search flow is now deterministic:

```text
contracts/bookSearch.ts
  -> types/bookSearch.ts
  -> frontend search services/hooks/components

contracts/bookSearch.ts
  -> functions/scripts/syncContracts.cjs
  -> functions/src/contracts/shared/bookSearch.ts
  -> functions/src/api.ts
```

Book details flow is now explicit:

```text
backend/catalog Book
  -> useBookCatalog()
  -> toBookDetailsRuntimeDTO()
  -> Book Details UI

SearchResultDTO
  -> buildPendingSearchBookView()
  -> temporary pending display while backend materializes canonical book
```

No frontend-authored canonical Book truth was introduced. Pending Search display remains a runtime view while canonical materialization remains backend-owned through `ensureCanonicalBook`.

## Runtime Boundary Clarification

Boundaries preserved:

- Search list DTOs are separate from Book details runtime DTOs.
- Book details runtime DTOs are separate from backend persistence/canonical entities.
- Legacy `Book` remains a UI-facing compatibility entity for current runtime topology, but T2 stopped using it as a generic record bag in Book Details.
- Firestore document access in `services/librarySearchService.ts` now uses the actual Firebase `Firestore` instance instead of the stale `.raw` wrapper assumption.

Boundaries intentionally not touched:

- Shelf DTOs.
- Reader/offline DTOs.
- Social attachment DTOs.
- Navigation schema.
- Feature governance or route exposure.
- Global `types/entities.ts` decomposition.

## Validation Results

| Command | Status | Evidence |
|---|---|---|
| `npm run build` | Passed | Production truth precheck passed, Vite built 1207 modules, production bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync copied `bookSearch.ts`; functions TypeScript build completed. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `npx tsc --noEmit` | Failed | 51 scoped runtime errors remain across 30 files. Search/Book authority errors were materially reduced. |

T2-specific verification:

| Check | Status |
|---|---|
| Search contract source consolidated | Passed |
| Local `SearchBookResponse` type removed | Passed |
| Frontend Search types derive from contract | Passed |
| Functions Search API derives from synced contract | Passed |
| Runtime Book-to-Record casts removed from Book Details | Passed |
| React Query v5 migration regression | None detected |
| Phase A production truth regression | None detected |

## Remaining Runtime Drift

Remaining `tsc` failures are outside the approved T2 Search/Book scope.

| Area | Remaining Drift | Scope Status |
|---|---|---|
| Social post composer | Incomplete `PostAttachment` construction and navigation literals | Out of scope |
| Profile/Shelf UI | Toast wiring and `ShelfCarousel` prop contract drift | Out of scope |
| Reader/offline | Offline record and EPUB runtime typing drift | Out of scope |
| Notifications/read stats | User/profile stats fields not aligned | Out of scope |
| Write templates | `WriteContentNode` literal widening | Out of scope |
| Attachment metadata | Metadata-to-record casts in shared attachment surfaces | Out of scope |
| Author canonicalization | Callable envelope typing mirrors the old Book issue | Out of scope for T2 |
| Firestore adapter | Generic Firestore adapter mismatch | Out of scope |

The final compiler count is 51 errors across 30 files. The remaining errors are concentrated in Social, Reader, Shelf/Profile, Write, Attachment metadata, Author canonicalization, and infrastructure adapter drift.

## Architectural Risks

The Search and Book contract path is now materially more stable, but global runtime type stability is still blocked by other domain contracts.

Primary residual risks:

- Social attachment DTOs are still constructing incomplete discriminated union members.
- Reader/offline types remain split between storage records and runtime reader expectations.
- Shelf/Profile UI props still exceed the current component contracts.
- Author canonicalization has the same callable envelope typing problem that Book canonicalization had before T2.

T2 avoided the unsafe path of widening `Book` globally or hiding remaining errors with broad casts. The next pass should target one domain at a time, starting with Social attachment DTO authority or Reader/offline authority.

## Post-T2 Verdict

T2 is successful for its approved scope.

Search contract authority is unified under a shared contract source, functions no longer owns a parallel Search response DTO, frontend Search typing derives from the same contract, Book details runtime has explicit view DTOs, unsafe runtime Book casts were removed from the critical Book flow, and Phase A plus T1 guarantees remain intact.

The codebase is not yet globally type-stable. The remaining compiler failures are real domain authority issues, but they are no longer Search/Book authority drift.
