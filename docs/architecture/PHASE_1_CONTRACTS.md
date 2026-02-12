# BookTown — Phase 1 Canonical Contracts
Search → Acquire → Read

This document defines the **non-negotiable contracts** governing Phase 1 of BookTown.
These contracts exist to guarantee correctness, stability, security, and scalability.

No feature may violate these contracts.
If implementation conflicts with a contract, the implementation must change.

---

## 1. Search Result Contract

Search results are **non-canonical**.

- Search results:
  - Are transient objects
  - Do NOT represent real books
  - Must NEVER be treated as readable entities
- Search results:
  - May be displayed
  - May be previewed
  - May be selected
- Search results:
  - Must expire after user interaction
  - Must not be cached as books
  - Must not be opened by the reader

A book becomes real **only after ingestion succeeds**.

---

## 2. Ingestion Contract

A book is canonical **only** after backend ingestion completes successfully.

- `books/{bookId}` is the sole canonical source of truth
- External IDs (Google Books, OpenLibrary, etc.) are:
  - Non-authoritative
  - Lookup-only
- The reader:
  - Must not open unless ingestion state = `READY`
  - Must not assume ingestion will succeed
- Frontend:
  - Must wait for backend confirmation
  - Must handle ingestion failure explicitly

If ingestion fails, the book does not exist.

---

## 3. Ebook Capability Contract

Metadata is not capability.

The following flags must be explicitly defined and respected:

- `hasEbook`
- `readableInApp`
- `downloadable`
- `offlineCapable`

Rules:
- `hasEbook = true` does NOT imply readability
- Reader may open ONLY when `readableInApp = true`
- Offline reading requires `offlineCapable = true`

No inference, no assumptions, no shortcuts.

---

## 4. Storage Contract

Ebook files are treated as **sensitive assets**.

For every stored ebook:
- Format must be validated (EPUB / PDF)
- File size limits enforced
- Checksum must be generated and stored
- Version must be tracked
- Integrity must be verifiable

Storage URLs:
- Must be short-lived
- Must never be trusted long-term
- Must always be revalidated by backend rules

Reader must fail safely on corrupted files.

---

## 5. Offline Reading Contract

Offline reading is **explicit**, not implicit.

Rules:
- Books are offline only if explicitly downloaded
- Downloaded means:
  - Stored locally
  - Verified
  - Restorable
- Offline content must survive:
  - App reload
  - Airplane mode
  - Temporary cache eviction

If offline guarantees cannot be met, offline must be disabled.

---

## 6. Authority Contract

- Backend is authoritative
- Frontend reflects state, never assumes it
- Visibility does NOT imply existence
- Availability does NOT imply readiness

All state transitions must be backend-confirmed.

---

## Final Note

These contracts define what **cannot break**.
Features may evolve.
Contracts do not.

Any violation is a production bug.
