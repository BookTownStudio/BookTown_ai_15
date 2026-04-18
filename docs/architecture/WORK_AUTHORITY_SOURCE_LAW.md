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