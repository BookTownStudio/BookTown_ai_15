---
id: BT-ARCH-AUTHORS-AUTHOR-AUTHORITY-001
title: "Author Authority"
status: locked
authority_level: foundational
owner: author-platform
last_audited: 2026-06-14
source_of_truth: true
locked_at: 2026-06-14
lock_id: BT-AUTHOR-DOCTRINE-LOCK-001
supersedes: []
superseded_by: null
ai_read: true
---

# Author Authority

## Purpose

This document is the locked foundational architecture for BookTown Author authority. It defines Author identity, Author types, aliases, pseudonyms, contributors, bibliography, lifecycle, and cross-system boundaries.

Author Authority exists to ensure that literary creator identity is canonical, durable, and independent of users, provider records, display names, search results, publishing workflows, and graph projections.

This document locks doctrine only. It does not authorize runtime changes, Firestore changes, migrations, contracts, tests, Search changes, Graph changes, MatchMaker changes, or implementation work.

## Lock Status

Status: LOCKED.

Lock date: 2026-06-14.

Lock ID: BT-AUTHOR-DOCTRINE-LOCK-001.

Lock rationale: The Author Authority architecture definition passed as doctrine while runtime conformance remains incomplete. Doctrine is locked before runtime alignment begins.

Modification policy:

- Future changes to Author identity, Author types, bibliography, pseudonyms, contributor doctrine, or Author lifecycle require a new architecture decision record or replacement locked authority document.
- Runtime, publishing, search, graph, public web, MatchMaker, catalog, or entity-platform work must route through this document when touching Author authority.
- Compatibility fields may exist only as projections or evidence and must not redefine Author authority.
- Documentation that conflicts with this locked authority is superseded for Author authority questions.

## Canonical Definitions

| Concept | Locked Definition |
|---|---|
| Author | A canonical literary creator identity responsible for the intellectual authorship of one or more Works, or eligible to be linked to Works as creator authority. |
| Author Identity | The stable BookTown identity for a literary creator, independent of user accounts, provider records, display names, aliases, or search projections. |
| Author Type | The governed classification of the kind of literary creator identity represented by an Author. |
| Alias | A known alternate name for the same Author identity. |
| Display Name | The selected product-facing name used to render an Author. |
| Pseudonym | A canonical literary identity used by a Person, Collective, or Corporate entity to author Works. |
| Contributor | A person, organization, collective, or identity credited with non-authorship contribution at the Work, Edition, Manifestation, or Publication layer. |
| Bibliography | The set of Works canonically linked to an Author through governed Author-to-Work relationships. |

An Author is not a user profile, provider record, display name, alias, search result, recommendation candidate, or contributor role by default.

## Author Type System

| Type | Locked Definition |
|---|---|
| Person | A real individual literary creator. |
| Collective | A named group of creators acting as a shared literary identity. |
| Corporate | An institution, committee, agency, organization, or corporate body credited as creator. |
| Anonymous | A known intentional absence of disclosed creator identity. |
| Unknown | A creator identity not known to BookTown. |
| Disputed | A creator attribution where competing claims exist and no single canonical claim is final. |
| Attributed | A creator attribution that is traditional, provisional, or evidence-supported without absolute certainty. |

Pseudonymous is not a top-level Author type. It is an identity relationship state between a Person, Collective, or Corporate identity and one or more canonical Author identities.

## Identity Model

| Concept | Locked Rule |
|---|---|
| Identity persistence | Canonical Author identities persist independently of provider records, user accounts, display strings, search projections, public pages, or publishing workflows. |
| Identity evidence | Names, aliases, translated names, authority IDs, provider IDs, bibliography signals, profile claims, and editorial assertions may support resolution. |
| Identity resolution | Evidence resolves into one canonical Author, an unresolved Candidate, or a rejected/conflicting claim through governed Author authority. |
| Authority acceptance | Evidence becomes authority only when accepted by the Author Authority layer. |

Provider identity, user identity, aliases, display names, and fuzzy matches are evidence only. They do not create canonical Author identity by themselves.

## Pseudonym Doctrine

A pseudonym is a canonical literary identity when Works are authored under that identity.

Locked rules:

- A pseudonym is an Author when it owns Work-level authorship.
- A pseudonym is an identity.
- A pseudonym is not merely an alias.
- A pseudonymous Author may have aliases.
- One Person may have many pseudonymous Author identities.
- A pseudonymous Author may be linked to a real Person, Collective, or Corporate identity when evidence is accepted.
- Public Web must not expose a real Person behind a pseudonym unless that relationship is accepted and public.

Person and Author are not identical. A Person may correspond to zero, one, or many Author identities. An Author may represent a Person, Collective, Corporate identity, Anonymous identity, Unknown identity, Disputed attribution, Attributed claim, or pseudonymous literary identity.

