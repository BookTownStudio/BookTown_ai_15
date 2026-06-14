---
id: BT-ARCH-LITERARY-GRAPH-AUTHORITY-001
title: "Literary Graph Authority"
status: locked
authority_level: foundational
owner: literary-graph
last_audited: 2026-06-14
source_of_truth: true
locked_at: 2026-06-14
lock_id: BT-LITERARY-GRAPH-LOCK-001
supersedes: []
superseded_by: null
ai_read: true
---

# Literary Graph Authority

## Purpose

This document is the locked foundational doctrine for BookTown Literary Graph Authority. It defines the Literary Graph, graph nodes, graph relationships, node eligibility, relationship authority, evidence policy, lifecycle, consumer boundaries, and canonical-vs-derived relationship doctrine.

This document locks doctrine only. It does not authorize runtime changes, Firestore changes, Functions changes, Rules changes, Index changes, Search changes, MatchMaker changes, migrations, backfills, schema changes, or implementation work.

## Lock Status

Status: LOCKED.

Lock date: 2026-06-14.

Lock ID: BT-LITERARY-GRAPH-LOCK-001.

Lock rationale: WEM, Author Authority, Entity Platform, and Meaning Unit Authority now define identity and meaning-unit foundations. Literary Graph can therefore be locked as the foundational authority for literary relationships and literary-context meaning between eligible entities.

Modification policy:

- Future changes to graph node eligibility, relationship taxonomy, canonical-vs-derived relationship doctrine, evidence policy, lifecycle, or consumer boundaries require a new architecture decision record or replacement locked authority document.
- Runtime, Search, MatchMaker, Publishing, Public Web, AI, provider, graph traversal, and product work must route through this document when touching canonical literary relationships.
- Compatibility relationships, projections, search fields, recommendation explanations, and UI relationship labels may exist only as projections or evidence and must not redefine graph authority.
- Documentation that conflicts with this locked authority is superseded for Literary Graph doctrine questions.

## Definition Of Literary Graph

The Literary Graph is BookTown's canonical authority for literary relationships and literary-context meaning between eligible literary entities.

It owns:

- relationship identity;
- relationship type;
- relationship direction;
- source and target graph references;
- relationship provenance;
- confidence;
- lifecycle state;
- canonical-vs-derived status;
- relationship eligibility for Search, MatchMaker, Public Web, Discovery, Related Works, and future AI systems.

It does not own:

- Work identity;
- Edition truth;
- Manifestation truth;
- Author identity;
- Quote identity;
- Publication identity;
- Meaning Unit identity;
- user identity;
- search ranking;
- MatchMaker output;
- public page truth;
- provider truth.

## Definition Of Graph Node

A Graph Node is an eligible Entity reference participating in Literary Graph context.

A Graph Node is not a separate identity. It is an Entity Platform reference, with authority state and provenance, made graph-eligible under this doctrine.

Rules:

1. A graph node must resolve to an eligible Entity or governed ontology context.
2. A graph node must preserve entity type before entity ID interpretation.
3. A graph node must not rewrite entity identity.
4. An unresolved, deprecated, archived, or merged entity may participate only according to lifecycle and archival policy.
5. User, shelf, raw provider row, raw query, recommendation output, UI card, and public page are not graph nodes.

## Definition Of Graph Relationship

A Graph Relationship is a typed, provenance-bearing connection between two eligible graph nodes or between an eligible graph node and a governed ontology context.

A Graph Relationship must define:

- relationship ID or identity rule;
- source node;
- target node;
- relationship type;
- direction;
- canonical, derived, evidence-only, rejected, deprecated, archived, or superseded status;
- provenance;
- confidence;
- lifecycle state;
- public/search/MatchMaker eligibility.

Relationship truth is separate from entity identity. No graph relationship may merge, split, rename, canonicalize, or supersede an entity.

## Graph Ownership Matrix

