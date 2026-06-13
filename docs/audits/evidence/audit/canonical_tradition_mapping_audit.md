---
id: BT-AUDIT-CANONICAL-TRADITION-MAPPING-AUDIT
title: "BookTown CanonicalTradition Normalization Audit"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/canonical_tradition_mapping_audit.md
---

# BookTown CanonicalTradition Normalization Audit

## Executive Summary

The immediate cause of `Matched mappings: 0` is not a Firestore normalization failure. It is an editorial data ingestion failure in `functions/scripts/buildCanonicalTraditionMappings.ts`.

The visible editorial list is inside a TypeScript block comment at `functions/scripts/buildCanonicalTraditionMappings.ts:15-135`. The runtime input string `EDITORIAL_RAW` at `functions/scripts/buildCanonicalTraditionMappings.ts:137-139` is empty. Therefore `EDITORIAL_DATA` at `functions/scripts/buildCanonicalTraditionMappings.ts:141-154` is always an empty array, `editorialMap` is empty, `matchedEditorial` remains empty, and the generated `functions/scripts/canonicalTraditionMappings.ts:2` is correctly empty for the code that actually executed.

This is a hard root cause, not a heuristic-match problem.

Secondary blockers are also present and would surface after the empty-input bug is fixed:

- The generator emits unvalidated `Record<string, string>` traditions at `functions/scripts/buildCanonicalTraditionMappings.ts:232-237`, while the production ontology only accepts the controlled `CanonicalTradition` enum at `functions/src/library/ontology/bookOntology.ts:17-29` and validates it at `functions/src/library/ontology/bookOntology.ts:103-121`.
- The editorial list contains tradition values not accepted by the enum: `sacred_scriptural_traditions`, `ancient_near_eastern`, and `southeast_asian_classical` at `functions/scripts/buildCanonicalTraditionMappings.ts:64`, `functions/scripts/buildCanonicalTraditionMappings.ts:70`, `functions/scripts/buildCanonicalTraditionMappings.ts:80`, `functions/scripts/buildCanonicalTraditionMappings.ts:106`, and `functions/scripts/buildCanonicalTraditionMappings.ts:117`.
- Export and build scripts do not use the exact same author fallback chain. Export uses `authorNames` then `author` at `functions/scripts/exportBooksForEditorial.ts:26-29`; build uses `author`, `authorName`, then `authorNames` at `functions/scripts/buildCanonicalTraditionMappings.ts:188-194`.

## Root Cause

Root cause: editorial entries resolve to zero because no runtime editorial entries are loaded.

Verified path:

1. Editorial rows exist only in a comment block: `functions/scripts/buildCanonicalTraditionMappings.ts:15-135`.
2. Runtime source is `const EDITORIAL_RAW = \`\n\n\`;`: `functions/scripts/buildCanonicalTraditionMappings.ts:137-139`.
3. `EDITORIAL_DATA` is derived only from `EDITORIAL_RAW`: `functions/scripts/buildCanonicalTraditionMappings.ts:141-154`.
4. Empty `EDITORIAL_DATA` means the loop at `functions/scripts/buildCanonicalTraditionMappings.ts:169-173` inserts zero entries into `editorialMap`.
5. Every Firestore book lookup at `functions/scripts/buildCanonicalTraditionMappings.ts:206` returns no tradition because `editorialMap` is empty.
6. Generated output is empty: `functions/scripts/canonicalTraditionMappings.ts:2`.

Answer to the core audit question: `canonicalTraditionMappings.ts` is generated output, not the editorial authority source. The current generator treats the editable source as `EDITORIAL_RAW`, but that source is empty. The visible editorial list is inert code commentary.

## Normalization Pipeline Analysis

Firestore side:

- Title key source: `data.canonicalTitle || data.title || ""` at `functions/scripts/buildCanonicalTraditionMappings.ts:183-186`.
- Author key source: `data.author || data.authorName || authorNames[0] || ""` at `functions/scripts/buildCanonicalTraditionMappings.ts:188-194`.
- Normalized key: `${normalize(title)}::${normalize(author)}` at `functions/scripts/buildCanonicalTraditionMappings.ts:196`.

Editorial side:

