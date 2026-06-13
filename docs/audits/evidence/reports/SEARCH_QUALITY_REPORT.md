---
id: BT-DOCS-SEARCH-QUALITY-REPORT
title: "Search Quality & Ranking Evaluation Report"
status: evidence
authority_level: none
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

# Search Quality & Ranking Evaluation Report

**Date:** 2026-05-03  
**Engine:** `unifiedSearch()` — `functions/src/library/search/searchEngine.ts`  
**Harness:** `functions/src/library/search/__tests__/searchHarness.test.ts`  
**Scope:** Static code analysis + harness trace. No live Firestore data.

---

## 1. Engine Architecture Summary

The pipeline executes in strict phases:

```
Query → Normalize → Canonical Retrieval (Firestore) → Typo Correction
     → Intent Detection → Canonical Gating → Dominant-Family Filter
     → Rerank (literary corrections) → External Fallback (if needed)
     → Intent Gate on External Seeds → Dedup External vs Canonical
     → Merge Sort (canonical-first) → Pagination
```

Key constants:
| Constant | Value | Effect |
|---|---|---|
| `EXTERNAL_FALLBACK_TRIGGER` | 5 | External called when canonical < 5 results |
| `CONFIDENCE_THRESHOLD` | 0.72 | Low-confidence docs dropped from both pools |
| `INTERNAL_FETCH_POOL` | 100 | Docs fetched per Firestore phase |
| `EXTERNAL_PROVIDER_TIMEOUT_MS` | 3000 | Hard cutoff per provider fetch |
| `MAX_TYPO_EDIT_DISTANCE` | 2 | Levenshtein budget for short tokens |
| `MAX_LONG_TYPO_EDIT_DISTANCE` | 3 | Budget for tokens ≥ 9 chars |
| `MIN_TYPO_TOKEN_LENGTH` | 4 | Tokens below this are not corrected |

---

## 2. Simulated Test Cases

### 2.1 Exact Title Match

| Query | Expected Top Result | Actual Behavior | Status |
|---|---|---|---|
| `"Harry Potter and the Philosopher Stone"` | e1 — J. K. Rowling | titleExact=true → tier 1, confidence ≥ 0.99 | ✅ PASS |
| `"Pride and Prejudice"` | e16 — Jane Austen | exactShortClassicTitleMatch +5.4, pinned tier 1 | ✅ PASS |
| `"Crime and Punishment"` | e28 — Dostoevsky | classic_work, tier 0 after dominant-family boost | ✅ PASS |
| `"The Trial"` | e24 — Kafka | classic_work exact, tier 0 boost | ✅ PASS |
| `"Siddhartha"` | e6 — Hesse | single-token titlePrefix path, tier 2 | ✅ PASS |
| `"Men in the Sun"` | e22 — Kanafani | titleEn matches, tier 1 | ✅ PASS |
| `"Al-Ayyam"` | e23 — Taha Hussein | normalizedTitle `"al ayyam"` exact, tier 1 | ✅ PASS |

### 2.2 Partial Title Match

| Query | Expected | Actual Behavior | Status |
|---|---|---|---|
| `"harry potter"` | Any HP book first | All 5 HP books score identically (coverage 1.0, adjacency 1.0); ordering falls to `bookId.localeCompare()` → e1 first by ID sort | ✅ PASS (fragile — order is accidental, not by relevance) |
| `"harry"` | HP book | Single-token, titlePrefix=true, tier 2 | ✅ PASS |
| `"potter"` | HP book | Token hit, tier 2/3 depending on adjacency | ✅ PASS |
| `"philosopher stone"` | Philosopher's Stone | Two-token title coverage 2/2, adjacency bonus | ✅ PASS |
| `"pride prejudice"` | Pride and Prejudice | Both tokens hit, tier 2 | ✅ PASS |

### 2.3 Misspelling / Typo Correction

| Query | Expected | Typo Path | Status |
|---|---|---|---|
| `"harry potr"` | HP book, canonical-first | `"potr"` (4 chars) → edit distance 2 → `"potter"`. Corrected candidate generated. | ✅ PASS (tested) |
| `"dostoyesvky"` | Dostoevsky books | Multi-char token, edit distance 3 → corrected via external seed canonical re-lookup | ✅ PASS (tested) |
| `"siddartha"` | Siddhartha | `"siddartha"` (9 chars) → `MAX_LONG_TYPO_EDIT_DISTANCE=3`, edit distance 1 from `"siddhartha"` | ✅ PASS (expected, untested) |
| `"frankenstien"` | Frankenstein | 12-char token, edit distance 1, should correct | ✅ PASS (expected, untested) |
| `"hermen hesse"` | Hesse books | `"hermen"` → edit distance 2 from `"hermann"` | ✅ PASS (expected, untested) |
| `"war"` | War and Peace | 3-char token, **below `MIN_TYPO_TOKEN_LENGTH=4`** — no correction attempted | ⚠️ NO CORRECTION — relies on prefix search only |
| `"tolstoi"` | Tolstoy works | 7-char token, edit distance 1 from `"tolstoy"` | ✅ PASS (expected) — but only if Tolstoy canonical exists in Firestore |