| Concern | Owner | Boundary |
|---|---|---|
| Work identity | WEM / Catalog | Graph may relate Works but never defines Work truth. |
| Edition truth | WEM / Catalog | Graph may use Edition as context only where eligible. |
| Manifestation truth | WEM / Reader / Media access domains | Graph does not own access, readability, files, or acquisition. |
| Author identity | Author Authority | Graph may relate Authors but never defines creator identity. |
| Authorship | Author Authority / Catalog | Graph does not own direct Author-to-Work authorship truth. |
| Quote identity | Quote Platform | Graph may relate Quotes after quote graph maturity. |
| Publication identity | Publishing Platform | Graph may relate Publications after bridge authority. |
| Theme identity | Meaning Unit Authority | Graph may relate canonical Themes but does not create them. |
| Concept identity | Meaning Unit Authority | Graph may relate canonical Concepts but does not create them. |
| Relationship truth | Literary Graph | Graph owns relationship identity, type, direction, provenance, confidence, and lifecycle. |
| Search behavior | Search Platform | Search consumes graph truth; does not create it. |
| MatchMaker output | MatchMaker | MatchMaker consumes graph truth; does not create it. |
| Public exposure | Public Web plus owning domains | Public pages expose graph truth; they do not define it. |
| Provider metadata | Provider/refinery systems | Evidence only unless accepted through graph authority. |
| AI output | AI/Agents | Candidate evidence only; never canonical graph truth. |
| User labels/interactions | Product/Identity systems | Identity evidence or product state only; not canonical graph truth. |

## Graph Node Eligibility Matrix

| Entity Or Object | Graph Node Eligibility | Decision |
|---|---|---|
| Work | Eligible | Primary current graph node. |
| Author | Eligible | Non-authorship literary relationships only. |
| Quote | Eligible after quote graph maturity | Current quote identity is canonical, graph integration remains bounded. |
| Publication | Eligible after publication bridge maturity | Must not be treated as Work. |
| Theme | Eligible after Meaning Unit acceptance | Canonical Theme only. |
| Concept | Eligible after Meaning Unit acceptance | Canonical Concept only. |
| Movement | Eligible | Emerging context node. |
| Period | Eligible | Emerging context node. |
| Place | Deferred | Literary Place only after authority; venue is not sufficient. |
| Tradition | Governed ontology/context node | May participate as graph context; Entity Platform promotion requires future versioning. |
| Philosophy | Ontology-only context | Not current Entity Platform type; graph context only unless promoted. |
| Civilization | Governed ontology/context node | Context node until contract promotion. |
| Character | Deferred | Future only. |
| Edition | Limited | Material context; not primary literary meaning node by default. |
| Manifestation | No | Access/rendering truth, not literary graph node. |
| Shelf | No | Product/user collection. |
| Venue | No by default | Product place, not Literary Place. |
| User | No | User connects through Identity Graph, not Literary Graph node identity. |
| Search query | No | Intent/projection only. |
| Recommendation output | No | Derived output only. |
| AI/provider label | No | Evidence only. |

## Canonical Vs Derived Relationship Doctrine

Canonical relationships are accepted relationship truth. Derived relationships are computed or inferred from accepted data. Evidence-only relationships are candidates or signals. Projections display relationships but do not own them.

| Class | Definition | May Feed Search | May Feed MatchMaker | May Be Public |
|---|---|---:|---:|---:|
| Canonical | Accepted by Literary Graph Authority with provenance. | Yes | Yes | Yes, if exposure policy allows. |
| Derived | Computed from canonical/accepted fields or graph traversal. | Yes, marked derived | Yes, marked derived | Limited, marked derived. |
| Evidence-only | Provider, AI, user, search, publishing, or editorial candidate evidence. | Internal/admin only | No canonical use | No canonical public use. |
| Projection | Display/search/summary/read model over graph truth. | Display/ranking only | Context only | Display only. |
| Rejected | Reviewed and denied. | No | No | No. |

Derived relationships must always preserve derivation source. They must not be silently promoted to canonical truth.

## Relationship Taxonomy

| Relationship | Canonical Status | Direction | Doctrine |
|---|---|---|---|
| Influence | Canonical when accepted | Directional | One entity materially shapes another. |
| Response | Canonical when accepted | Directional | One entity replies to, revises, contests, extends, or reinterprets another. |
| Lineage | Canonical when accepted | Directional or ordered | A durable literary descent, school, inheritance, or tradition path. |
| Tradition membership | Canonical when accepted; derived when from Work ontology only | Usually directed entity -> tradition | Membership in a literary tradition. |
| Movement membership | Canonical when accepted; derived when from semantic refs only | Usually directed entity -> movement | Membership or strong affiliation with a movement. |
| Period membership | Canonical when accepted; derived when from date/period refs only | Usually directed entity -> period | Historical/literary period placement. |
| Civilization context | Contextual canonical or derived | Usually directed entity -> civilization | Civilizational or cultural context; not identity. |
| Theme relationship | Canonical when accepted | Directed or undirected by type | Entity expresses, develops, contrasts, or transforms a canonical Theme. |
| Concept relationship | Canonical when accepted | Directed or undirected by type | Entity invokes, develops, contests, or exemplifies a canonical Concept. |
| Philosophical relationship | Contextual; canonical only when type/evidence accepted | Directed or undirected by type | Philosophical context or relation; Philosophy remains ontology-only unless promoted. |
| Historical relationship | Canonical when accepted | Directed or undirected by type | Historical contextual relation between entities. |
| Affinity relationship | Derived intelligence only by default | Undirected or scored | Similarity/resonance/proximity; not canonical unless separately accepted as a typed graph relationship. |
| Same form/subform | Derived only | Undirected | Projection from WEM/ontology classification. |
| Similar theme | Derived or evidence-only unless accepted | Undirected | Must not become canonical from similarity alone. |
| Search co-click/co-query | Never canonical | N/A | Behavioral signal only. |
| Recommendation adjacency | Never canonical | N/A | MatchMaker output only. |
| User preference affinity | Never canonical literary graph truth | N/A | Identity/Affinity layer only. |

