# BookTown — Book Search Quality Standard
Version: 1.0  
Status: LOCKED  
Scope: Canonical Book Search Engine (V2)

---

## Definition

Top quality book search results are results that are:

- Accurate  
- Canonical  
- Deduplicated  
- Well-ranked  
- Visually complete  
- Ingestion-safe  

BookTown prioritizes **trust and precision over volume**.

---

# Core Principles

1. Canonical-first search.
2. Accuracy over quantity.
3. No duplicate canonical books.
4. No external data pollution.
5. Deterministic ranking.
6. Ingestion-safe results only.

---

# 1. Accuracy

### Requirements

- Exact ISBN match ranks highest.
- Exact title + primary author match ranks next.
- Prefix matches must be high-confidence only.
- Author disambiguation enforced.
- Series separation respected.
- No false-positive fuzzy matches.

### Not Allowed

- Mismatched author results.
- Loose fuzzy overreach.
- Wrong edition surfaced as canonical.
- Partial metadata considered authoritative.

---

# 2. Canonical Integrity

### Requirements

- Result must exist in `books` collection OR be clearly marked `external`.
- Only one canonical entry per book identity.
- Editions must always resolve to a parent canonical book.
- No temporary data persisted before ingestion.
- No external data stored without backend validation.

---

# 3. Deduplication

### Requirements

- Single canonical entry per identity.
- ISBN13 > ISBN10 > canonicalKey (normalizedTitle + primaryAuthor).
- Fuzzy title-author used only as secondary validation.
- Duplicate editions merged under canonical parent.
- Deduplication occurs at ingestion time only.

### Identity Precedence

1. ISBN13
2. ISBN10
3. NormalizedTitle + PrimaryAuthor
4. Provider:ExternalId (lowest priority)

Duplicate canonical books are never allowed.

---

# 4. Ranking Quality

### Priority Order

1. Exact ISBN match
2. Exact title + author match
3. High-confidence prefix match
4. Popularity score
5. Engagement score
6. Recent activity

### Ranking Rules

- Exact always beats fuzzy.
- Canonical always beats external.
- High confidence beats popularity.
- Deterministic ordering (stable across identical queries).
- External results never outrank strong canonical matches.

### Confidence Threshold

- Minimum fuzzy threshold: 0.72
- Below threshold: excluded from results.

---

# 5. Visual Completeness

### Requirements

- Canonical books must serve covers from internal storage.
- No external cover URLs persisted in canonical documents.
- Author name displayed correctly.
- Publication year shown if available.
- No broken cover URLs.
- Placeholder only if cover state is `PENDING` or `FAILED`.

---

# 6. Intent Alignment

### Requirements

- Results must match user input intent.
- ISBN queries return exact match only.
- Clear author queries prioritize relevant books.
- No irrelevant noise.
- No academic or technical document leakage.

---

# 7. Performance

### Requirements

- Internal canonical search target: < 200ms.
- External fallback rate-limited and bounded.
- No full collection scans.
- All searchable fields indexed.
- Search results paginated.
- Internal fetch pool may exceed visible results (e.g., fetch 100 → display 15).

---

# 8. Ingestion Readiness

### Requirements

- Result must be safe to ingest.
- Must include resolvable ISBN OR reliable title-author pair.
- No ingestion triggered during search display.
- Ingestion triggered on Book Details page load only.
- Ingestion must be idempotent.
- No partial broken metadata allowed.

---

# External Result Policy

- Allowed in search display.
- Must be clearly marked `external`.
- Must not be persisted until ingestion.
- Must not outrank strong canonical matches.
- Must pass content-type filter.
- Must never persist external cover URLs into canonical storage.

---

# Content Type Filtering

## Primary Domain: Books Only

### Prioritized Types

- Novel
- Nonfiction Book
- Short Story Collection
- Poetry Collection
- Biography
- Essay Collection
- Children Book
- Literary Classic

### Excluded Types

- Academic Journal
- Research Paper
- Conference Proceedings
- Technical Manual
- Whitepaper
- Government Report
- Thesis
- Magazine Issue

### Rules

- Filtering occurs before ranking.
- Filtering occurs before deduplication.
- Non-books are never ingested.
- External results must pass type validation.

---

# Disallowed Patterns

- Duplicate canonical books.
- Multiple editions surfaced as separate canonical books.
- External result ranked above exact canonical match.
- Broken canonical covers.
- Loosely related titles in top results.
- Non-deterministic ranking shifts.
- External data persisted without ingestion validation.

---

# Success Criteria

- User finds correct book within top 3 results for exact search.
- No duplicate canonical entries exist.
- Ingestion never corrupts data.
- Ranking is stable and predictable.
- Search results inspire trust.
- Canonical database strengthens over time.

---

# Architectural Binding

This standard is binding for:

- `/api/search/books`
- Ingestion pipeline
- Ranking logic
- Deduplication logic
- Client search adapters
- Firestore schema decisions
- Cover persistence policy

Any implementation violating this document is non-compliant.

---

END OF DOCUMENT