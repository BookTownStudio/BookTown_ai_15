---
id: BT-DOCS-DATA-PIPELINE
title: "Data Pipeline"
status: active
authority_level: architecture
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

📚 BookTown Data Pipeline Architecture

Search → Catalog → Reader (Canonical Ingestion Model)

Status: Enforced
Owner: CTO decision
Scope: Search, ingestion, navigation, BookDetails, Reader
Goal: One canonical data graph, zero ghost states, deterministic behavior

⸻

1. The Problem We Solved

Previously, BookTown suffered from architectural fragmentation:
	•	Search results opened BookDetails using temporary UI objects
	•	Some screens passed paramBook, others relied on Firestore
	•	Ingestion sometimes happened, sometimes didn’t
	•	Reader often showed “Book not found”
	•	Race conditions between navigation and backend ingestion
	•	Each screen implemented its own logic

Result:

❌ Inconsistent UX
❌ Fragile state
❌ Impossible to reason about correctness
❌ No single source of truth

This document defines the final architecture decision.

⸻

2. Core Principle

There is only ONE authoritative book state: the catalog (Firestore-backed canonical document).

Everything else (search results, external APIs, AI identification, OCR, etc.) is temporary input that must be ingested before navigation.

⸻

3. Canonical Rule (Non-negotiable)

✅ Rule:

All navigation to bookDetails or reader MUST await ingestion first.

This applies to:
	•	Home search
	•	Live search
	•	AddBookModal
	•	AI identify flows
	•	Any future entry point

Required flow:

User clicks book
    ↓
await ingestBook(...)
    ↓
navigate(bookDetails, canonicalId)
    ↓
useBookCatalog(canonicalId) succeeds deterministically

No exceptions.

⸻

4. Single Authority for Ingestion

Authoritative mechanism

useBookIngestion()

or internally:

dataService.catalog.ingestBook(...)

Why this is the only authority
	•	Backend Cloud Function normalizes metadata
	•	Writes canonical Firestore documents
	•	Ensures Storage assets (covers, etc.)
	•	Idempotent (safe to call multiple times)
	•	Guarantees that the returned ID exists in the catalog

This is the choke point of the data graph.

⸻

5. Enforced Changes Implemented

✅ AddBookModal
	•	Clicking a result:
	•	Awaits ingestion
	•	Navigates only after canonical ID is returned

✅ app/search/live.tsx
	•	Clicking a result:
	•	Uses mutateAsync
	•	Awaits ingestion
	•	Navigates with canonical ID

✅ app/tabs/home.tsx
	•	Already awaiting ingestion
	•	Must remain consistent with this contract

✅ useLiveBookSearch
	•	Fully decoupled from navigation state
	•	Search is a utility, not a view-gated mechanism

⸻

6. Why paramBook Is Architecturally Dangerous

In app/book-details.tsx:

const displayBook = paramBook || book;

This is currently tolerated only as a UX optimization, but architecturally:

paramBook is not canonical and must never be treated as authoritative state.

Future direction (not optional long-term)
	•	Remove reliance on paramBook
	•	Always rely on catalog state
	•	Show loading skeletons instead of ghost data

This will further simplify correctness guarantees.

⸻

7. What This Architecture Guarantees

With this model enforced, BookTown gains:

✅ BookDetails always loads
✅ Reader never shows “book not found”
✅ One data graph
✅ Deterministic caching
✅ Stable React Query behavior
✅ Offline cache consistency
✅ Accurate analytics
✅ Easier debugging
✅ Safe future extensions

This is foundational for:
	•	Recommendations engine
	•	Reading progress tracking
	•	Quotes extraction system
	•	Social features
	•	AI agents
	•	Cross-device sync

⸻

8. Files Bound by This Contract

Any code touching these files must respect this rule:
	•	components/modals/AddBookModal.tsx
	•	app/search/live.tsx
	•	app/tabs/home.tsx
	•	Any future search surfaces
	•	Any AI-identification flows
	•	Any external imports

Litmus test

If you see:

navigate({ id: 'bookDetails', params: { bookId } })

Ask immediately:

“Was ingestion awaited before this navigation?”

If the answer is no → bug.

⸻

9. Design Philosophy

This is not a UI decision.
This is a platform architecture rule.

We are not building screens.
We are building a literary operating system.

The catalog is the backbone.
Everything else feeds into it.

⸻

10. Final CTO Decision (Locked)

✔ Ingestion is mandatory
✔ Await ingestion before navigation
✔ One canonical graph
✔ No ghost objects
✔ No UI shortcuts
✔ Deterministic behavior over perceived speed
✔ Architecture > convenience

⸻

This file must remain in the repository as a reference point for all future development touching data flow, navigation, or catalog state.