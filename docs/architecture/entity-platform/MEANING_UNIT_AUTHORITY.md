---
id: BT-ARCH-ENTITY-PLATFORM-MEANING-UNIT-AUTHORITY-001
title: "Meaning Unit Authority"
status: locked
authority_level: foundational
owner: meaning-unit-authority
last_audited: 2026-06-14
source_of_truth: true
locked_at: 2026-06-14
lock_id: BT-MEANING-UNIT-LOCK-001
supersedes: []
superseded_by: null
ai_read: true
---

# Meaning Unit Authority

## Purpose

This document is the locked foundational doctrine for BookTown Meaning Unit Authority. It defines meaning-bearing entity doctrine for Theme, Concept, Philosophy, and related semantic labels so Literary Graph, Search, MatchMaker, Public Web, Publishing, AI, providers, and product systems can consume literary meaning without creating canonical meaning truth.

This document locks doctrine only. It does not authorize runtime changes, Firestore changes, Functions changes, Rules changes, Index changes, Search changes, Graph changes, MatchMaker changes, migrations, backfills, schema changes, or implementation work.

## Lock Status

Status: LOCKED.

Lock date: 2026-06-14.

Lock ID: BT-MEANING-UNIT-LOCK-001.

Lock rationale: Literary Graph cannot be safely locked until BookTown defines which meaning-bearing units may become canonical graph nodes, which remain ontology evidence, and which are excluded from canonical authority. Theme and Concept are contracted target entities, but they require locked doctrine before Search, MatchMaker, Graph, Public Web, AI, or providers may treat them as canonical meaning.

Modification policy:

- Future changes to Theme, Concept, Philosophy, Idea, Motif, Symbol, Archetype, Topic, Keyword, alias, translation, near-synonym, acceptance, or anti-hallucination doctrine require a new architecture decision record or replacement locked authority document.
- Runtime, Search, Literary Graph, MatchMaker, Public Web, Publishing, Entity Platform, provider, AI, or admin work must route through this document when touching canonical meaning.
- Compatibility fields may exist only as evidence, projections, or adapters and must not redefine Meaning Unit authority.
- Documentation that conflicts with this locked authority is superseded for Meaning Unit doctrine questions.

## Meaning Unit Definition

A Meaning Unit is a stable, authority-governed semantic object that represents literary meaning across Works, Authors, Quotes, Movements, Periods, Traditions, and future literary intelligence surfaces.

A Meaning Unit may be referenced, summarized, searched, related in the Literary Graph, explained in MatchMaker, and exposed publicly only when its lifecycle and eligibility permit.

A Meaning Unit is not:

- a keyword;
- a raw tag;
- a genre string;
- a topic label;
- a provider field;
- a search query;
- an embedding cluster;
- a recommendation reason;
- an AI-generated phrase;
- a user annotation;
- a display alias;
- a graph edge.

Those objects may become evidence for a Meaning Unit candidate. They must not become canonical meaning directly.

## Theme Doctrine

Theme is canonical.

A Theme is a recurrent literary concern, tension, pattern, or field of significance expressed across one or more literary entities.

Examples:

- exile;
- justice;
- mortality;
- memory;
- alienation;
- redemption;
- power;
- identity.

Rules:

1. Theme is broader and more pattern-oriented than Concept.
2. Theme may connect Works, Quotes, Authors, Movements, Periods, Traditions, and future literary pathways.
3. A Theme must have a canonical label, aliases, translations where approved, scope note, exclusion note, provenance, and acceptance evidence before canonical status.
4. A Theme must not be created from a single model inference, single provider tag, or isolated user label.
5. Theme may become a Search target, Graph node, MatchMaker candidate, and Public Web page only after canonical acceptance and surface eligibility.

## Concept Doctrine

Concept is canonical.

A Concept is a definable intellectual or semantic unit that can be invoked, developed, challenged, contrasted, or related across literary entities.

Examples:

- absurdity;
- sovereignty;
- fate;
- selfhood;
- class consciousness;
- retributive justice;
- diaspora;
- martyrdom.

Rules:

1. Concept is more precise and definition-dependent than Theme.
2. A Concept must have a canonical label, definition, scope note, exclusion note, alias policy, translation policy, near-synonym policy, provenance, and acceptance evidence before canonical status.
3. A Concept may be linked to Themes, Works, Quotes, Authors, Movements, Periods, and future intellectual pathways.
4. Concept identity must not be inferred from raw text, embedding similarity, model output, provider metadata, or search behavior without authority acceptance.

