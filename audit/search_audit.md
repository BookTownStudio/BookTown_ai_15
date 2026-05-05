# Search Audit — BookTown
**Scope:** Book search pipeline (`functions/src/library/search/searchEngine.ts`, 4,123 lines), client-side reranking (`lib/books/bookSearchRanking.ts`), search indexing (`functions/src/library/search/searchIndexing.ts`), social search triggers (`functions/src/triggers/searchTriggers.ts`), normalization (`functions/src/search/normalization.ts`), and search controller (`lib/domain/search/searchController.ts`).

---

## 1. Overview

BookTown implements a multi-phase unified search pipeline:
1. **Internal Firestore search** — token-based array-contains-any queries on `books` collection with prefix fallback
2. **External fallback** — Google Books and Open Library APIs (if internal count < `EXTERNAL_FALLBACK_TRIGGER = 5`)
3. **Ranking** — server-side `computeRank` with tier, confidence, adjacency bonus, literary correction, language match, and popularity signals
4. **Client reranking** — `rerankBookSearchResults` using Orama in-browser full-text search layered on top of the backend ranking
5. **Deduplication** — server-side `canonicalIdentityKey` dedup + client-side `suppressDuplicateFlooding`

---

## 2. Key Findings (High Severity First)

- **Double-ranking creates non-deterministic ordering** — backend ranks results and assigns a `rank` field. Client then re-ranks using Orama scores on top of backend ranks. The two ranking systems use different algorithms, different normalization, and different weighting. The final order is a function of both, making the system non-auditable and non-reproducible. A book ranked #1 by backend may end up at #5 after client reranking.
- **External fallback is not deduped against canonical results** — when `EXTERNAL_FALLBACK_TRIGGER` is triggered, external provider results (Google Books, Open Library) are merged with internal canonical results. The deduplication in `suppressDuplicateFlooding` uses `bridgeKey = normalize(title)::normalize(author)::normalize(language)`. For canonical books where the canonical title differs from the provider title (e.g., provider says "Crime and Punishment: A New Translation" while canonical is "Crime and Punishment"), these produce different bridge keys, and both results appear in the final output.
- **`canonicalKey` collision risk** — the canonical key is `normalize(author)::normalize(title)`. For authors with non-Latin scripts (Arabic, Chinese), `normalizeCanonicalPart` strips all diacritics and reduces to `[a-z0-9 ]`. Two different authors with names that normalize identically (e.g., "al-Mutanabbi" and "Mutanabbi") produce the same author part, causing incorrect deduplication or identity conflicts.
- **Token limit of 80 silently drops search terms** — `resolveSearchTokens` in `searchIndexing.ts` slices to `tokens.slice(0, 80)`. A canonical book with many title aliases (e.g., a translated classic with 5 alternate titles across Arabic, English, French, German, and Chinese) can easily exceed 80 tokens. Tokens beyond position 80 are silently dropped, causing search misses on long-tail alternate titles.
- **`CONFIDENCE_THRESHOLD = 0.72` does not prevent low-quality external results from showing** — the threshold gates whether the external fallback is triggered, but once triggered, all external results are merged regardless of their individual confidence scores. An external result with confidence 0.1 can appear in the final list if the internal pool is weak.
- **Typo correction (`deriveCorrectedQueryCandidates`) branches on corrected queries but the edit distance check is applied after tokenization** — the correction runs `boundedEditDistance` on individual tokens, not the full query. For a 2-token query like "crim punisment", each token is corrected independently. The corrected tokens are then joined back into a new query candidate, but the original token ordering may not match the corrected field values, producing false query candidates.
- **Author-intent ranking applies large score adjustments (+2.4, -2.45, -2.85) through `computeLiteraryCorrection`** — these magic constants are not documented, not tested against a regression suite, and not validated against real-world query logs. A single author name search can trigger multiple contradicting adjustments simultaneously.
- **Search index for social posts (`search_feed`) uses `merge: true` on update** — `syncPostToSearchIndex` merges projection updates, meaning stale fields from a previous index version persist unless explicitly overwritten. If the projection schema changes (e.g., adding a new field), old documents in `search_feed` will have missing fields without a backfill.
- **`MAX_CORRECTED_QUERY_BRANCHES = 2`** limits typo correction to 2 alternative queries, but corrected candidates are generated from all seed texts, creating O(n) prefix computation against up to 100 canonical docs. This runs on every search request inside a Cloud Function.
- **Language filter is enforced at ranking (post-fetch) not at index query** — the `language` filter is applied via `resolveLanguageTruth` during result scoring, but the Firestore query fetches `INTERNAL_FETCH_POOL = 100` documents regardless of language. For a catalog with heavy Arabic content queried in English, 100 documents are fetched and then most are filtered out, wasting read capacity.

---

## 3. Detailed Findings

### 3.1 Double-Ranking Architecture

- **Issue:** Backend computes `rank` and `confidence`. Client then runs Orama full-text search and re-sorts.
- **Location:** `functions/src/library/search/searchEngine.ts` (rank computation); `lib/books/bookSearchRanking.ts` (client reranking)
- **Why it is a problem:** Two independent ranking systems with different normalization pipelines. The client reranks against the backend's pre-sorted result set, which means the Orama relevance score can completely invert the backend ranking. A canonically correct high-confidence result from the backend can be demoted below a low-confidence external result if Orama scores it lower.
- **Impact:** Ranking correctness — canonical books may not surface first after client reranking.

### 3.2 Canonical vs. Provider Title Bridge Key Collision Failure

- **Issue:** `buildBridgeKey` normalizes title + author + language. Provider titles often include edition information ("A New Translation", "Annotated Edition") that the canonical title strips.
- **Location:** `lib/books/bookSearchRanking.ts`, line 133–137
- **Why it is a problem:** "Crime and Punishment" (canonical) and "Crime and Punishment: A New Translation" (Google Books) generate different bridge keys. Both appear in search results. `suppressDuplicateFlooding` will not suppress the external result because the bridge keys differ.
- **Impact:** Duplicate results — external editions appear alongside canonical books for the same work.

### 3.3 `canonicalKey` for Non-Latin Authors

- **Issue:** `normalizeCanonicalPart` applies NFKD normalization + diacritic strip + non-alphanumeric removal. Arabic, Chinese, and Japanese characters survive (they are `\p{L}`), but many Arabic name variants (with/without "al-", hamza variants) normalize to the same string.
- **Location:** `functions/src/library/persistence/canonicalKey.ts`, lines 14–26
- **Why it is a problem:** `al-Mutanabbi` normalizes to `al mutanabbi`. A book ingested under `Mutanabbi` normalizes to `mutanabbi`. These are different canonical keys, creating duplicate book records for the same author when ingested from different providers.
- **Impact:** Canonical authority — duplicate author/book records; identity resolution failure for non-Latin names.

### 3.4 Token Limit Drops Alternate Titles

- **Issue:** `resolveSearchTokens` caps at 80 tokens.
- **Location:** `functions/src/library/search/searchIndexing.ts`, line 83
- **Why it is a problem:** A book with English title (3 tokens) + Arabic title (3 tokens) + 5 alternate titles averaging 4 tokens each + author name (2 tokens) = ~28 tokens in the happy path. But a heavily aliased canonical classic with 8 alternate titles and 4 author variants (common for Arabic literature) can hit 80+ tokens before all titles are indexed.
- **Impact:** Search recall — alternate titles of canonical classics are silently unsearchable.

### 3.5 External Results Not Individually Confidence-Filtered

- **Issue:** Once external fallback triggers, all external results are merged via `mergeExternalAndCanonical` without per-result confidence filtering.
- **Location:** `functions/src/library/search/searchEngine.ts` (fallback merge logic, after line 3000)
- **Why it is a problem:** A search for "Hamlet" that returns 4 internal results (below threshold of 5) will trigger the external fallback, potentially returning Google Books results for "Hamlet: A Study in Revenge" or other derivative works, which appear alongside the canonical Hamlet.
- **Impact:** Result quality — derivative and non-canonical works contaminate results when internal pool is small.

### 3.6 `EXCLUDED_TYPE_PATTERN` Not Applied to External Results

