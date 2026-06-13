---
id: BT-CANON-REGISTRY-001
title: "BookTown Canon Registry"
status: active
authority_level: canon
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Canon Registry

This registry tracks current Canon documents, draft Canon documents, Canon candidates, rejected candidates, and superseded Canon records.

This registry does not promote any existing document into Canon. Candidate entries are tracking records only.

## Purpose of Canon

Canon contains only long-term platform truths that should remain stable across multiple years of BookTown evolution.

## Canon vs Vision

Vision candidates may appear here only when they express durable truth rather than directional strategy.

## Canon vs Architecture

Architecture documents may be candidate sources, but architecture details must be distilled out before promotion.

## Canon vs Governance

Governance controls promotion and demotion. This registry records Canon status.

## Canon Promotion Rules

A candidate becomes Canon only when:

1. It is reviewed under [CANON_PROMOTION_POLICY.md](CANON_PROMOTION_POLICY.md).
2. It is rewritten or distilled into Canon-safe language.
3. It receives Canon metadata.
4. It is listed under Current Canon Documents or Draft Canon Documents.
5. Master routing is updated where required.

## Canon Demotion Rules

Demoted Canon must move to Superseded Canon Documents or Archive records and must declare its replacement or demotion reason.

## Canon Authority Model

Current Canon documents listed here as active or locked outrank Vision, Master, ADR, Architecture, Product, Governance, Operations, Audits, and Archive for their declared scope.

## Canon Lifecycle

Registry statuses:

| Status | Meaning |
|---|---|
| `current` | Active or locked Canon. |
| `draft` | Draft Canon document under review. |
| `candidate` | Possible future Canon source; not authority. |
| `rejected` | Reviewed and rejected for Canon. |
| `superseded` | Former Canon replaced by another document. |

## Canon Ownership

Registry ownership belongs to `documentation-governance`.

## Canon Reading Order

For Canon status, read:

1. This registry.
2. Active or locked Canon documents listed in Current Canon Documents.
3. Draft Canon documents only for review.
4. Candidate sources only as evidence.

## Canon Registry Structure

Each registry entry must include:

| Field | Meaning |
|---|---|
| Canon ID | Stable identifier for the candidate or document. |
| Source | Source document or future document path. |
| Type | Current, draft, candidate, rejected, or superseded. |
| Status | Lifecycle status. |
| Scope | Truth area under consideration. |
| Why It May Qualify | Canon qualification rationale. |
| Why It Is Not Yet Canon | Blocking reason. |
| Required Work | Work required before promotion. |

## Current Canon Documents

| Canon ID | Source | Status | Scope |
|---|---|---|---|
| None | None | None | No product/platform truth document has been promoted to Canon yet. |

## Draft Canon Documents

| Canon ID | Source | Status | Scope |
|---|---|---|---|
| None | None | None | No draft Canon truth document exists yet. |

## Canon Candidate Registry

| Canon ID | Source | Type | Status | Scope | Why It May Qualify | Why It Is Not Yet Canon | Required Work |
|---|---|---|---|---|---|---|---|
| CANON-CANDIDATE-001 | `docs/BOOKTOWN_CANONICAL_ONTOLOGY_V2.md` | candidate | candidate | Literary ontology and canonical entity semantics | Contains durable distinctions around literary entities and manifestations. | Contains architecture-level detail that must be distilled. | Extract permanent ontology principles into Canon-safe language. |
| CANON-CANDIDATE-002 | `docs/architecture/WORK_AUTHORITY_SOURCE_LAW.md` | candidate | candidate | Work authority and source hierarchy | Defines durable authority separation for literary works. | Architecture authority document, not Canon form. | Distill source-authority principles and remove implementation detail. |
| CANON-CANDIDATE-003 | `docs/architecture/entity-platform/ENTITY_PLATFORM_VISION.md` | candidate | candidate | Entity Platform identity | Captures long-term entity platform intent. | Vision/architecture blend; not stable Canon wording. | Separate permanent entity doctrine from roadmap and architecture content. |
| CANON-CANDIDATE-004 | `docs/architecture/entity-platform/ENTITY_REGISTRY.md` | candidate | candidate | Entity vocabulary and boundaries | May contain stable entity taxonomy. | Registry is operational architecture authority. | Extract durable vocabulary only. |
| CANON-CANDIDATE-005 | `docs/architecture/search/SEARCH-ARCHITECTURE-REGISTER.md` | candidate | candidate | Search philosophy and authority order | Contains durable search decision principles. | Register contains ADRs, proposals, and evidence. | Extract only long-term search principles if needed. |
| CANON-CANDIDATE-006 | `docs/architecture/READER_AUTHORITY_AND_MANIFEST.md` | candidate | candidate | Reader authority boundaries | May contain stable truth about reader ownership and state boundaries. | Reader runtime and manifest details are implementation-specific. | Distill durable reader-state doctrine. |
| CANON-CANDIDATE-007 | `docs/architecture/Phase8AClosureRecord.md` | candidate | candidate | Projection governance principle | Encodes strong projection certification doctrine. | Closure record is completion evidence and operational status. | Extract only permanent projection governance principles. |
| CANON-CANDIDATE-008 | `docs/architecture/matchmaker/MATCHMAKER_REGISTER.md` | candidate | candidate | Derived intelligence boundaries | May define durable recommendation/intelligence boundaries. | Register contains system-specific architecture detail. | Distill platform-level intelligence doctrine. |
| CANON-CANDIDATE-009 | `docs/master/MASTER_PRODUCT_MAP.md` | candidate | candidate | Product identity and journeys | Contains synthesized product truth. | Master map changes with product maturity and surfaces. | Extract stable product identity only. |
| CANON-CANDIDATE-010 | `docs/governance/DOCS_GOVERNANCE.md` | candidate | candidate | Documentation operating doctrine | Defines durable documentation hierarchy principles. | Governance policy is process authority, not Canon truth. | Promote only if a permanent documentation doctrine is needed. |

## Rejected Canon Candidates

| Canon ID | Source | Reason |
|---|---|---|
| None | None | No candidates have been rejected yet. |

## Superseded Canon Documents

| Canon ID | Source | Superseded By | Reason |
|---|---|---|---|
| None | None | None | No Canon documents have been superseded yet. |

## Candidate Evaluation Rule

All candidates in this registry remain evidence only. They do not become Canon unless a future approved documentation change creates or promotes a Canon document and updates this registry.
