# Canonical Authority Audit — BookTown
**Scope:** All systems that establish, protect, or can corrupt canonical book identity: `materializeBookAuthority.ts`, `ingestBook.ts`, `canonicalIngest.ts`, `canonicalKey.ts`, `providerRoleRegistry.ts`, `bookIdentityIndex`, `authorityAuthorLock.ts`, `authorCatalog.ts`, backfill scripts, admin functions, and AI recommendation paths.

---

## 1. Overview

BookTown's canonical data model centers on a single authoritative book identity per literary work. The key invariants are:

1. **One canonical book per work** — resolved by `canonicalKey = normalize(author)::normalize(title)`
2. **Single write path** — only `materializeBookAuthority` creates or updates canonical book documents
3. **Authority hierarchy** — `manualAuthority (400) > openLibrary (300) > wikidata (200) > googleBooks (100)`
4. **Protected fields** — `title`, `author`, `authorCanonicalKey`, `publicationYear`, `canonicalEra`, `literaryForm` are locked when `canonicalLocked = true`
5. **AI must not write authoritative data** — AI suggestions are stored in `librarian_suggestions`, not in canonical book documents

---

## 2. Key Findings (High Severity First)

- **`canonicalKey` is author-title based, making it vulnerable to transliteration variants** — `buildCanonicalKey` normalizes both author and title using NFKD + diacritic strip. Arabic, Persian, and Chinese author names that have multiple valid transliterations (e.g., "Naguib Mahfouz" / "Najib Mahfuz" / "Nagib Mahfuz") produce different canonical keys and therefore different canonical book records for the same work.
- **`materializeSeedOnlyCanonicalFallback` can bypass authority checks** — this function sets `canonicalLocked: true` and `authorityStatus: "canonical"` unconditionally in `buildSeedFallbackAuthorityRawBook`, then calls `materializeBookAuthority`. It does not validate whether the requester has admin authority to assert canonical status. The callable-level auth check protects external calls, but this function is also called from admin scripts which may be invoked without strict UID validation.
- **Two write paths to the canonical book document** — `ingestBookServerSide` (callable) and `materializeSeedOnlyCanonicalFallback` (admin/script path) both call `materializeBookAuthority`, but with different parameter sets. Critically, `ingestBookServerSide` sets `createEdition: true` while `materializeSeedOnlyCanonicalFallback` sets `createEdition: false`. This means the edition layer is inconsistently populated depending on the ingestion path.
- **`resolveAcceptedAuthority` defaults to `googleBooks` for unknown sources** — in `materializeBookAuthority.ts`, `resolveAcceptedAuthority` returns `"googleBooks"` as the default for any unrecognized source. If a new ingestion source is added to the system without being registered in `PROVIDER_ROLE_REGISTRY`, it silently inherits googleBooks authority rank (100), potentially overwriting higher-authority data.
- **`applyCanonicalProtection` only protects 6 fields** — `PROTECTED_FIELDS` covers `title`, `author`, `authorCanonicalKey`, `publicationYear`, `canonicalEra`, `literaryForm`. Fields like `description`, `coverUrl`, `language`, `isbn13`, `isbn10`, `originalLanguage` are NOT protected. A lower-authority re-ingestion from Google Books can overwrite the description of a canonically locked book.
- **`book_identity_index` is not included in Firestore security rules** — the identity index collection (used for canonical deduplication lookups) is not mentioned in `firestore.rules`. It defaults to `allow read, write: if false`. This is correct for client access, but means there is no admin-read path for debugging identity collisions.
- **`goodreads_import` source can write `description` and `cover` to canonical books** — `isTrustedProviderDescriptionFillSource` returns `true` for `goodreads_import`. A Goodreads import can fill the description of a canonically locked book with user-sourced data (which Goodreads descriptions sometimes are), elevating crowd-sourced text to canonical authority.
- **Multiple `normalizeCanonicalPart` / `buildCanonicalKey` implementations** — `canonicalKey.ts` has the authoritative `buildCanonicalKey`. However, `searchEngine.ts` has an inline `canonicalIdentityKey` function that builds a similar key independently, using a different codepath. If these two functions produce different outputs for the same book, identity deduplication in search will fail to match against the canonical key stored in Firestore.
- **`authorCanonicalKey` in `materializeBookAuthority.ts` can be upgraded by non-seed sources** — `canUpgradeSeedAuthorCanonicalKey` allows upgrading the author's canonical key if the materialized key shares a root and the seed key has an "unknown" year. This upgrade path can be triggered by any source that successfully calls `materializeCanonicalAuthorInTransaction`, including `googleBooks` (authority rank 100).