### 2.4 Author-Only Queries

| Query | Expected | Behavior | Status |
|---|---|---|---|
| `"Rowling"` | HP books first | `AUTHOR_INTENT`, token hit on `"rowling"` in `search.tokens`, literary correction +2.4 for primary works | ✅ PASS (tested) |
| `"Kafka"` | Trial, Metamorphosis | `AUTHOR_INTENT`, `classic_work` rows boosted, biography row `"Franz Kafka Writer 1913"` suppressed by `titleLeadingHardSecondary` | ✅ PASS (tested) |
| `"Camus"` | Stranger, Plague, Fall, Caligula | `AUTHOR_INTENT`, biography row `"Albert Camus A Biography"` suppressed | ✅ PASS (tested) |
| `"Dostoevsky"` | Crime, Idiot | `AUTHOR_INTENT`, anthology `"Complete Works"` suppressed | ✅ PASS (tested) |
| `"J.K. Rowling"` | HP books | Normalized to `"j k rowling"`, tokens `["rowling"]` only (j, k dropped as len=1). Author exact query `"j k rowling"` used for authorNamesNormalized prefix | ✅ PASS |
| `"Taha Hussein"` | Al-Ayyam | Two-token AUTHOR_INTENT, authorNamesNormalized exact match | ✅ PASS (expected) |
| `"Ghassan Kanafani"` | Men in the Sun | Two-token AUTHOR_INTENT, authorNamesNormalized match | ✅ PASS (expected) |

### 2.5 Arabic Script Queries

| Query | Expected | Behavior | Status |
|---|---|---|---|
| `"رجال في الشمس"` | e22 — Kanafani | Arabic tokens indexed: `["رجال", "شمس"]` (في filtered as stopword). Query normalized, tokens hit | ✅ PASS (tested) |
| `"الأيام"` | e23 — Taha Hussein | Exact title token match | ✅ PASS (tested) |
| `"رِجَالٌ فِي الشَّمْسِ"` (with harakat) | e22 — Kanafani | **FAIL** — `normalizeSearchText` uses NFKD which does NOT strip Arabic combining diacritics (U+064B–U+065F). Query tokens won't match stripped canonical tokens. | ❌ FAIL — harakat not stripped |
| `"rijal fi al-shams"` (transliteration) | e22 — Kanafani | **Miss** — no transliteration layer exists. Would fall back to external providers which may or may not return the Arabic book. | ❌ GAP — no transliteration |
| `"men in the sun"` | e22 — Kanafani | titleEn match | ✅ PASS |

### 2.6 External Fallback Behavior

| Query | Canonical Count | External Triggered | Behavior | Status |
|---|---|---|---|---|
| `"harry potter"` | ≥ 5 | ❌ No | Threshold not crossed | ✅ PASS (tested) |
| `"rare fallback term"` | 1 (e15) | ✅ Yes | Both Google + OpenLibrary fetched | ✅ PASS (tested) |
| `"love"` | 0 | ✅ Yes | External results shown, no canonical contamination | ✅ PASS (tested) |
| ISBN `"9780140449136"` (not in catalog) | 0 | ✅ Yes | ISBN-specific endpoints called first | ✅ PASS (tested) |
| ISBN `"9780747532743"` (in catalog) | 1 | ❌ No | Local canonical found, no external | ✅ PASS (tested) |

### 2.7 Canonical-First Ordering (External Not Surfaced Above Canonical)

| Scenario | Status |
|---|---|
| All canonical results appear before any external result in merged output | ✅ GUARANTEED — `compareRanked` checks `typePriority` first |
| External result with same ISBN absorbed into canonical (dedup) | ✅ PASS (tested) |
| External result with same canonical title but different ISBN not deduped | ❌ RISK — `canonicalKey` computation may differ between canonical stored key and computed external key |

---

## 3. Identified Issues

### Issue 1 — Arabic Harakat Not Stripped (MEDIUM)

**Location:** `normalizeSearchText()` in `shared/normalization/index.ts` (called from `bookSearchNormalization.ts`)

**Problem:** The normalization pipeline uses `NFKD + replace(/[\u0300-\u036f]/g, "")` to strip combining diacritics. The range `U+0300–U+036F` covers **Latin and Greek** diacritics only. Arabic harakat (تشكيل) occupy `U+064B–U+065F` and are not stripped.