## Contributor Doctrine

Author and Contributor are separate authority concepts.

| Role | Locked Definition | Authority Ownership |
|---|---|---|
| Author | Work-level creator identity. | Author Authority / Catalog. |
| Co-author | Work-level creator identity sharing authorship. | Author Authority / Catalog. |
| Editor | Edition or Publication contributor. | Edition or Publication authority. |
| Translator | Edition contributor. | Edition authority. |
| Illustrator | Edition or Publication contributor. | Edition or Publication authority. |
| Narrator | Manifestation contributor. | Manifestation authority. |
| Compiler | Edition or Publication contributor. | Edition or Publication authority. |
| Foreword Writer | Edition or Publication contributor. | Edition or Publication authority. |
| Afterword Writer | Edition or Publication contributor. | Edition or Publication authority. |
| Commentator | Edition or Publication contributor. | Edition or Publication authority. |
| Other Contributor | Typed contributor relation at the lowest accurate layer. | Owning Work, Edition, Manifestation, or Publication authority. |

A Contributor becomes an Author only when accepted as a Work-level creator.

## Bibliography Doctrine

Bibliography derives exclusively from canonical Author-to-Work relationships.

The following must not own bibliography truth:

- Display-name authority.
- Fuzzy-match authority.
- Search authority.
- Provider authority.
- Public Web authority.
- Publishing workflow authority.
- Recommendation authority.

Display-name repair may exist only as compatibility evidence. Fuzzy matching may exist only as candidate discovery evidence. Provider evidence may exist only as unresolved evidence or accepted evidence after Author Authority resolution.

## Relationship Models

### Author To Work

Author-to-Work is the canonical authorship relationship.

| Question | Locked Decision |
|---|---|
| Can a Work exist without an Author? | Yes, only through Unknown, Anonymous, Disputed, Attributed, or unresolved Candidate state. |
| Can a public canonical Work exist without Author authority? | No. It must have an Author relation, including Unknown or Anonymous when needed. |
| Can an Author exist without a Work? | Yes. |
| Can a Work have many Authors? | Yes. |
| Can an Author have many Works? | Yes. |

### Author To Edition

Author does not own Edition authority. Edition may carry contributor roles such as translator, editor, illustrator, compiler, commentator, foreword writer, and afterword writer.

Edition contributors must not be promoted into Work Authors unless accepted as Work-level creators.

### Author To Manifestation

Manifestation has no direct Author authority. A Manifestation may expose contributor metadata only through its Edition or Publication context.

The authority path is Author -> Work -> Edition -> Manifestation.

### Author To Publishing

Publishing may create Author Candidates and Author evidence. Publishing must not create canonical Author authority by itself.

| Flow | Authority |
|---|---|
| User writes or publishes under a name | Publishing evidence. |
| Publishing creates author claim | Author Candidate. |
| Catalog accepts claim | Canonical Author. |
| Published Work links to Author | Catalog / Author Authority. |
| User profile links to Author | Identity relation, not equivalence. |

Users can become Authors only through Author Authority, not by account existence or publishing side effects.

### Author To Search

Search consumes Author authority.

| Result Type | Locked Rule |
|---|---|
| Canonical Author | May be returned as authoritative. |
| Author Candidate | May be returned only when clearly unresolved. |
| Provider-only candidate | Discovery evidence only. |
| Display-name pseudo-author | Must not be treated as canonical. |
| Unknown or Anonymous Author | May be returned if represented by canonical Author type. |

Search must not define identity, merge Authors, create bibliography, or treat provider-only candidates as canonical.

### Author To Public Web

Public Web consumes Author authority.

| Author State | Public Web Rule |
|---|---|
| Canonical | May render public page. |
| Candidate | May render only if explicitly marked unresolved. |
| Unknown | May render as Unknown Author when tied to public Work. |
| Anonymous | May render as Anonymous Author. |
| Disputed or Attributed | Must expose attribution state. |
| Archived or Superseded | Must route or suppress according to lifecycle state. |

Structured data must match Author type. Public Web must not emit false Person metadata for Collective, Corporate, Anonymous, Unknown, Disputed, or Attributed identities.

### Author To Literary Graph

Literary Graph owns Author relationships beyond direct authorship.

| Concept | Owner |
|---|---|
| Author-to-Work | Author Authority / Catalog. |
| Influence | Literary Graph. |
| Movement membership | Literary Graph. |
| Tradition | Literary Graph. |
| School | Literary Graph. |
| Period | Literary Graph. |
| Contemporary, response, lineage, or affinity relationships | Literary Graph. |

Author records may expose graph summaries only as projections.

### Author To MatchMaker