---

## 3. Detailed Findings

### 3.1 Transliteration Variants Create Duplicate Canonical Records

- **Issue:** `buildCanonicalKey` is sensitive to transliteration variant choice.
- **Location:** `functions/src/library/persistence/canonicalKey.ts`, line 36
- **Why it is a problem:** "Naguib Mahfouz" and "Nagib Mahfuz" produce different canonical keys. Both can appear as `authorPart` in the canonical key, creating two separate canonical book records for the same literary work. The `mergeCitiesOfSalt.js` and `fixTier1Canonical.js` scripts in `functions/scripts/` confirm this has already occurred historically and required manual intervention.
- **Impact:** Canonical authority — duplicate canonical book records; search shows two entries for the same work.

### 3.2 `materializeSeedOnlyCanonicalFallback` Lacks Caller Authorization

- **Issue:** The function asserts `canonicalLocked: true` without verifying admin authority of the caller.
- **Location:** `functions/src/library/ingestBook.ts`, line 275
- **Why it is a problem:** This function is exported and callable from admin scripts (`insertStarterCanonicalLiteraryWorks.ts`, `backfillStarterLiteraryAuthority.ts`). If a script is run with incorrect data, it can forcibly set `canonicalLocked: true` on a book, preventing future legitimate updates. The only protection is operational (script must be run by an admin), not programmatic.
- **Impact:** Data integrity — incorrect canonical lock can freeze a book record permanently.

### 3.3 Two Creation Paths, Different Edition Semantics

- **Issue:** `createEdition: true` in `ingestBookServerSide` vs. `createEdition: false` in `materializeSeedOnlyCanonicalFallback`.
- **Location:** `functions/src/library/ingestBook.ts`, lines 723 and 287
- **Why it is a problem:** A canonical book seeded via `insertStarterCanonicalLiteraryWorks` has no edition record. When later discovered and ingested via `ingestBookServerSide` (from Google Books or Open Library), an edition IS created. The first path is source-of-truth for the canonical book; the second path creates a child edition. If the edition's provider data contradicts the canonical seed data (e.g., different publication year), there is no defined resolution protocol.
- **Impact:** Data integrity — inconsistent book → edition relationships depending on ingestion path.

### 3.4 `resolveAcceptedAuthority` Defaults to `googleBooks`

- **Issue:** Unknown sources inherit `googleBooks` authority rank.
- **Location:** `functions/src/library/materializeBookAuthority.ts`, line 1173
- **Why it is a problem:** A new provider `"hindawi"` or `"gallica"` is registered as `ebook_source_only` in `PROVIDER_ROLE_REGISTRY` (authority rank 0), but if called with source `"hindawi_v2"` (a typo or new variant), `resolveAcceptedAuthority` returns `"googleBooks"` (rank 100). This allows ebook-source-only providers to silently gain full metadata authority.
- **Impact:** Canonical authority — unregistered sources gain googleBooks-level authority for metadata writes.

### 3.5 Description and Cover Not Protected for Canonical Books

- **Issue:** `PROTECTED_FIELDS` does not include `description`, `coverUrl`, or `language`.
- **Location:** `functions/src/library/materializeBookAuthority.ts`, lines 43–50
- **Why it is a problem:** A Google Books re-ingestion of a canonically locked book can replace the canonical description with a Google Books description, even if a `manualAdmin` description (authority 100) was previously set. The `resolveMetadataField` function uses `coverAuthority` and `descriptionAuthority` scores to guard this, but only if the existing authority score is stored. For older canonical books that predate the authority scoring system, these scores may be absent, making the field vulnerable.
- **Impact:** Canonical authority — description/cover of canonical books can be overwritten by lower-authority re-ingestion.

### 3.6 Goodreads Import as Description Authority Source

- **Issue:** `goodreads_import` is listed as a trusted description fill source.
- **Location:** `functions/src/library/materializeBookAuthority.ts`, line 558
- **Why it is a problem:** Goodreads descriptions are user-sourced and may contain edition-specific content ("This Barnes & Noble edition..."), spoilers, or marketing copy. Elevating Goodreads descriptions to fill canonical book records introduces non-canonical, crowd-sourced text into authoritative records.
- **Impact:** Data quality — canonical descriptions polluted with user-sourced Goodreads content.