- Parsed title/author/tradition from pipe-delimited rows at `functions/scripts/buildCanonicalTraditionMappings.ts:145-153`.
- Normalized key: `${normalize(entry.title)}::${normalize(entry.author)}` at `functions/scripts/buildCanonicalTraditionMappings.ts:169-170`.

Normalization function:

```ts
value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
```

This is mechanically symmetric because both Firestore and editorial sides call the same `normalize` function. The current zero-match result is not caused by asymmetry inside this function because the editorial side never receives rows.

However, this function is not a stable shared authority primitive. It is locally duplicated inside the script and is not imported from the backend normalization layer. It is also not the same API as the search/authority normalization code used elsewhere in the system. That creates drift risk.

## Editorial Parsing Analysis

The parser assumes each active row is:

```text
title | author | canonicalTradition
```

Implementation: `line.split("|").map((v) => v.trim())` at `functions/scripts/buildCanonicalTraditionMappings.ts:146-147`.

Verified parsing facts:

- No active rows exist because `EDITORIAL_RAW` is empty.
- The parser does not validate field count.
- The parser does not reject empty title, author, or tradition.
- The parser does not validate tradition values against `CanonicalTradition`.
- The parser does not detect duplicate normalized editorial keys.
- The parser does not detect duplicate Firestore matches.

The exported book list used for editorial work is produced by `functions/scripts/exportBooksForEditorial.ts`. It outputs:

```text
bookId | title | author | form
```

at `functions/scripts/exportBooksForEditorial.ts:50-53`. The builder expects:

```text
title | author | canonicalTradition
```

This means the export format and import format are not a round-trippable contract. Editorial work is currently text-mediated, manually transformed, and not schema-validated.

## Unicode/Character Handling

The local normalization uses `NFKD`, then replaces every non-letter/non-number sequence with a space.

Observed consequences:

- Accented Latin letters decompose. Combining marks are not `\p{L}` or `\p{N}`, so they become separators. For example, a fully accented string and a fully unaccented string may normalize differently in some cases because the accent can introduce an internal space rather than simply being removed.
- Apostrophes and curly apostrophes become spaces. This is deterministic for both sides if both sides carry equivalent punctuation, but it does not preserve semantic author tokens.
- Dashes, semicolons, periods, and commas become spaces. This is likely acceptable for titles such as `Moby-Dick; or, The Whale`, but it is not owned by a shared canonical-key module.
- Arabic letters are retained because `\p{L}` includes Arabic letters. Arabic diacritics/marks are not retained as letters or numbers and can be converted to spaces.

Current behavior is deterministic but not centrally governed. For production authority work, Unicode normalization must be a shared backend function with explicit tests for:

- `José` / `Jose`
- `García Márquez` / `Garcia Marquez`
- `Ngũgĩ wa Thiong’o` / `Ngugi wa Thiong'o`
- `Moby-Dick; or, The Whale`
- Arabic titles such as `السباخون`
- transliterated Arabic/Persian names with modifier marks

## Architectural Weaknesses

1. Editorial data is embedded in a script comment, not stored as executable structured authority data.

2. The runtime source `EDITORIAL_RAW` is manually maintained separately from the visible editorial list. This is the direct source of the current zero-entry failure.

3. Generated output is not schema-typed against the ontology enum. `canonicalTraditionMappings.ts` is `Record<string, string>` at `functions/scripts/canonicalTraditionMappings.ts:2`, so invalid traditions can be generated.

4. Current ontology validation will omit invalid traditions. `normalizeCanonicalTradition` returns `null` for unsupported values at `functions/src/library/ontology/bookOntology.ts:103-121`, and `buildBookOntology` only includes a valid tradition at `functions/src/library/ontology/bookOntology.ts:163-169`.

5. The export/import contract is not round-trippable. Export emits `bookId | title | author | form`; build expects `title | author | canonicalTradition`.

6. Matching by normalized title/author is weaker than matching by exported `bookId`. Since the export already includes `bookId`, the editorial authority dataset should key by `bookId` and carry title/author as review context.

7. Normalization is duplicated locally in the script. It is not using the canonical backend identity normalization modules.

8. There is no fail-fast guard for `EDITORIAL_DATA.length === 0`; the script produces a structurally valid empty output, which hides the real failure.

