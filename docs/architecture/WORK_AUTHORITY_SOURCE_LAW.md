---
id: BT-DOCS-ARCHITECTURE-WORK-AUTHORITY-SOURCE-LAW
title: "WORK AUTHORITY SOURCE LAW"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
canon_candidate: true
---

# WORK AUTHORITY SOURCE LAW

## Purpose

This document defines how BookTown determines canonical Work truth.

A Work is the canonical intellectual creation itself — independent of language, edition, publisher, format, ISBN, cover, or file — representing one literary identity that all translations, editions, and readable manifestations belong to.

BookTown must never allow external providers to directly define canonical truth without authority evaluation.

---

## Source Roles

### Open Library

Open Library is the primary bibliographic Work bootstrap source.

It may provide:

- work identifier
- title candidates
- author candidates
- edition relationships
- language metadata
- aliases when available

Open Library proposes Work shells but does not automatically lock canonical truth.

### Wikidata

Wikidata is the multilingual and semantic enrichment source.

It may provide:

- multilingual titles
- original language
- author external identities
- literary classifications
- cultural significance links

Wikidata enriches Work understanding but does not create canonical Work identity alone.

### BookTown

BookTown is the final authority.

Only BookTown may accept, lock, reject, or revise canonical Work truth.

No provider has overwrite authority.

---

## Canonical Locked Fields

The following fields are canonical and protected once accepted:

- canonicalTitle
- canonicalAuthor
- originalLanguage
- workIdentity
- canonicalKey

These fields may not be automatically replaced by later ingestion.

Any change requires stronger authority evidence and explicit acceptance.

---

## Allowed Enrichment Fields

The following fields may be enriched after canonical acceptance:

- aliases
- alternateTitles
- externalIds
- subjects
- summaries
- editionLinks
- languageVariants
- culturalMetadata

Enrichment may add information but must not silently alter canonical identity.

---

## Final Authority Rule

Open Library may propose Work identity.

Wikidata may expand multilingual intelligence.

BookTown alone decides canonical truth.

Every canonical field must preserve authority evidence including:

- source
- confidence
- acceptedAuthority
- locked state

No ingestion may overwrite locked canonical fields automatically.

Book documents may also carry internal provenance memory under `provenance.fieldConfidence`.

This ledger is invisible operational memory only: it records why the current surviving book-layer field value holds, which provider currently anchors it, and which weaker providers support the same value.

The ledger does not change ranking, authority choice, merge behavior, or read paths.

---

## Universal Author Lock

Universal author lock is permanent production law.

No hard identity signal may reuse, merge, attach, or collapse a Work unless author equivalence survives first.

Hard signals covered by this law:

- provider work identifiers
- provider edition/work identifiers
- manual ISBN fallback
- alias-driven reuse
- originalTitle translation reuse
- duplicate merge
- existing canonical survivor reuse

Author equivalence rules:

- use exact canonical author id overlap when both sides have canonical author ids
- otherwise require exact normalized author-name overlap
- never accept fuzzy-only author similarity

If author lock fails:

- reject the hard signal
- do not overwrite the existing identity mapping
- continue through deterministic survivor scoring or provisional creation

---

## Provider Role Registry

Provider legal role is centrally declared in the provider role registry.

No provider may influence work authority until it is registered there.

Current registered roles:

- direct_authority: `openLibrary`, `googleBooks`
- restricted_authority: `loc`
- author_only_authority: `viaf`
- weighted_evidence: `wikidata`, `worldcat`, `isbndb`
- ebook_source_only: `gutenberg`, `gallica`, `hindawi`, `internetArchive`
- enrichment_only: `booktownRefinery`, `bnf`, `britishLibrary`, `dnb`, `ndl`

Operational law:

- direct authority providers may enter canonical book write paths only after author lock
- restricted authority providers may enrich only existing canonical records through explicit field gating
- author-only authority providers may affect the author layer only
- weighted evidence providers may enrich only existing canonical records through explicit field gating and may not directly create canonical work truth
- ebook source only providers may provide readable sources but may not alter work identity
- enrichment only providers may enrich later only