## Required Relationship Decisions

| Relationship Category | Decision |
|---|---|
| Canonical relationships | Influence, response, lineage, accepted tradition/movement/period membership, accepted theme/concept relationships, accepted historical relationships. |
| Derived relationships | Same form, same subform, ontology-derived same tradition/movement/period, bounded traversal proximity, computed affinity, similarity labels. |
| Evidence-only relationships | Provider tags, AI suggestions, user labels, search behavior, publishing claims, unreviewed refinery output. |
| Never canonical relationships | Raw search co-query, raw co-click, recommendation output, popularity, user preference, shelf co-membership, social engagement, UI grouping. |

## Evidence Policy

Canonical relationship acceptance requires:

1. eligible source node;
2. eligible target node;
3. relationship type;
4. direction when required;
5. provenance;
6. confidence;
7. evidence description or source reference;
8. lifecycle state;
9. authority acceptance.

Evidence may come from editorial decisions, accepted ontology, authoritative scholarship, provider/refinery proposals, AI proposals, publishing evidence, user annotations, or runtime observations.

Only Literary Graph Authority may accept relationship truth. AI, providers, users, Search, MatchMaker, Public Web, Publishing, and product surfaces may create evidence or candidates only.

## Lifecycle Model

| State | Definition | Rule |
|---|---|---|
| Candidate | Proposed relationship from evidence. | Not canonical; internal/review only. |
| Accepted | Relationship accepted as graph truth. | May be canonical or derived depending on source. |
| Canonical | Accepted relationship with graph authority provenance. | Eligible for consumers according to policy. |
| Derived | Computed from accepted data or deterministic rules. | Must be marked derived. |
| Evidence-only | Signal that may support future acceptance. | No canonical consumer use. |
| Rejected | Reviewed and denied. | Must not be surfaced as graph truth. |
| Deprecated | Retained for compatibility but no new use. | Prefer current relationship. |
| Superseded | Replaced by stronger relationship model. | Redirect or preserve as history. |
| Archived | Retired but historically readable. | Not active discovery by default. |

## Public Exposure Policy

Public Web may expose graph relationships only when:

- source and target nodes are public-safe;
- relationship is canonical or explicitly marked derived;
- provenance/confidence display policy is satisfied;
- owning entity domains allow exposure;
- no privacy, pseudonym, rights, moderation, or attribution boundary is violated.

Public Web must not expose candidate, evidence-only, rejected, private, unresolved, or user-derived graph relationships as canonical truth.

## Search Consumption Policy

Search consumes Literary Graph authority for retrieval, ranking, filtering, explanation, and semantic navigation.

Search may:

- use canonical graph relationships;
- use derived graph relationships when marked derived;
- use evidence-only relationships only for internal/admin review or explicitly non-canonical diagnostics;
- expose relationship context in search results when safe.

Search must not:

- create canonical graph relationships;
- promote query behavior into graph truth;
- merge graph nodes;
- invent Themes, Concepts, influences, lineages, or affinities;
- treat ranking as relationship authority.

## MatchMaker Consumption Policy

MatchMaker consumes Literary Graph authority through bounded, provenance-aware snapshots and traversals.

MatchMaker may:

- consume canonical graph relationships;
- consume derived graph relationships when marked derived;
- use graph proximity as context;
- explain recommendations or pathways using graph evidence.

MatchMaker must not:

- create canonical graph truth;
- create canonical Meaning Units;
- promote recommendation output into relationships;
- treat confidence as enjoyment prediction;
- mutate graph, entity, meaning, author, WEM, or user truth.

## Publishing Boundary