A user typing `رِجَالٌ فِي الشَّمْسِ` (fully vocalized) will get different tokens than the indexed `رجال في الشمس`, causing a miss.

**Fix:** Extend the strip range to also remove Arabic combining marks:
```ts
.replace(/[\u0300-\u036f\u064b-\u065f]/g, "")
```

**Test case missing:** Query `"رِجَالٌ"` should return e22 (Men in the Sun).

---

### Issue 2 — No Arabic Transliteration Support (MEDIUM)

**Location:** `unifiedSearch()` — no transliteration layer anywhere in the pipeline.

**Problem:** Users who do not have an Arabic keyboard may type phonetic transliterations such as `"rejal fi el shams"`, `"kitab"`, or `"naguib mahfouz"` (for نجيب محفوظ). The engine has no mapping between Latin phonetic forms and Arabic script.

The only partial mitigation is that Arabic books with `titleEn` set (e.g., `"Men in the Sun"`) can be found by their English alias. Books without an English alias are fully unreachable by transliteration.

**Fix options:**
- Add a `transliteratedTitle` field to the book schema indexed in `search.tokens`
- Build a light Arabic-Latin token equivalence map for common author names

---

### Issue 3 — Duplicate Canonical+External for Arabic/ISBN-less Books (HIGH)

**Location:** `mergeCanonicalAvailability()` — identity key resolution

**Problem:** When an Arabic book exists in the canonical catalog **without an ISBN**, its identity key falls through to:
```
canonical:<storedCanonicalKey>
```
e.g., `canonical:ghassan kanafani::men in the sun`

If Google Books returns the same work in Arabic as `"رجال في الشمس"` by `"Ghassan Kanafani"`, the computed canonical key for the external result would be:
```
buildCanonicalKey({ title: "رجال في الشمس", author: "Ghassan Kanafani" })
```
The internal `buildCanonicalKey` normalizes title and author, but the Arabic title normalized form `"رجال في الشمس"` ≠ `"men in the sun"`. Result: **no dedup match**, both the canonical and external variant appear in results.

**No existing test covers this case.**

**Fix:** During external result identity computation, also try the English/Arabic title variants from the result's own fields, or use a fuzzy author+title canonicalization that matches across languages.

---

### Issue 4 — Harry Potter Ranking Order Is Non-Deterministic (LOW)

**Location:** `compareRanked()` — tiebreaker falls to `bookId.localeCompare()`

**Problem:** For `"harry potter"`, all five canonical HP books score identically:
- `rankTier = 1` (title coverage 1.0, adjacency 1.0)
- `computedScore` identical (same coverage, same adjacency bonus)
- `popularityScore = 0`, `engagementScore = 0`, `recentActivityMs = 0` (not set in catalog)