MatchMaker consumes Author authority and must not create it.

| Use | Locked Rule |
|---|---|
| V1 recommendation target | Not allowed. |
| Future recommendation target | Allowed only after separate governance. |
| Evidence | Allowed when represented by canonical Author. |
| Candidate | Candidate only, not recommendation identity. |
| Provider-only Author | Not eligible. |
| Display-name Author | Not eligible. |
| Anonymous or Unknown Author | Eligible only if canonical Author entities. |

## Lifecycle

| State | Definition | Authority Rule |
|---|---|---|
| Candidate | Evidence suggests a possible Author. | Not canonical. |
| Canonical | Accepted Author identity. | May own authorship links. |
| Merged | Identity absorbed into another Author. | Must redirect to survivor. |
| Split | One Author divided into multiple identities. | Bibliography must be reassigned by authority. |
| Superseded | Replaced by stronger identity model. | May redirect or remain archival. |
| Archived | Retired from active use. | Cannot gain new authority links. |

## Merge And Split Policy

Merge is allowed only when identities represent the same canonical literary creator identity.

Split is required when one Author incorrectly combines distinct identities, pseudonyms, collectives, corporate identities, anonymous identities, or disputed attributions.

| Conflict | Locked Rule |
|---|---|
| Provider disagrees with canonical Author | Provider remains evidence. |
| Provider IDs map to multiple Authors | Automatic merge is blocked. |
| Names match but dates conflict | Authority review is required. |
| VIAF or Wikidata conflicts | High-weight evidence, not automatic truth. |
| User claim conflicts with canonical Author | User claim remains Candidate. |

## Invariant Matrix

| Invariant | Status |
|---|---|
| Author is canonical literary creator identity. | Locked. |
| User is not Author. | Locked. |
| Provider record is not Author. | Locked. |
| Alias is not Author. | Locked. |
| Display name is not Author authority. | Locked. |
| Pseudonym may be a canonical Author. | Locked. |
| Bibliography derives from canonical Author-to-Work links. | Locked. |
| Display-name repair is non-authoritative. | Locked. |
| Fuzzy matching is non-authoritative. | Locked. |
| Contributors are not Authors unless accepted as Work-level creators. | Locked. |
| Publishing creates Candidates and evidence, not canonical Authors. | Locked. |
| Search consumes Author authority. | Locked. |
| Public Web consumes Author authority. | Locked. |
| Literary Graph owns influence and relationship networks. | Locked. |
| MatchMaker does not create Author authority. | Locked. |

## Authority Matrix

| Domain | Authority Owner |
|---|---|
| Author identity | Author Authority / Catalog. |
| Author type | Author Authority. |
| Alias and translated names | Author Authority as evidence. |
| Display name | Product rendering over Author Authority. |
| Pseudonym relation | Author Authority. |
| Author-to-Work | Catalog / Author Authority. |
| Bibliography | Catalog / Author Authority. |
| Edition contributors | Edition Authority. |
| Manifestation contributors | Manifestation Authority. |
| Publishing claims | Publishing evidence only. |
| Search results | Search projection. |
| Public author pages | Public Web projection. |
| Influence, movement, tradition, school, period | Literary Graph. |
| MatchMaker use | MatchMaker consumer only. |

## Risk Matrix

| Risk | Severity |
|---|---|
| User profiles silently becoming Authors. | High. |
| Display-name bibliography becoming authority. | High. |
| Pseudonyms collapsed into aliases. | High. |
| Unknown or Anonymous Authors represented as fake people. | High. |
| Contributors promoted into Authors. | High. |
| Provider records treated as canonical. | High. |
| Public Web emits false structured data. | Medium. |
| Graph fields duplicated on Author records as authority. | Medium. |
| Search exposes unresolved candidates as canonical. | Medium. |
| MatchMaker recommends unresolved Authors. | Medium. |

## Platform Readiness Definition

Author Authority is platform-ready when:

1. Author is treated as canonical creator identity.
2. User identity, provider identity, display names, and aliases cannot become Author authority directly.
3. Author types are explicit.
4. Pseudonyms are modeled as canonical literary identities when they own Works.
5. Bibliography derives only from canonical Author-to-Work relations.
6. Contributor roles are separated from authorship.
7. Publishing creates Author Candidates only.
8. Search, Public Web, Literary Graph, and MatchMaker consume but do not define Author authority.
9. Lifecycle states support merge, split, supersede, and archive.
10. Compatibility and repair paths are explicitly non-authoritative.

## Current Runtime Conformance Status

Architecture definition: PASS.

Runtime conformance: FAIL.

This document is the foundational doctrine target for future runtime alignment. Runtime behavior that conflicts with this document is not validated by existing implementation; it is a conformance gap to be addressed by future approved work.
