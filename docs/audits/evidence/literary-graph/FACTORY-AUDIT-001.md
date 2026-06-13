---
id: BT-DOCS-ARCHITECTURE-LITERARY-GRAPH-FACTORY-AUDIT-001
title: FACTORY-AUDIT-001
status: locked
authority_level: audit
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: docs/architecture/literary-graph/FACTORY-AUDIT-001.md
---

# FACTORY-AUDIT-001

Status: OPEN

Purpose:
Document the current state of the Canonical Factory graph architecture.

This audit is evidence gathering only.

No design decisions should be made during this audit.

---

## Section A — Entities

List every entity currently produced by Factory.

For each entity:

- Name
- Status (Implemented / Partial / Planned)
- Schema Location
- Example Artifact

Examples:

- Work
- Author
- Quote
- Character
- Shelf
- Concept
- Theme
- Movement

---

## Section B — Relationships

List every relationship type currently supported.

For each relationship:

- Relationship Name
- Source Entity
- Target Entity
- Status
- Location

Examples:

- influenced_by
- same_theme
- same_tradition
- responds_to
- historical_relation

---

## Section C — Ontology

Document:

- Ontology files
- Taxonomies
- Controlled vocabularies
- Classification systems

Examples:

- Genre
- Theme
- Movement
- Tradition
- Period
- Concept

---

## Section D — Artifact Schema

Document the current canonical artifact structure.

Examples:

- canonicalId
- canonicalKey
- identity
- ontology
- enrichment
- provenance
- relationships

---

## Section E — Storage

Document:

- JSON structures
- SQLite tables
- Graph files
- Export formats

---

## Section F — Embeddings

Document:

- Current embedding models
- Storage locations
- Status

---

## Section G — Outputs

Document all outputs currently produced by Factory.

Examples:

- Canonical Work
- Canonical Author
- Embeddings
- Relationship files
- Export packages

---

## Section H — Example Artifacts

Provide representative examples of actual Factory output.

Source:
LITERARY-GRAPH-AUDIT-001