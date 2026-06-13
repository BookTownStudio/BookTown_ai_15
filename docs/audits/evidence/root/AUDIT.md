---
id: BT-AUDIT
title: "Book Engine V2 Audit (Verify-Only)"
status: locked
authority_level: audit
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: AUDIT.md
---

# Book Engine V2 Audit (Verify-Only)

## Verified UI Search Entry Points
- `app/tabs/home.tsx` -> `useBookSearch` -> `bookSearchService.searchBooks` -> `GET /api/search/books` -> `unifiedSearch`
- `components/modals/AddBookModal.tsx` -> `useBookSearch` -> `bookSearchService.searchBooks` -> `GET /api/search/books` -> `unifiedSearch`
- `components/modals/SelectBookModal.tsx` -> `useBookSearch` -> `bookSearchService.searchBooks` -> `GET /api/search/books` -> `unifiedSearch`
- `app/search/live.tsx` -> `useBookSearch` -> `bookSearchService.searchBooks` -> `GET /api/search/books` -> `unifiedSearch`

## Verified Details-Load Ingestion Chain
- `app/book-details.tsx` detects `pendingSearchResult.resultType === "external"` on load
- `useBookIngestion` -> `bookIngestionService.ingest` -> callable `ingestBook`
- Backend `functions/src/library/ingestBook.ts` writes/merges:
  - `books/{bookId}`
  - `editions/{source}:{externalId}`
  - `book_identity/{identityKey}`
  - `book_ingestions/{source}:{externalId}`
  - `cover_jobs/{bookId}` when cover state is not `READY`

## Verified Cover Pipeline Chain
- Firestore trigger `functions/src/library/processCoverJobs.ts` on `cover_jobs/{bookId}`
- Transition: `PENDING -> PROCESSING -> READY|FAILED`
- Storage targets: `books/{bookId}/covers/{original|large|medium|small}.jpg`
- Final canonical cover state written back to `books/{bookId}.coverState` and `books/{bookId}.cover.*`

## Legacy Path Scan
- UI surface usage of `useBookSearch(...)` found only in: home, add-to-shelf modal, attach-book modal, live search.
- Client `/api/search/books` usage resolves through `services/bookSearchService.ts`.
- No active `useLiveBookSearch`/`federatedSearch` references found in current source scan.

## Manual Smoke Checklist (10 lines max)
1. Home search: observe `BOOK_SEARCH_V2_SURFACE_HOME`, `BOOK_SEARCH_V2_CLIENT_QUERY`, `BOOK_SEARCH_V2_HTTP`.
2. Add-to-shelf search: observe `BOOK_SEARCH_V2_SURFACE_ADD_TO_SHELF`, `BOOK_SEARCH_V2_CLIENT_QUERY`, `BOOK_SEARCH_V2_HTTP`.
3. Attach-book search: observe `BOOK_SEARCH_V2_SURFACE_ATTACH_BOOK`, `BOOK_SEARCH_V2_CLIENT_QUERY`, `BOOK_SEARCH_V2_HTTP`.
4. Live search: observe `BOOK_SEARCH_V2_SURFACE_LIVE`, `BOOK_SEARCH_V2_CLIENT_QUERY`, `BOOK_SEARCH_V2_HTTP`.
5. Confirm network requests are only `GET /api/search/books` for search.
6. Canonical query: `BOOK_SEARCH_V2_ENGINE_TRACE` shows canonical phases; `BOOK_SEARCH_V2_API` shows `externalCount=0`.
7. Sparse query: `BOOK_SEARCH_V2_ENGINE_TRACE` shows `externalFallbackCalled=true` when canonical count is below threshold.
8. Open external result in details: `BOOK_DETAILS_V2_INGEST_TRIGGER` then `BOOK_INGEST_V2_TRACE`.
9. Confirm Firestore docs (`books`, `book_identity`, `book_ingestions`, `cover_jobs`) and `COVER_JOB_V2_TRACE` transitions.
10. Confirm no `BOOK_INGEST_V2_TRACE` during search render; ingestion traces appear only after details load.
