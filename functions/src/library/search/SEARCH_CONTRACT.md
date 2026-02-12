# BookTown Search Contract

**Version:** 1.0.0  
**Status:** LOCKED  
**Applies to:** `unifiedSearch` and all downstream ranking, filtering, and promotion logic  
**Enforced by:** `searchHarness.test.ts`  
**Change Policy:** Any observable behavior change requires a MAJOR contract version bump

---

## 0. Authority & Scope

This document is the **authoritative behavioral contract** for BookTown search.

- Code **must conform** to this contract
- Tests are the **enforcement mechanism**
- Refactors are allowed **only if all tests remain green**
- Silent behavior drift is **strictly forbidden**

This contract governs:
- Intent detection
- Result inclusion / exclusion
- Ordering guarantees
- Author dominance behavior
- Safety and noise suppression

---

## 1. Core Principle

BookTown search is **not a generic keyword engine**.

It is a **literary relevance engine**.

Search results must privilege **literary intent** over:
- Statistical relevance
- Popularity
- Raw keyword matching
- External provider ordering

---

## 2. Author-Dominant Intent Rule (HARD)

When a query expresses **author intent** (e.g. `rowling`, `hesse`):

1. Primary works by the dominant author **MUST appear first**
2. All top results **MUST belong to that author**
3. Secondary literature **MUST be demoted**
4. Author names **MUST NOT be rewritten, masked, or editorialized**
5. Canonical author equality **IS REQUIRED**

Author dominance is **deterministic**, not probabilistic.

### Explicitly Forbidden
- Display-only author overrides
- Partial or fuzzy author clamping
- Editorial masking
- Cross-author series leakage
- Heuristic-only dominance without multi-item confirmation

✔ Enforced by  
`Series expansion correctness — rowling`

---

## 3. Secondary Literature Suppression

Secondary material includes (non-exhaustive):
- Criticism
- Studies
- Companions
- Essays about the work
- Proceedings
- Reports
- Institutional analysis of literature

Rules:
- ❌ Must **never** appear before primary works
- ❌ Must **never** lead author-dominant queries
- ✔ May appear **only after** all primary works
- ✔ May appear only if literary intent remains satisfied

✔ Enforced by  
`Series expansion correctness — rowling`  
`Author intent dominance — hesse`

---

## 4. Legal & Institutional Noise Suppression

The following are **structurally non-literary** and must be filtered or strongly demoted:

- Legal cases (`v.`, `vs`, `in re`, `estate`)
- Court reporters
- Conference proceedings
- Government or institutional reports
- Administrative or regulatory documents

These entities must **never** surface as dominant results for literary queries.

✔ Enforced by  
`Literary dominant entity ordering — harry`  
`Negative intent suppression — financial`

---

## 5. Keyword Ambiguity Containment

For ambiguous queries (e.g. `wolf`, `financial`):

- Results **must remain literary**
- Institutional or non-literary entities **must not surface**
- Safety and relevance filtering applies **before ranking**
- Ambiguity must never leak into non-book domains

✔ Enforced by  
`Keyword ambiguity containment — wolf`

---

## 6. Result Count Contract

- Minimum results: **≥ 1**
- Maximum results: **≤ 20**
- The upper cap is **intentional, performance-driven, and UX-aligned**

Any change requires:
- Updated tests
- MAJOR contract version bump

---

## 7. Enforcement Mechanism

This contract is enforced by:

- `searchHarness.test.ts` (behavioral authority)
- Deterministic logic inside `searchEngine.ts`
- Explicit rejection of silent behavioral changes

If code and contract disagree:
> **The contract wins.**

---

## 8. Change & Versioning Policy

### Version Semantics
- **MAJOR** → Observable behavior changes (ordering, inclusion, dominance, safety)
- **MINOR** → Additive guarantees without regressions
- **PATCH** → Internal refactors only (tests unchanged)

### Mandatory Rule
No MAJOR version bump is valid **without new or updated tests**.

---

## 9. AI / Codex Safety Clause

Any AI-assisted change to search code must include this constraint:

> “This code is governed by BookTown Search Contract v1.0.0.  
> You are not allowed to change observable behavior or tests.  
> If behavior must change, propose a MAJOR version bump first.”

---

**This contract is now LOCKED at v1.0.0.**  
All future evolution must be explicit, test-backed, and intentional.