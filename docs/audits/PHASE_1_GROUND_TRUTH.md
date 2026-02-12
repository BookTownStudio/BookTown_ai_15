# BookTown Phase 1 — Ground Truth Implementation Audit

**Scope:** Search → Acquire → Read  
**Mode:** Analysis only (no execution, no code changes)  
**Date:** Locked after audit review  
**Authority:** CTO-approved baseline

---

## 0. Purpose

This document defines the **non-negotiable ground truth** of BookTown’s Phase 1 implementation.

It exists to:
- Prevent re-auditing the same decisions
- Stop architectural drift
- Anchor backend and reader hardening work
- Serve as the single reference for “what exists vs what is missing”

This file is **locked**.
All Phase 1 work must align with it.

---

## 1. Implemented — What Exists & How It Works

### 1.1 Search

**Status:** ✅ Implemented (frontend + backend)

**Frontend**
- Live search UI exists (`useLiveBookSearch`).
- Debounced, query-driven.
- Results render immediately (no pagination yet).

**Backend**
- `/api/search/books` endpoint exists.
- Pulls from external providers (Google Books / OpenLibrary-like).
- Results are **not canonical** at search time.

**Important behavior**
- Search results are **transient objects**.
- A result becomes a real book **only after ingestion**.

---

### 1.2 Search Result Quality

**Status:** ⚠️ Partially implemented

- Title, author, cover usually present.
- Metadata quality varies by provider.
- No ranking model beyond provider order.
- No deduplication across providers.
- No language normalization.
- No edition clustering.

---

### 1.3 Ebook Filtering

**Status:** ⚠️ Metadata-level only

- Backend flags ebook availability.
- Filtering exists via query flags.
- No guarantee that “ebook available” means:
  - readable in-app
  - downloadable
  - offline-capable

This is **metadata filtering**, not **capability filtering**.

---

### 1.4 Book Ingestion

**Status:** ✅ Core path implemented

- Triggered when user:
  - adds a book
  - saves to shelf
  - starts reading

**Backend**
- `ingestBook` Cloud Function exists.
- Writes canonical `books/{bookId}` document.
- External IDs stored as non-authoritative references.

**Canonical rule**
- Firestore `bookId` is the sole identity.
- External IDs are lookup-only.

---

### 1.5 Firebase Storage (Ebooks)

**Status:** ⚠️ Implemented but fragile

- Storage bucket configured.
- Ebook files can be uploaded or fetched.
- URLs generated and saved.

**Missing**
- Lifecycle rules
- Checksum / integrity validation
- Versioning strategy
- Explicit access control scope

---

### 1.6 Library & Shelves

**Status:** ✅ Implemented and stabilized

- Shelves are physical Firestore documents.
- System shelves:
  - currently-reading
  - want-to-read
  - finished

**Notes**
- `useUserShelves` is read-only.
- Backend is authoritative.
- Sorting assumes shelves exist physically.

---

### 1.7 Ebook Upload

**Status:** ⚠️ Incomplete

- Upload flow exists.
- Files land in Firebase Storage.
- Metadata saved.

**Missing guarantees**
- File format validation (EPUB/PDF)
- Size limits enforcement
- Malware scanning
- Retry & resumable uploads

---

### 1.8 E-Reader

**Status:** ⚠️ Partially implemented

- Reader screen exists.
- EPUB/PDF open works.
- Basic navigation works.

**Missing**
- Pagination stability
- Font/layout persistence
- Reading position sync guarantees
- Corruption recovery

---

### 1.9 Offline Reading

**Status:** 🚧 Skeleton only

- OfflineProvider exists.
- Partial caching wired.

**Reality**
- No deterministic offline contract.
- No explicit “download for offline” lifecycle.
- Cache invalidation undefined.
- Reader does not survive reloads reliably.

---

## 2. Missing — Not Implemented

- Search result deduplication
- Canonical edition clustering
- Ebook capability classification
- Offline download management UI
- Background sync for reading progress
- Retry/repair flows for failed ebooks
- Data migration/versioning strategy

---

## 3. Fragile — Implemented but Unsafe

- Search → Read race conditions
- Reader can open before ingestion settles
- React Query cache poisoning risks
- Long-lived storage URLs
- Reader can brick on corrupted files

---

## 4. Architectural Issues

### 4.1 Separation of Concerns

- Search layer leaks ingestion assumptions
- Reader assumes storage success
- Offline logic scattered, not centralized

---

### 4.2 Authority Boundaries

- Backend is authoritative (correct)
- Frontend sometimes assumes “visible = exists”

---

## 5. Production Gaps (vs Kindle / Goodreads)

- No strong offline contract
- No background repair jobs
- No integrity validation
- No observability for reader failures
- No graceful degradation

---

## 6. Implicit Assumptions (Unenforced)

- Every shelf exists
- Every book eventually becomes canonical
- Storage URLs are always valid
- Reader can handle any EPUB/PDF

None are formally enforced.

---

## 7. Security Risks

- Ebook URLs shareable if leaked
- No per-request authorization on read
- Upload trusts client metadata
- Offline cache not encrypted

---

## 8. Bottom Line (CTO Summary)

- Phase 1 is real and functional.
- Core pipeline exists: Search → Ingest → Store → Read.
- Instability came from tooling interference, not bad architecture.
- Foundation is solid but **must now be hardened, not expanded**.

---

## 9. Status

**This document is LOCKED.**  
It is the baseline for Phase 1 hardening.

All future work must:
- Respect this reality
- Improve safety, not expand scope
- Preserve backend authority
