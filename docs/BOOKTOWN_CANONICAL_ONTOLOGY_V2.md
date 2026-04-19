# BookTown Canonical Ontology V2
Status: LOCKED
Authority Level: Tier-1 Canonical Architecture

---

# Core Principle

BookTown separates:

- intellectual truth
- material publishing truth
- user manifestations

Canonical truth must remain stable even if product surfaces evolve.

---

# Canonical Authority Layers

## Layer 1 — Core Atoms

Stable literary truth.

Core atoms:

- Work
- Author
- Quote

---

## Layer 2 — Canonical Derived Authority

Stable material bibliographic truth.

Derived canonical entity:

- Edition

---

## Layer 3 — Manifestations

User interaction surfaces.

Examples:

- shelfItem
- review
- bookmark
- postAttachment
- dmAttachment

Manifestations reference canonical entities.
They never redefine canonical truth.

---

# 1. Work

Canonical intellectual entity.

Definition:

A Work is the abstract literary creation itself.

A Work is not readable directly.
A Work is not ownable physically.

A Work exists independently of editions.

---

## Work holds only long-life truth

Allowed fields:

- canonicalTitle
- originalTitle
- canonicalAuthorIds
- originalLanguage
- workIdentity
- literaryType
- abstractDescription
- canonicalRelations

Not allowed:

- ISBN
- provider ids
- file links
- acquisition state
- cover authority

---

## Work truth

One Work may own many editions.

Work identity may only be reused or merged after universal author lock passes.

Hard identifiers such as provider work ids, provider edition/work ids, ISBN fallback, alias reuse, and originalTitle reuse are evidence only until author equivalence is confirmed.

Every future provider must enter through the central provider role registry before it may affect any canonical work flow.

Library of Congress is the first active restricted authority provider: it may enrich existing canonical records with field-gated bibliographic evidence, but it may not create or override canonical work identity.

---

# 2. Edition

Canonical material manifestation of a Work.

Definition:

An Edition is one concrete publishing realization of a Work.

Even first publication is an Edition.

---

## Edition holds material truth

Allowed fields:

- ISBN10
- ISBN13
- publisher
- publicationYear
- format
- translationLanguage
- editionTitle
- providerEvidence
- cover
- fileCapability

---

## Edition truth

One Work may own multiple editions.

Editions do not redefine Work identity.

---

# 3. Author

Canonical creator identity.

Definition:

Author is a stable identity independent of profile manifestations.

---

## Author relations

- Work ↔ Author

Optional edition-level contributor roles:

- translator
- editor
- compiler

These belong to Edition, not Work.

---

# 4. Quote

Canonical literary atom.

Definition:

Quote is first-class canonical literary content.

---

## Quote relations

Primary relation:

- Quote → Work

Optional precision:

- Quote → Edition

Optional attribution:

- Quote → Author

---

## Attribution rule

Every quote must have:

- authorId
OR
- attributionLabel

Never neither.

---

# 5. Manifestations

Formula:

Canonical Entity + User Action = Manifestation

Examples:

- Work + shelf = shelfItem
- Quote + save = savedQuote
- Work + review = review
- Quote + post = postAttachment

---

## Manifestation rule

Manifestations may cache previews.

Canonical truth remains authority.

---

# 6. Transaction Rule

Users transact through Editions only.

Users never transact directly through Works.

Examples:

- read EPUB
- open PDF
- buy physical copy
- referral link
- offline copy

All belong to Edition capability.

---

# 7. Search Rule

Search resolves:

Work first

Then selects:

preferred display edition

Search must never flatten Work and Edition into one truth layer.

---

# 8. Review Rule

Reviews strengthen Work authority first.

Edition-specific context may remain attached secondarily.

This prevents review fragmentation.

---

# 9. Derivative Boundary Rule

## Same Work:

- translation
- reprint
- cover change
- publisher change

## New Work:

- abridgement
- adaptation
- transformed content
- major reinterpretation

---

# 10. Canonical Stability Law

Core atoms remain stable.

Derived canonical entities evolve carefully.

Manifestations evolve freely.

---

# Locked Conclusion

BookTown canonical authority is:

Work → Edition → Manifestation

with Author and Quote as stable literary atoms.

This ontology governs all future schema, ingestion, search, AI, and graph evolution.
