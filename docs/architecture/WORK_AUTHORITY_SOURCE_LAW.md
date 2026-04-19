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
- enrichment_only: `bnf`, `britishLibrary`, `dnb`, `ndl`

Operational law:

- direct authority providers may enter canonical book write paths only after author lock
- restricted authority providers may enrich only existing canonical records through explicit field gating
- author-only authority providers may affect the author layer only
- weighted evidence providers may score evidence but may not directly create canonical work truth
- ebook source only providers may provide readable sources but may not alter work identity
- enrichment only providers may enrich later only

Future provider activation must begin by adding the provider to the registry before any ingestion, ranking, or authority write-path code changes.

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