Publishing may create graph evidence or candidates through publication metadata, author claims, Work links, citations, references, or editorial assertions.

Publishing must not create canonical graph relationships directly. Publication-to-Work, Publication-to-Author, or Publication-to-Meaning relationships require the owning authority path before canonical graph use.

## WEM Boundary

WEM owns Work, Edition, and Manifestation truth. Literary Graph may relate Works and limited Edition context but must not redefine Work identity, Edition material truth, primary Edition, Manifestation access, readability, acquisition, files, or provider arbitration.

Work ontology may support derived graph relationships. It does not automatically create canonical relationship truth.

## Author Boundary

Author Authority owns Author identity, pseudonym doctrine, aliases, and authorship/bibliography. Literary Graph owns non-authorship literary relationships involving Authors, including influence, response, lineage, movement membership, period context, school/tradition context, theme relationships, and concept relationships.

Author records may expose graph summaries only as projections.

## Entity Platform Boundary

Entity Platform defines entity refs, summaries, authority states, and lifecycle language. Literary Graph consumes graph-eligible Entity refs. Literary Graph does not define entity identity or override Entity Platform lifecycle semantics.

## Meaning Unit Boundary

Meaning Unit Authority owns Theme and Concept identity and keeps Philosophy ontology-only until future promotion. Literary Graph may relate canonical Themes and Concepts and may use Philosophy as ontology context. Literary Graph must not create Theme, Concept, Philosophy, Idea, Motif, Symbol, Archetype, Topic, or Keyword truth.

## Invariant Matrix

| Invariant | Locked Rule |
|---|---|
| Relationship authority | Literary Graph owns canonical literary relationship truth. |
| Identity separation | Graph relationships never redefine entity identity. |
| WEM separation | Graph does not own Work, Edition, or Manifestation truth. |
| Author separation | Graph does not own Author identity or authorship. |
| Meaning separation | Graph does not own Theme or Concept identity. |
| Search separation | Search consumes graph truth but cannot create it. |
| MatchMaker separation | MatchMaker consumes graph truth but cannot create it. |
| Evidence separation | AI/provider/user/search/publishing evidence is not graph truth. |
| Derived marking | Derived relationships must be marked derived. |
| Projection safety | UI, public pages, summaries, and search results are projections. |
| User boundary | User preference and behavior are Identity Graph/Affinity signals, not Literary Graph truth. |
| Node eligibility | Only eligible entities or governed ontology contexts may be graph nodes. |

## Risk Matrix

| Risk | Severity | Doctrine Control |
|---|---:|---|
| Search creates graph truth through ranking | High | Search consumption policy. |
| MatchMaker output becomes canonical relationship | High | MatchMaker consumption policy. |
| Derived relationships become silent canonical truth | High | Derived marking invariant. |
| Graph rewrites Work or Author identity | High | WEM and Author boundaries. |
| Meaning Units are invented by graph edges | High | Meaning Unit boundary. |
| Provider/refinery suggestions become accepted edges | High | Evidence policy and candidate lifecycle. |
| User preference becomes literary truth | High | Identity/Affinity boundary. |
| Public Web exposes candidate edges | High | Public exposure policy. |
| Philosophy/Civilization/Tradition contract mismatch | Medium | Governed ontology context until future promotion. |
| Publication links treated as Work truth | Medium | Publishing and WEM boundaries. |
| Character prematurely becomes node | Medium | Deferred node eligibility. |

## Platform Readiness Definition

Literary Graph is doctrine-ready when:

- Literary Graph is defined;
- Graph Node and Graph Relationship are defined;
- node eligibility is explicit;
- canonical, derived, evidence-only, projection, rejected, deprecated, superseded, and archived relationship states are explicit;
- relationship taxonomy covers influence, response, lineage, tradition membership, movement membership, period membership, civilization context, theme, concept, philosophical, historical, and affinity relationships;
- Search and MatchMaker are consumers only;
- WEM, Author, Entity Platform, Meaning Unit, Publishing, and Public Web boundaries are explicit;
- evidence and lifecycle rules prevent AI/provider/user/projection drift into canonical truth.

Runtime conformance is not claimed by this lock and requires a separate audit.

## Final Lock Recommendation

Literary Graph Authority is locked as foundational doctrine under `BT-LITERARY-GRAPH-LOCK-001`.

This lock establishes Literary Graph as BookTown's authority for literary relationships and literary-context meaning between eligible entities. It explicitly prevents the graph from owning Work identity, Author identity, Edition truth, Manifestation truth, Meaning Unit identity, Search truth, MatchMaker output, or public page authority.