## Scalability Risks

Current build behavior loads the full `books` collection into memory via `db.collection("books").get()` at `functions/scripts/buildCanonicalTraditionMappings.ts:165`. This is acceptable for a small canonical corpus but not for 10k, 100k, or 1M books.

Risk profile:

- 10k books: likely operationally tolerable but still unbounded and non-resumable.
- 100k books: full collection scan and in-memory unmatched arrays become fragile and slow.
- 1M books: not production-grade. The script needs pagination, checkpoints, bounded memory, and deterministic progress logging.

The matching model also scales poorly in governance terms. Title/author matching becomes increasingly collision-prone as corpus size grows. Book ID keyed editorial authority scales cleanly because matching becomes O(1) by document ID and does not depend on name normalization.

## Recommended Structural Direction

The editorial authority layer should move from text-in-script to structured, versioned authority data.

Recommended authority structure:

```json
[
  {
    "bookId": "04ecc5cf-d220-4601-bf90-1c82d7c73dac",
    "canonicalTitle": "The Trial",
    "canonicalAuthor": "Franz Kafka",
    "canonicalTradition": "european_enlightenment_modern",
    "authoritySource": "editorial_v16",
    "schemaVersion": 1
  }
]
```

Required properties:

- `bookId` is the primary key.
- `canonicalTitle` and `canonicalAuthor` are review/audit fields, not match keys.
- `canonicalTradition` is typed against the same enum as `functions/src/library/ontology/bookOntology.ts:17-29`.
- The file is stored outside generated output, for example under `functions/data/canonicalTraditionAuthority.v1.json`.
- The generator validates every row before producing mappings.
- The persistence executor writes only through safe merge patches to `ontology.canonicalTradition`, never full document overwrites.

The editorial layer should remain backend-owned. Client/UI code should not infer or assign tradition.

## Recommended Fix Strategy

1. Replace `EDITORIAL_RAW` with a structured source file loaded from disk. Do not keep editorial authority in script comments.

2. Make the source format bookId-keyed. Use the existing export script’s `bookId` as the stable authority join key.

3. Validate input before output:

- fail if zero entries
- fail on duplicate `bookId`
- fail on missing title/author review fields
- fail on invalid `canonicalTradition`
- fail if a source row references a missing Firestore book

4. Reuse the controlled `CanonicalTradition` enum/validator from `bookOntology.ts`. The generator must not produce arbitrary `Record<string, string>` values.

5. Separate generated output from editorial input:

- input: structured JSON authority file
- generated output: TypeScript mapping artifact
- persistence execution: separate dry-run/write script with explicit counts

6. Add dry-run metrics before persistence:

- total authority rows
- valid rows
- invalid rows
- matched book IDs
- missing book IDs
- traditions by bucket
- already-up-to-date count
- would-update count

7. For 100k+ books, replace full collection scans with direct `getAll`/batched document reads by bookId from the authority file, or paginated scans only for coverage audits.

## Production Safety Verdict

Not ready for production persistence execution.

Blocking reasons:

- Runtime editorial entries are zero because the authoritative list is not loaded.
- Generated mapping output is empty and would persist nothing.
- Some visible editorial tradition labels are outside the current production enum.
- The generator has no empty-input fail-fast guard.
- The output contract is unvalidated `Record<string, string>`.
- Matching is title/author based even though the export pipeline already exposes stable `bookId`.

Safe to run:

- Read-only export/audit scripts.
- Local generator after adding fail-fast validation, but not as a persistence authority.

Not safe to run:

- Any production write that relies on current `canonicalTraditionMappings.ts`.
- Any persistence script that trusts the visible comment list or arbitrary string traditions.

## Final CTO Verdict

The canonicalTradition mapping failure is an editorial authority ingestion bug, not a Firestore data bug and not a normalization mismatch as the first-order cause.

The current script architecture is not production-grade for canonical authority persistence. The system needs a structured, versioned, bookId-keyed editorial authority dataset with strict enum validation and dry-run metrics before any write execution.

The deterministic direction is correct: no runtime inference, no fuzzy matching, no AI matching. The next production-safe step is to make editorial authority explicit data, validate it before generation, and persist only validated `ontology.canonicalTradition` values through merge-only backend scripts.
