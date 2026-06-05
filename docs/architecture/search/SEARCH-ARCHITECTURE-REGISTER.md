# BookTown Search Architecture Register

## Discoveries

### D-001
Status: VERIFIED

Finding:
Search returns a mixed result set:
- BookTown records are emitted as canonical works.
- External provider records are emitted as editions.

Evidence:
SEARCH-AUDIT-001 / D-007

### D-002
Status: VERIFIED

Finding:
Search providers currently used are:
- Firestore books
- Google Books
- OpenLibrary

Evidence:
SEARCH-AUDIT-001 / D-003

### D-003
Status: VERIFIED

Finding:
`books/{bookId}` is the canonical work authority row.

Evidence:
SEARCH-AUDIT-002

### D-004
Status: VERIFIED

Finding:
`editions/{editionId}` rows belong to works through `bookId` and `workId`.

Evidence:
SEARCH-AUDIT-002

### D-005
Status: VERIFIED

Finding:
Work-level identifiers exist as `bookId`, `canonicalKey`, and `workIdentity`.

Evidence:
SEARCH-AUDIT-002

### D-006
Status: VERIFIED

Finding:
`book_identity` maps identity keys (e.g. `canonical:*`, `provider:*`) to `bookId`.

Evidence:
SEARCH-AUDIT-002

### D-007
Status: VERIFIED

Finding:
`authors` and `author_identity` are backend materialized authority surfaces.

Evidence:
SEARCH-AUDIT-002

### D-008
Status: VERIFIED

Finding:
Ontology is stored on `books.ontology` and mirrored as `books.literaryForm`.

Evidence:
SEARCH-AUDIT-002

### D-009
Status: VERIFIED

Finding:
Explicit semantic graph relationships are stored in `literary_relationships`.

Evidence:
SEARCH-AUDIT-002

### D-010
Status: VERIFIED

Finding:
Derived semantic graph relationships are calculated from ontology fields and semantic references.

Evidence:
SEARCH-AUDIT-002

### D-011
Status: VERIFIED

Finding:
Related books are currently author-based, not graph-based.

Evidence:
SEARCH-AUDIT-002

### D-012
Status: VERIFIED

Finding:
Canonical Factory / Refinery artifacts can enrich existing books after identity resolution but do not create new canonical works through the audited path.

Evidence:
SEARCH-AUDIT-002

### D-013
Status: VERIFIED

Finding:
Search ranks canonical works and external editions together, with canonical works explicitly preferred in final ordering.

Evidence:
SEARCH-AUDIT-002

### D-014
Status: VERIFIED

Finding:
Production `books` contains 145 documents.

Evidence:
SEARCH-AUDIT-003

### D-015
Status: VERIFIED

Finding:
Production catalog contains 116 canonical works and 29 provisional works.

Evidence:
SEARCH-AUDIT-003

### D-016
Status: VERIFIED

Finding:
Production `editions` contains 131 documents; all have `bookId` and 121 have `workId`.

Evidence:
SEARCH-AUDIT-003

### D-017
Status: VERIFIED

Finding:
Production `authors` contains 442 documents; all have `canonicalKey`.

Evidence:
SEARCH-AUDIT-003

### D-018
Status: VERIFIED

Finding:
Production `book_identity` contains 328 documents; 318 map to existing books and 271 map to canonical books.

Evidence:
SEARCH-AUDIT-003

### D-019
Status: VERIFIED

Finding:
142 books contain sufficient canonical identity fields to resolve as canonical search results.

Evidence:
SEARCH-AUDIT-003

### D-020
Status: VERIFIED

Finding:
Ontology exists on 143 of 145 books, but canonical tradition exists on only 62 books.

Evidence:
SEARCH-AUDIT-003

### D-021
Status: VERIFIED

Finding:
No production books currently contain valid `semanticRefs`.

Evidence:
SEARCH-AUDIT-003

### D-022
Status: VERIFIED

Finding:
`literary_relationships` contains only 8 records and uses the legacy relationship schema.

Evidence:
SEARCH-AUDIT-003

### D-023
Status: VERIFIED

Finding:
Readable ebook coverage is 12 books total:
- 10 in-app readable
- 2 external-readable

Evidence:
SEARCH-AUDIT-003

### D-024
Status: VERIFIED

Finding:
The locked Search Results Specification assumes a work-centric search model. Search results represent literary works with availability summaries, while editions remain subordinate and are accessed through details, reading, or acquisition flows.

Evidence:
BookTown — Search Results List v1.1 (LOCKED)

---

## Open Questions

### Q-001
Status: OPEN

Question:
`books.workType` uses values `canonical` / `provisional`, while search DTO `workType` uses `work` / `edition`. The naming overlap is ambiguous.

Source:
SEARCH-AUDIT-002

### Q-002
Status: OPEN

Question:
Both `books.editionId` and `books.canonicalRelations.primaryEditionId` appear to represent the primary edition. The authoritative field is unclear from schema naming.

Source:
SEARCH-AUDIT-002

### Q-003
Status: OPEN

Question:
Frontend types model a clean Work → Edition architecture, but runtime paths still rely on legacy `Book` compatibility fields.

Source:
SEARCH-AUDIT-002

### Q-004
Status: OPEN

Question:
Refinery artifacts contain semantic references and embedding descriptors, but direct persistence behavior is not fully verified.

Source:
SEARCH-AUDIT-002

### Q-005
Status: OPEN

Question:
Does `rightsMode: "public_free"` represent the intended public-domain classification?

Source:
SEARCH-AUDIT-003

### Q-006
Status: OPEN

Question:
Should graph coverage be measured using the legacy relationship schema or only the newer entity-based schema?

Source:
SEARCH-AUDIT-003

### Q-007
Status: OPEN

Question:
Why do 10 `book_identity` records point to non-existing book IDs?

Source:
SEARCH-AUDIT-003

### Q-008
Status: OPEN

Question:
When a work has multiple editions and one or more readable formats, should search results represent:
A) the Work,
B) the Edition,
or
C) the Work with an availability summary?

Source:
ARCHITECTURE DISCUSSION

---

## Proposed Decisions

(No proposals recorded yet)

---

## Locked Decisions (ADR)

### ADR-S-001
Decision:
All search architecture discussions are tracked in this register.

Status:
LOCKED

Date:
2026-06-05

---

## Roadmap

### Phase A — Current State Audit
Status: COMPLETED

### Phase B — Target Architecture
Status: NOT STARTED

### Phase C — Implementation Plan
Status: NOT STARTED