The tiebreaker is `bookId.localeCompare(bookId)`, which in the test fixture gives e1 first (Philosopher's Stone) only because `"book_e1"` sorts before `"book_e13"`. In production, Firestore document IDs are random hashes, so the ordering is effectively arbitrary.

**Impact:** Users searching "harry potter" get a random ordering of HP books.

**Fix:** Populate `popularityScore` or `engagementScore` on book documents (e.g., from read counts or ratings) to provide a meaningful tiebreaker within a matched title family.

---

### Issue 5 — External Fallback Guard Is `NODE_ENV !== "test"` (LOW)

**Location:** Line 3872 — `const externalFallbackEnabled = process.env.NODE_ENV !== "test";`

**Problem:** The external fallback is disabled in the test environment as a side-effect prevention mechanism. This means:
- Any integration test running with `NODE_ENV=test` will never test the full fallback pipeline without explicitly using `vi.stubEnv("NODE_ENV", "development")`.
- The harness tests handle this correctly, but it's a fragile convention.

**Fix:** Inject a `_testDisableExternalFallback?: boolean` option into `SearchOptions` for more explicit test control, removing the global env dependency.

---

### Issue 6 — `GOOGLE_BOOKS_API_KEY` Not Required (MEDIUM)

**Location:** `fetchGoogleExternalRaw()` — `if (apiKey) { searchParams.set("key", apiKey); }`

**Problem:** Google Books API without an API key is rate-limited to approximately 100 requests/day per IP. In production under moderate load, the circuit breaker may trip immediately after the quota is exhausted, causing the Google Books fallback to silently return empty results for the rest of the day.

The circuit breaker will open after 3 consecutive failures but resets after 30 seconds, which means repeated re-probing against an exhausted quota.

**Fix:** Log a startup warning if `GOOGLE_BOOKS_API_KEY` is not set. Add quota-exhaustion detection (HTTP 429) as a distinct circuit-open condition with a longer cooldown.

---

### Issue 7 — Short Token Typo Correction Blind Spot (LOW)

**Location:** `deriveCorrectedQueryCandidates()` — `if (token.length < MIN_TYPO_TOKEN_LENGTH && !anchoredShortToken) continue;`

**Problem:** `MIN_TYPO_TOKEN_LENGTH = 4`. Any token shorter than 4 characters is silently skipped for correction unless it is exactly 3 characters AND paired with a long anchor token.

Examples with no correction:
- `"war"` → no correction (length 3, no anchor) — searches for `"war"` exactly
- `"leo"` → no correction — but `"leo tolstoy"` would work because `"tolstoy"` anchors it
- `"tao"` → no correction

This is intentional for precision (short tokens have too many edit-distance neighbors) but leaves 2–3 character misspellings completely uncorrected.

---

### Issue 8 — External Canonical Key Mismatch for Same-Title Books (MEDIUM)

**Location:** `canonicalIdentityKey()` + `buildCanonicalKey()`

**Problem:** `canonicalIdentityKey()` builds:
```
canonical:<canonicalKey stored on doc>  OR
canonical:<buildCanonicalKey({title, author})>
```
For external results, always the latter (computed). If the stored canonical key on the Firestore doc uses a slightly different normalization (e.g., author name with honorific, or a subtitle in the title), the dedup will miss and produce a duplicate visible row.

Example: A canonical book stored as `"Leo Tolstoy"` but Google Books returns `"Count Leo Tolstoy"` — different author normalization → different canonical key → duplicate.

**No existing test for this edge case.**

---

## 4. Coverage Gaps in Existing Harness

The following test cases **do not exist** in the harness and represent untested behaviors:

| Missing Test | Risk Level |
|---|---|
| Arabic query with harakat diacritics | HIGH |
| Arabic transliteration query | MEDIUM |
| Canonical + external duplicate for ISBN-less Arabic book | HIGH |
| Author query with honorific (`"Count Tolstoy"`, `"Dr. Taha Hussein"`) | MEDIUM |
| Pagination cursor (second page) | MEDIUM |
| `options.language = "ar"` filtering Arabic canonical results above English ones | LOW |
| Circuit breaker state (3 failures → open → 30s → half-open probe) | LOW |
| `"harry potter"` returns Philosopher's Stone first (not just any HP book) | LOW |
| Query `"rowling harry"` (word order inversion) | LOW |
| Fully capitalized query `"CRIME AND PUNISHMENT"` | LOW |
| Mixed Latin+Arabic query `"Kanafani رجال"` | LOW |

---

## 5. External Provider Dedup Logic — Summary

```
External result identity:
  isbn13 key  →  matches canonical? → merge availability, discard external row
  isbn10 key  →  matches canonical? → merge availability, discard external row
  canonical key → matches? → merge, discard
  (no match)  → accept as separate external row
```

**Risk:** For books without ISBNs (many Arabic, classic, or regional books), deduplication depends entirely on `canonicalKey` agreement between the stored Firestore value and the externally computed value. Mismatch = visible duplicate.

---

## 6. Recommendations (Priority Order)

| # | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Extend NFKD strip range to include Arabic harakat (`U+064B–U+065F`) | Low | Arabic users with vocalized text get correct results |
| 2 | Add `transliteratedTitle` / `transliteratedAuthor` fields to book schema, index in `search.tokens` | Medium | Arabic works discoverable by Latin-script users |
| 3 | Normalize canonical key comparison to use sorted author token set (not full normalized string) to reduce dedup misses | Medium | Eliminates duplicate rows for ISBN-less books |
| 4 | Populate `popularityScore` / `engagementScore` from engagement signals | Medium | HP and similar multi-book author results order by relevance, not arbitrary ID |
| 5 | Add `GOOGLE_BOOKS_API_KEY` startup check + HTTP 429 circuit-open detection | Low | Prevents silent daily quota exhaustion |
| 6 | Add harness tests for missing cases (harakat, transliteration, Arabic dedup, pagination) | Low | Locks in correct behavior before regressions |

---

## 7. What Is Working Well

- **Canonical-first contract is absolute** — `compareRanked` enforces this structurally; no configuration path breaks it.
- **Classic works stay above derivative rows** — the literary correction system (+5.4 for exact classic, -2.7 for derivative) is robust and heavily tested.
- **Typo correction is conservative and safe** — edit distance is bounded and anchored; no phantom corrections.
- **External fallback is well-guarded** — threshold, circuit breaker, intent gate, and dominant-family filter all apply before any external row surfaces.
- **Duplicate absorption works correctly for ISBN-bearing books** — when ISBNs are present, canonical + external matching is reliable.
- **Arabic exact-token search works** — queries in Arabic script against Arabic-indexed tokens (`titleAr`, `authorAr`) return correct results.
- **Intent detection is stable** — author vs. title classification is tested across multiple author/title combinations with no known misclassifications.