Future provider activation must begin by adding the provider to the registry before any ingestion, ranking, or authority write-path code changes.

### BookTown Refinery Enrichment Law

`booktownRefinery` represents governed output from the external local `booktown-canonical-factory`.

Initial role:

- enrichment only
- no direct Firestore writes
- no canonical book creation
- no canonical identity merge
- no `book_identity` writes
- no `editions` writes
- no cover job ownership
- no canonical lock override
- no `canonicalFieldTrust` mutation

Refinery artifacts may propose only subordinate intelligence fields:

- `ontology.form`
- `ontology.subForm`
- `ontology.canonicalTradition`
- `literaryQuality`
- `canonicalPotential`
- semantic metadata
- embedding descriptors or vector references

The refinery never owns:

- `canonicalTitle`
- `canonicalAuthorIds`
- `canonicalKey`
- `originalLanguage`
- `workIdentity`
- author identity
- edition identity
- readable-source availability

Accepted refinery output must be evaluated by backend authority code and routed through the canonical materialization layer. The refinery is an upstream evidence provider, not a database writer and not a parallel book system.

Future vector integration must store embeddings as derived semantic infrastructure with pointer-style references from governed catalog records. Vector indexes must never become canonical book authority, and vector similarity must not rewrite identity, locks, provenance, or materialized search projection fields.

### LOC Restricted Authority Law

`loc` is the first active restricted authority provider.

LOC may enrich only an already-resolved canonical book after author lock passes.

LOC may currently add only:

- `originalTitle`
- `locControlNumber`
- `publicationYear` when the current value is missing
- `publisher` when the linked edition value is missing
- `language` evidence when the current value is missing or placeholder

LOC may not:

- create a canonical work
- reuse or attach by provider work id
- override ISBN-based identity
- trigger duplicate merge
- override author identity
- escalate canonical lock authority

Subject headings remain deferred until there is a dedicated safe landing field.

### WorldCat Weighted Book Evidence Law

`worldcat` is the first active weighted book evidence provider.

WorldCat may enrich only an already-resolved canonical book after author lock passes.

WorldCat may currently add only:

- `oclcNumber`
- edition count support when the current value is missing
- `publicationYear` when the current value is missing
- `publisher` when the linked edition value is missing or placeholder
- `language` evidence when the current value is missing or placeholder
- `format` evidence when the linked edition value is missing or placeholder

WorldCat evidence must remain subordinate to direct authority and restricted authority.

WorldCat may not:

- create a canonical work
- trigger duplicate merge
- reuse or attach by provider work id
- override ISBN-based identity
- override author identity
- escalate canonical lock authority
- enter survivor logic as hard truth

### VIAF Author Authority Law

`viaf` is the first active author-only authority provider.

VIAF may enter only through canonical author materialization.

VIAF may currently add only:

- `viafId`
- canonical author aliases
- normalized multilingual author names when existing values are missing
- `birthYear` when the current value is missing
- `deathYear` when the current value is missing
- authority confidence support for the author record

VIAF may not:

- create or modify books
- create or modify works
- create editions
- enter book survivor logic
- trigger duplicate merge on books
- override canonical work identity
- override an existing stronger canonical author name

VIAF attachment must fail when exact normalized author-name equivalence does not survive.

### Wikidata Weighted Author Evidence Law

`wikidata` is active on the author layer only as weighted evidence.

Wikidata may currently add only:

- `wikidataQid`
- additional author aliases
- multilingual author names when the canonical field is missing
- `birthYear` when the current value is missing and non-conflicting
- `deathYear` when the current value is missing and non-conflicting
- weighted authority-confidence provenance
- safe external authority links already supported by the author record

Wikidata may not:

- create a canonical author by itself
- trigger cross-author merge
- override VIAF-backed author truth
- override an existing stronger canonical author name
- enter book or work survivor logic
- create or modify books, works, or editions

Wikidata attachment must fail when exact normalized author-name equivalence does not survive.
