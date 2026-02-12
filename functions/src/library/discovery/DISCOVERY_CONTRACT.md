# BookTown Discovery Contract

**Status:** LOCKED (v1.0)  
**Applies to:** discoveryEngine.ts  
**Independent of:** Search Engine (strict separation)  
**Change Policy:** Contract-first. Breaking changes require version bump.

---

## 1. Core Principle

Discovery is **not Search**.

Discovery is a **directional, exploratory system** that proposes
paths, themes, and questions — **never results**.

Discovery does not retrieve.
Discovery does not rank books.
Discovery does not answer queries.

Discovery opens **doors**, not destinations.

---

## 2. Separation of Concerns (HARD)

Discovery and Search are **parallel systems**.

Discovery:
- ❌ MUST NOT depend on Search output
- ❌ MUST NOT reorder Search results
- ❌ MUST NOT annotate Search results
- ❌ MUST NOT post-process Search responses
- ❌ MUST NOT inject items into Search flows

Search:
- Is authoritative for retrieval
- Is authoritative for ranking
- Is authoritative for author dominance

If interaction requires Search → Discovery is **inactive**.

---

## 3. What Discovery IS

Discovery:
- Is **context-driven**, not query-driven
- Is **suggestive**, not authoritative
- Is **dismissible** by the user
- Is **non-deterministic** within strict guardrails
- Produces **exploration prompts**, not content

Examples (illustrative, not prescriptive):
- “Explore magical realism beyond Latin America”
- “You’ve paused several war memoirs — explore fiction responses to conflict”
- “Readers who annotate philosophy often explore political essays next”

---

## 4. What Discovery IS NOT (NON-NEGOTIABLE)

Discovery MUST NOT:
- Accept free-text queries
- Rank books
- Return book lists
- Return editions or works
- Compete with Search
- Masquerade as recommendation
- Function as a feed
- Claim relevance, correctness, or completeness

Violation = **contract breach**

---

## 5. Input Contract

Discovery MAY consume:
- User shelves
- Reading history
- Reading velocity
- Quotes and annotations
- Abandoned or paused books
- Language and genre preferences
- Time-based signals

Discovery MUST NOT consume:
- Raw search queries
- Search results
- External provider data
- Firestore book retrievals

---

## 6. Output Contract

Discovery returns:
