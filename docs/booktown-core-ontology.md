BookTown Tier-1 Ontology (Core Atoms)

Core Principle

BookTown separates core atoms (canonical literary truth) from manifestations (UI surfaces and interaction containers).

Core atoms must remain stable even if app surfaces evolve.

⸻

Core Atoms

1. Book

Canonical literary work entity.

Tier-1 Rules
	•	Book is a canonical literary object.
	•	Book requires canonical authorship.
	•	Book can exist independently of DM, posts, shelves, or profile surfaces.
	•	Book is the canonical source for extracted literary content.

Canonical Relations
	•	Book ↔ Author
	•	Book → Quote

Book Truth

A book always has canonical author anchoring.

⸻

2. Author

Canonical creator identity.

Tier-1 Rules
	•	Author is a canonical identity entity.
	•	Author owns authored books.
	•	Author can exist independently of individual books through profile identity.

Canonical Relations
	•	Author ↔ Book
	•	Author ↔ Quote (optional for quote attribution)

Author Truth

Author identity is stronger than UI profile projection.
Profile is only one manifestation of Author.

⸻

3. Quote

Canonical literary atom.

Tier-1 Rules
	•	Quote is not decoration.
	•	Quote is a first-class canonical entity.
	•	Quote can exist independently of DM, posts, reader highlights, and feed surfaces.
	•	Quote may have flexible attribution.

Canonical Relations
	•	Quote → Book (optional)
	•	Quote → Author (optional)
	•	Attribution always required

⸻

Quote Ontology

Quote Structure

quote {
  quoteId
  text

  originType
  attributionType

  authorId?
  bookId?

  attributionLabel?

  sourceChapterId?
  sourceOffset?
}


⸻

Quote Origin Types

extracted

Quote selected from canonical book or publication.

Required
	•	bookId
	•	usually authorId

⸻

authored

Standalone authored quote created directly by an author.

Required
	•	authorId

⸻

standalone

Canonical quote entered without source book.

⸻

traditional

Civilizational / oral quote.

Example:
	•	Indian Proverb

⸻

Quote Attribution Types

canonical_author

Canonical linked author.

unknown

Anonymous attribution.

proverb

Civilizational source.

disputed

Uncertain authorship.

attributed

Soft attribution.

Example:
	•	Attributed to Rumi

⸻

Attribution Rule

Every quote must always have:
	•	authorId
OR
	•	attributionLabel

Never neither.

⸻

Core Atoms vs Manifestations

Core atoms = truth layer
	•	Book
	•	Author
	•	Quote

Manifestations = usage layer
	•	DM
	•	Post
	•	Profile
	•	Shelf
	•	Reader highlight

Manifestations reference atoms.
They do not redefine atoms.

⸻

Manifestation Rule

Correct attachment model:

attachment {
  type: quote
  entityId: quoteId
}

Not copied quote text as identity.

⸻

Derived Canonical Entities (Not Core Atoms)

Publication

Derived publishing entity.

Review

Derived evaluative entity.

These depend on atoms but are not atoms themselves.

⸻

Tier-1 Platform Law

Atoms are stable forever.

Manifestations may evolve freely.

This protects BookTown ontology from UI drift.

⸻

Canonical Triangle

Book ↔ Author
Book → Quote
Quote → Author (optional)

Quote remains attribution-flexible.

⸻

Tier-1 Locked Conclusion

Book, Author, and Quote are the canonical literary atoms of BookTown.