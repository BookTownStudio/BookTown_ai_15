---
id: BT-DOCS-BOOKTOWN-ENTITY-RELATIONS-AND-MANIFESTATIONS
title: "Booktown Entity Relations And Manifestations"
status: superseded
authority_level: archive
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: docs/BOOKTOWN_CANONICAL_ONTOLOGY_V2.md
ai_read: false
migrated_from: docs/booktown-entity-relations-and-manifestations.md
---

Status: Reference Only — Superseded by BOOKTOWN_CANONICAL_ONTOLOGY_V2.md
BookTown Entity Relations and Manifestations

Purpose

This document defines how canonical entities in BookTown relate to one another and how they appear across product surfaces without losing canonical authority.

It complements:
	•	docs/booktown-core-ontology.md

This file does not redefine atoms.
It defines:
	•	canonical relationships
	•	manifestation rules
	•	storage authority boundaries
	•	product behavior discipline

⸻

1. Canonical Principle

BookTown is built on a strict separation:

Core atoms are permanent.

Manifestations are situational.

Canonical entities exist independently from user activity, UI surfaces, or feature contexts.

Manifestations are temporary product expressions of canonical entities.

⸻

2. Core Atoms (Reference Layer)

Canonical root entities:
	•	Book
	•	Author
	•	Quote

Canonical collections:
/books
/authors
/quotes

These collections remain authoritative.

No manifestation may replace canonical truth.

⸻

3. Canonical Entity Relations

3.1 Book ↔ Author

Relationship type:
many-to-many

A book may contain:
	•	one author
	•	multiple authors
	•	translator
	•	editor
	•	compiler

A canonical book stores author references only.

Example:
{
  "authorIds": ["author_001", "author_002"]
}

3.2 Book ↔ Quote

Relationship type:
one-to-many

A book may contain many quotes.

A quote may belong to:
	•	one book
	•	no book

Example:
{
  "sourceBookId": "book_001"
}

Nullable allowed.

⸻

3.3 Author ↔ Quote

Relationship type:
optional

A quote may be linked to:
	•	one author
	•	no author

Because attribution may be uncertain.

Example:
Nullable allowed.

⸻

4. Quote Attribution Doctrine

Quotes differ from books and authors because attribution is not always stable.

Allowed attribution types
{
  "attributionType": "author | unknown | proverb | disputed | anonymous | traditional | attributed_later"
}

Examples
	•	unknown
	•	anonymous
	•	Indian proverb
	•	Arabic proverb
	•	disputed
	•	attributed later

Rule

Quote does not require author.
Quote does not require book.

Canonical quote identity remains valid without either.

⸻

5. Manifestations

Manifestations are product-level usages of canonical entities.

They do not become canonical entities.

Formula
Atom + User Action = Manifestation

Examples
Book + shelf = shelfItem
Book + post = postAttachment
Quote + save = savedQuote
Quote + DM = dmAttachment
Author + mention = authorAttachment

6. Manifestation Types by Product Surface

6.1 Social Post

A post may reference:
	•	book
	•	author
	•	quote

Post never becomes canonical entity.

Example:
{
  "entityType": "quote",
  "entityId": "quote_001"
}

Optional cached preview allowed.

Canonical truth remains root collection.

⸻

6.2 Direct Message Attachment

DM attachment references canonical entity only.

Example:
{
  "attachment": {
    "entityType": "quote",
    "entityId": "quote_001"
  }
}

6.3 Shelf Item

Shelf item is not book.

Shelf item is user-book relation.

Example:
{
  "userId": "user_001",
  "bookId": "book_001",
  "shelf": "want_to_read"
}

6.4 Bookmark

Bookmark is user-quote relation.

Bookmark is not quote.

Example:
{
  "userId": "user_001",
  "quoteId": "quote_001"
}

6.5 Review

Review is user expression attached to canonical atom.

Example:
{
  "bookId": "book_001",
  "userId": "user_001"
}

7. Storage Authority Rules

Canonical authority
/books
/authors
/quotes

Manifestation collections
/posts
/messages
/bookmarks
/reviews
/user_books

Rule

Manifestation collections may cache.

Canonical collections remain authority.

⸻

8. Cache Discipline

Manifestations may contain preview fields.

Example:
{
  "entityId": "quote_001",
  "textPreview": "cached preview"
}

But canonical truth remains:
quotes/quote_001

9. Identity Rule

Canonical id always remains primary identity.

Never use manifestation-local identity as authority.

Correct
{
  "quoteId": "quote_001"
}
Incorrect
{
  "quoteOwnerId": "user_001_quote_001"
}

unless explicitly legacy compatibility metadata.

⸻

10. Future Graph Readiness

Because canonical atoms remain clean, BookTown supports future graph systems.

Possible graph relations
Book → themes  
Book → moods  
Book → literary movement  
Quote → themes  
Quote → emotions  
Author → era  
Author → movement

Enables
	•	Librarian
	•	MatchMaker
	•	semantic recommendation
	•	intelligence ranking
	•	reading affinity systems

⸻

11. Tier-1 Product Rule

Manifestations may evolve.

Canonical entities must remain stable.

⸻

12. Operational Doctrine

Every future feature must answer:

Is this a canonical atom?

or

Is this a manifestation?

Before implementation begins.

If unclear:

Do not implement before ontology classification.
:::