## Theme Versus Concept

| Dimension | Theme | Concept |
|---|---|---|
| Core nature | Recurrent concern, pattern, tension, or field of significance. | Definable intellectual or semantic unit. |
| Typical scope | Broad, cross-work, often affective or narrative. | Narrower, analytical, argument-capable. |
| Example | exile | diaspora |
| Example | justice | retributive justice |
| Example | identity | selfhood |
| Canonical test | Can it recur as a meaningful literary pattern? | Can it be defined, bounded, and distinguished from near-synonyms? |

When uncertain, default to Theme for broad literary patterns and Concept for bounded intellectual units. Do not create both unless the scope distinction is explicit.

## Philosophy Doctrine

Philosophy is not promoted to a current Entity Platform type by this lock.

Philosophy is locked as ontology-only context until a future Entity Platform contract/version decision promotes it.

Rules:

1. Philosophy may appear as semantic refs, ontology context, relationship evidence, or graph context.
2. Philosophy must not be treated as a canonical `LiteraryEntityRef` entity type under the current Entity Platform vocabulary.
3. Philosophy may influence Search, Graph, and MatchMaker only through governed context, canonical relationships, or accepted future contract expansion.
4. If promoted later, Philosophy must receive its own identity, alias, translation, hierarchy, acceptance, and public exposure doctrine.

## Required Decisions

| Unit | Locked Decision |
|---|---|
| Theme | Canonical Meaning Unit. |
| Concept | Canonical Meaning Unit. |
| Philosophy | Ontology-only context for now; not promoted to Entity Platform type by this lock. |
| Idea | Not canonical as a separate type. Resolve to Concept when bounded, or Theme when pattern-like. |
| Motif | Ontology/evidence only in V1. May support Theme/Concept candidates but is not canonical. |
| Symbol | Evidence/annotation only in V1. Not canonical because symbol meaning is highly context-bound. |
| Archetype | Deferred. Possible future ontology or graph category after stricter doctrine. |
| Topic | Evidence only. Provider/topic labels are not canonical meaning. |
| Keyword | Search/projection evidence only. Never canonical meaning authority by itself. |

## Candidate Vs Canonical Model

Candidate is evidence. Canonical is accepted meaning truth.

Candidates may be proposed by:

- editorial/admin workflows;
- AI;
- providers;
- users;
- publishing workflows;
- ingestion/refinery outputs;
- search/discovery evidence;
- graph audits.

Only Meaning Unit Authority may accept canonical meaning. AI, providers, users, Search, MatchMaker, Publishing, and Literary Graph may not create canonical Meaning Units directly.

## Acceptance Policy

Canonical Meaning Unit acceptance requires:

1. Type assignment: Theme or Concept under this lock.
2. Canonical label.
3. Scope note.
4. Exclusion note.
5. Alias policy.
6. Translation policy where multilingual display or search is expected.
7. Near-synonym decision.
8. Provenance.
9. Evidence links to canonical Works, Quotes, Authors, Movements, Periods, or accepted editorial sources.
10. Human/editorial acceptance or an explicitly governed authority workflow.
11. Lifecycle state recorded as canonical by the owning authority.

Minimum evidence:

- at least two independent evidence sources, or
- one explicit editorial authority decision with provenance and scope.

Provider, AI, or user evidence may support acceptance. None may bypass it.

## Anti-Hallucination Policy

Meaning Unit Authority must prevent vague, duplicated, hallucinated, or overbroad meaning units.

Rules:

1. No canonical Meaning Unit may be created from one AI output.
2. No canonical Meaning Unit may be created from embedding similarity alone.
3. No canonical Meaning Unit may be created from a raw provider tag alone.
4. No canonical Meaning Unit may be created from user labels alone.
5. No unresolved candidate may be exposed as canonical in Search, MatchMaker, Graph, or Public Web.
6. No vague abstraction may be canonical without a scope note and exclusion note.
7. Near-synonyms must be merged into aliases unless the semantic distinction is explicit.
8. Translations must preserve meaning and provenance; they must not create separate canonical units by default.
9. Derived graph edges must be distinguishable from canonical editorial/authority relationships.
10. Recommendation, explanation, or discovery output must not become canonical meaning.

## Alias Policy

Aliases are alternate labels for the same Meaning Unit. They are not separate authority.

Alias records must distinguish:

- canonical aliases;
- editorial aliases;
- provider aliases;
- user labels;
- AI-proposed labels;
- search-only labels;
- transliterations.

Aliases may support search, display, and resolution. They must not create new Meaning Units or graph edges without acceptance.

## Translation Policy

Translations are multilingual labels for the same Meaning Unit when semantic equivalence is accepted.

Rules:

1. Translation does not create a new canonical Meaning Unit by default.
2. Translation must preserve scope, not just dictionary equivalence.
3. If a translated label carries a materially different literary meaning, create a candidate review rather than silently merging.
4. Public Web and Search may use translations only when provenance and language context are available.

## Near-Synonym Policy

Near-synonyms must be governed to avoid meaning fragmentation.

Rules:

1. Near-synonyms merge into aliases when they refer to the same scope.
2. Near-synonyms become distinct Meaning Units only when the scope distinction is explicit, stable, and useful for graph/search/intelligence.
3. Broad/narrow relationships may be graph relationships after canonical acceptance; they are not identity merges.
4. Search may match near-synonyms but must not decide canonical synonymy.
5. AI may suggest near-synonym clusters but must not canonicalize them.

## Lifecycle Model

| State | Definition | Rule |
|---|---|---|
| Candidate | Proposed meaning-bearing unit from evidence. | Not canonical; not public canonical truth. |
| Resolved | Candidate is matched to an existing Meaning Unit or accepted review path. | May be used as internal evidence only unless canonical. |
| Canonical | Accepted Theme or Concept under Meaning Unit Authority. | Eligible for graph/search/public/MatchMaker only according to eligibility rules. |
| Enriched | Aliases, translations, descriptions, examples, or relationships added. | Enrichment cannot redefine identity. |
| Merged | Candidate or unit absorbed into another Meaning Unit. | New use resolves to survivor; old label may remain alias. |
| Split | Overbroad unit divided into narrower units. | Relationships and examples must be reassigned by authority. |
| Superseded | Replaced by a stronger meaning model. | May redirect or remain archival. |
| Deprecated | Discouraged for new use but retained for compatibility. | Must not be used to create new canonical graph truth. |
| Archived | Retired from active use. | Historical/read-only unless explicitly restored. |
| Rejected | Reviewed and denied canonical status. | May remain as audit/evidence memory only. |

## Ownership Matrix

| Concern | Owner | Boundary |
|---|---|---|
| Theme identity | Meaning Unit Authority | Entity Platform supplies ref semantics. |
| Concept identity | Meaning Unit Authority | Entity Platform supplies ref semantics. |
| Philosophy context | Ontology / Literary Graph context | Not current Entity Platform type. |
| Motif, Symbol, Archetype | Ontology/evidence or future doctrine | Not canonical in V1. |
| Topic, Keyword | Provider/search evidence | Not canonical meaning. |
| Meaning Unit references | Entity Platform | Reference shape only, not meaning truth. |
| Meaning Unit relationships | Literary Graph | Edges only; cannot redefine Meaning Unit identity. |
| Search retrieval | Search Platform | Consumes meaning authority; does not create it. |
| MatchMaker reasoning | MatchMaker | Consumes meaning authority; derived output only. |
| Public exposure | Public Web plus owning authority | Exposure is projection, not truth. |
| AI proposals | AI/Agents | Candidate evidence only. |
| Provider metadata | Provider/refinery systems | Candidate evidence only. |
| User labels | Product/user systems | Candidate evidence only. |

## Search Eligibility Matrix

| Unit | Search Eligibility |
|---|---|
| Canonical Theme | Eligible as direct search target after search authority supports it. |
| Canonical Concept | Eligible as direct search target after search authority supports it. |
| Philosophy | Context-only unless promoted by future Entity Platform contract. |
| Idea | Not eligible; resolve to Theme or Concept candidate. |
| Motif | Evidence/filter/context only. |
| Symbol | Evidence/context only. |
| Archetype | Deferred. |
| Topic | Evidence only. |
| Keyword | Search matching only; not entity target. |
| Candidate Meaning Unit | Internal/admin review only; not public canonical target. |

## MatchMaker Eligibility Matrix

| Unit | MatchMaker Eligibility |
|---|---|
| Canonical Theme | Future candidate after MatchMaker authority enables Theme intelligence. |
| Canonical Concept | Future candidate after MatchMaker authority enables Concept intelligence. |
| Philosophy | Context-only unless promoted by future Entity Platform contract. |
| Idea | Not eligible as separate type. |
| Motif | Evidence only. |
| Symbol | Evidence only. |
| Archetype | Deferred. |
| Topic | Not eligible as canonical identity. |
| Keyword | Not eligible. |
| Candidate Meaning Unit | Not eligible for recommendation, discovery, pathway, or public explanation as canonical truth. |