- **Issue:** The `EXCLUDED_TYPE_PATTERN` regex (`academic journal`, `thesis`, `government report`, etc.) is defined and used to filter internal canonical results, but is not applied to external provider results.
- **Location:** `functions/src/library/search/searchEngine.ts`, line 204–206
- **Why it is a problem:** Google Books returns academic papers, theses, and government reports in its catalog. These pass through the external pipeline unfiltered.
- **Impact:** Result quality — academic junk appears in external fallback results.

### 3.7 Language Filter Post-Fetch Waste

- **Issue:** Firestore query fetches 100 books, then language filtering is applied during ranking.
- **Location:** `functions/src/library/search/searchEngine.ts`, constant `INTERNAL_FETCH_POOL = 100`, line 166
- **Why it is a problem:** If a user searches with `language: 'ar'`, 100 documents are fetched, many of which may be English-language books. Only the Arabic ones pass the language filter.
- **Impact:** Performance, cost — wasted Firestore reads; 100 reads per search regardless of match rate.

### 3.8 Social Search Index Schema Drift Risk

- **Issue:** `syncPostToSearchIndex` uses `merge: true` on the `search_feed` document.
- **Location:** `functions/src/triggers/searchTriggers.ts`, line 90
- **Why it is a problem:** If a new field is added to `buildPostSearchProjection` (e.g., `mediaType`), existing documents in `search_feed` that have not been re-triggered will be missing `mediaType`. Queries filtering on `mediaType` will silently exclude all pre-existing documents.
- **Impact:** Search correctness — schema evolution breaks queries on pre-existing index documents.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| Double-ranking non-determinism | **High** |
| External results bypass deduplication | **High** |
| `canonicalKey` collision for Arabic names | **High** |
| Token limit drops alternate titles | **Medium** |
| External results not confidence-filtered | **Medium** |
| `EXCLUDED_TYPE_PATTERN` not applied externally | **Medium** |
| Language filter post-fetch waste | **Medium** |
| Social search index schema drift | **Medium** |

---

## 5. Systemic Patterns

- **Two normalization pipelines** — `normalizeSearchText` in `functions/src/search/normalization.ts` is the canonical implementation. However, `functions/src/library/search/searchEngine.ts`, `lib/books/bookSearchRanking.ts`, and `functions/src/library/ingestBook.ts` each define their own inline version. These have minor differences that compound into search ranking inconsistencies.
- **Ranking by magic constants** — the ranking system uses approximately 15 hard-coded additive/subtractive score adjustments (`+2.4`, `-2.45`, `-3.6`, `+5.4`, `-4.25`, etc.) with no documented rationale, no unit tests verifying specific query outcomes, and no A/B experiment framework.
- **No search telemetry feedback loop** — `telemetry` is returned in the search response but there is no pipeline that ingests telemetry to improve ranking over time. The system is open-loop.

---

## 6. Hidden Risks

- **Cursor-based pagination fingerprint is not stable** — the `CursorPayload` encodes `offset` and `fingerprint`. If the underlying index changes between paginated requests (e.g., a new book is ingested), the offset is invalid and results will be skipped or duplicated across pages.
- **External provider timeout at 3000 ms** — `EXTERNAL_PROVIDER_TIMEOUT_MS = 3000`. Google Books API typically responds in 200–400 ms but can spike to 5+ seconds under load. When the timeout fires, the external fallback returns 0 results, and the internal pool (which triggered the fallback precisely because it had fewer than 5 results) is returned as-is, giving a poor result set with no indication to the user.
- **Orama index is built in memory on every rerank call** — `scoreWithOrama` creates a new Orama index on every call to `rerankBookSearchResults`. For a result set of 30 items, this involves 30 document insertions into an in-memory index on every keystroke. There is no caching of the index between calls.
- **`MAX_RETURN_COUNT = 30` with `INTERNAL_FETCH_POOL = 100`** — the system fetches up to 100 documents, ranks them, then returns 30. The 70 documents that were fetched but discarded still incur Firestore read costs. At 100 reads per search × $0.06/100,000 reads, this is minor individually but scales linearly with search volume.