### 3.7 `canonicalIdentityKey` in Search Engine vs. `buildCanonicalKey`

- **Issue:** Two independent canonical key generation functions exist.
- **Location:** `functions/src/library/search/searchEngine.ts`, line 1502; `functions/src/library/persistence/canonicalKey.ts`, line 36
- **Why it is a problem:** `canonicalIdentityKey` in the search engine falls back to building a key from `result.authors[0] || result.authorEn || "unknown"` and `result.title`, using `normalizeSearchText`. `buildCanonicalKey` uses `normalizeCanonicalPart`. These two normalization functions are similar but not identical (e.g., `normalizeSearchText` has different handling of special characters). A key generated by the search engine for deduplication may not match the key stored in Firestore, causing deduplication failures.
- **Impact:** Canonical authority — search deduplication fails to match canonical records correctly.

### 3.8 Author Canonical Key Upgrade by Low-Authority Source

- **Issue:** `canUpgradeSeedAuthorCanonicalKey` upgrades the author key if the materialized key shares a root and the seed year is "unknown".
- **Location:** `functions/src/library/materializeBookAuthority.ts`, line 341
- **Why it is a problem:** `materializeCanonicalAuthorInTransaction` runs on every book materialization from any source (including `googleBooks`). If Google Books provides a birth year for an author whose canonical key currently has "unknown" year, the upgrade fires automatically, changing the author's canonical key. If the Google Books birth year is incorrect (which occurs for historical figures), the canonical author key is permanently mutated to an incorrect value.
- **Impact:** Canonical authority — author canonical keys can be incorrectly mutated by Google Books birth year data.

---

## 4. Risk Level

| Finding | Risk |
|---|---|
| Transliteration variants → duplicate canonical records | **High** |
| `resolveAcceptedAuthority` defaults to googleBooks | **High** |
| `canonicalIdentityKey` diverges from `buildCanonicalKey` | **High** |
| Goodreads as description fill source | **High** |
| Author canonical key mutated by low-authority source | **High** |
| Description/cover not in `PROTECTED_FIELDS` | **High** |
| `materializeSeedOnlyCanonicalFallback` lacks caller auth | **Medium** |
| Two creation paths — inconsistent edition semantics | **Medium** |

---

## 5. Systemic Patterns

- **Authority scores are advisory, not enforced** — the `coverAuthority`, `descriptionAuthority` scoring system is designed to prevent lower-authority overwrites, but it only works when the score is populated on existing documents. Legacy canonical books without scores are fully vulnerable to re-ingestion overwrite.
- **"canonical_seed" source is a special-cased high-authority path with no runtime auth check** — any code that can set `source: "canonical_seed"` in `materializeBookAuthority` gets `manualAuthority` (400) rank. This special-casing is not guarded programmatically; it relies on the caller being an admin script.
- **Historical normalization bugs** — the 30+ backfill/fix scripts in `functions/scripts/` (`finalCanonicalCleanup.cjs`, `fixRemainingCanonicalRows.cjs`, `repairCanonicalFingerprints.js`, `mergeCitiesOfSalt.js`) are evidence of canonical authority violations that have already occurred. Each script is a one-time fix; there is no systematic prevention of the underlying cause.

---

## 6. Hidden Risks

- **`ingestionKey` is not globally unique** — the ingestion key is `${source}:${externalId}` (e.g., `googleBooks:abc123`). If the same book is available from Google Books under two different `externalId` values (e.g., different edition IDs for the same work), two canonical records can be created for the same work with different ingestion keys.
- **`canonicalLocked` can be set to `true` on a provisional book** — the `requestedAuthorityStatus` logic in `ingestBookServerSide` checks if `rawBook.canonicalLocked === true` OR `authorityStatus === "canonical"` OR `workType === "canonical"`. A provider can set `workType: "canonical"` in the raw payload to claim canonical status without having direct authority. The `sanitizeProviderAuthorityPayload` function strips `authorCanonicalKey` but NOT `workType`.
- **`backfillReadingProgressCanonical` admin function reads all `reading_progress` documents** — this is a full collection scan. At 100,000 documents, this generates 100,000 Firestore reads in a single admin invocation.
- **`auditCanonicalAuthorityDepth.js` script** — the existence of this script implies the canonical authority depth has been audited but results are in a script output, not in a monitoring dashboard. There is no ongoing canonical drift detection in production.