## Public Web Eligibility Matrix

| Unit | Public Web Eligibility |
|---|---|
| Canonical Theme | Eligible after public exposure policy and canonical summary are present. |
| Canonical Concept | Eligible after public exposure policy and canonical summary are present. |
| Philosophy | Not eligible as entity page unless promoted. |
| Motif | Not V1. |
| Symbol | Not V1. |
| Archetype | Deferred. |
| Topic | No. |
| Keyword | No. |
| Candidate Meaning Unit | No public canonical page. |

## Graph Eligibility Matrix

| Unit | Graph Eligibility |
|---|---|
| Canonical Theme | Eligible as Meaning Unit graph node. |
| Canonical Concept | Eligible as Meaning Unit graph node. |
| Philosophy | Context node only unless promoted. |
| Idea | Not a graph node; resolve to Theme or Concept candidate. |
| Motif | Evidence/context only in V1. |
| Symbol | Evidence/context only in V1. |
| Archetype | Deferred. |
| Topic | No canonical graph node. |
| Keyword | No canonical graph node. |
| Candidate Meaning Unit | Candidate graph/evidence only, never canonical edge target. |

## Invariant Matrix

| Invariant | Locked Rule |
|---|---|
| Meaning authority separation | Search, MatchMaker, Graph, AI, providers, users, and Public Web do not create canonical meaning. |
| Theme canonicality | Theme is canonical only after Meaning Unit Authority acceptance. |
| Concept canonicality | Concept is canonical only after Meaning Unit Authority acceptance. |
| Philosophy boundary | Philosophy remains ontology-only context until future contract promotion. |
| Evidence boundary | Tags, topics, motifs, symbols, keywords, embeddings, and AI labels are evidence only. |
| Alias boundary | Alias does not create identity. |
| Translation boundary | Translation does not create identity by default. |
| Near-synonym boundary | Search match is not identity merge. |
| Candidate boundary | Candidate is not canonical truth. |
| Projection boundary | Public pages, search results, and recommendation explanations are projections. |
| Graph boundary | Graph edges relate accepted units; they do not define unit identity. |

## Risk Matrix

| Risk | Severity | Doctrine Control |
|---|---:|---|
| AI invents canonical meaning | High | AI may create candidates only; acceptance required. |
| Provider tags become truth | High | Provider metadata is evidence only. |
| Search creates meaning through query behavior | High | Search consumes authority; no canonicalization. |
| MatchMaker creates meaning through explanations | High | Derived output is not authority. |
| Theme and Concept overlap | High | Theme-versus-Concept doctrine and near-synonym policy. |
| Synonym fragmentation | High | Alias and near-synonym governance. |
| Overbroad concepts | High | Scope notes and exclusion notes required. |
| Translation drift | Medium | Translation provenance and semantic equivalence rule. |
| Philosophy contract mismatch | Medium | Locked as ontology-only until contract promotion. |
| Motif/Symbol ambiguity | Medium | Evidence-only V1 decision. |
| Public pages expose weak candidates | High | Public Web eligibility restricted to canonical units. |

## Platform Readiness Definition

Meaning Unit Authority is doctrine-ready when:

- Meaning Unit is defined;
- Theme and Concept are canonically defined;
- Philosophy is explicitly ontology-only until future promotion;
- Idea, Motif, Symbol, Archetype, Topic, and Keyword doctrine is settled;
- alias, translation, and near-synonym rules are explicit;
- candidate-to-canonical acceptance is explicit;
- anti-hallucination controls are explicit;
- Search, MatchMaker, Public Web, Literary Graph, AI, providers, users, Publishing, and Entity Platform boundaries are explicit.

Runtime conformance is not claimed by this lock and requires a separate audit.

## Final Lock Recommendation

Meaning Unit Authority is locked as foundational doctrine under `BT-MEANING-UNIT-LOCK-001`.

This lock establishes Theme and Concept as canonical Meaning Unit types after authority acceptance. It keeps Philosophy ontology-only until future Entity Platform contract promotion. It prevents AI, providers, users, Search, MatchMaker, Public Web, Publishing, and Literary Graph from creating canonical meaning directly.

