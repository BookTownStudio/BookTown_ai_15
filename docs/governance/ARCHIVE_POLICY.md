---
id: BT-DOCS-ARCHIVE-POLICY-001
title: "BookTown Archive Policy"
status: active
authority_level: governance
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Archive Policy

This policy defines how BookTown handles archived, superseded, historical, duplicate, and evidence-only documentation.

## Documentation Layer Model

Archive is a documentation layer, not a deletion mechanism. It preserves traceability while preventing obsolete documents from acting as current authority.

| Source Type | Target Handling |
|---|---|
| Superseded authority document | Mark `superseded` and declare `superseded_by`. |
| Historical implementation plan | Archive after completion unless promoted. |
| Completion report | Evidence only; archive or retain in audit history. |
| Audit report | Evidence only; lock after completion. |
| Duplicate document | Keep one authority route; mark or archive duplicate. |
| Uploaded prompt/source file | Evidence only; never default AI context. |
| Empty placeholder | Not authority; archive or populate through approved work. |

## Authority Hierarchy

Archived and superseded documents sit below all active authority. They cannot override Canon, Vision, Master, ADR, Architecture, Product, Governance, or Operations documents.

## Document Lifecycle

Documents enter archive handling through two states:

| State | Meaning |
|---|---|
| `superseded` | Replaced by a known successor. |
| `archived` | Retained for history without current authority. |

A superseded document must declare `superseded_by`. An archived document should normally set `source_of_truth: false` and `ai_read: false`.

## Authority Update Triggers

Archive review is required when:

1. A document is replaced.
2. A duplicate authority path is discovered.
3. An audit or completion report is no longer operationally relevant.
4. A prompt or pasted source file has been converted into formal documentation.
5. A roadmap has been completed or abandoned.
6. A product or architecture plan is no longer current.
7. Master routing no longer points to a document.

## AI Reading Order

AI systems must not include archived or superseded documents in default reading order.

Archived documents may be read only after:

1. Current authority has been read.
2. The task requires historical evidence.
3. The document's archived status is disclosed in the answer.

## Archive Rules

1. Do not delete historical documents solely to reduce clutter.
2. Do not leave replaced authority unmarked.
3. Do not allow duplicate documents to both appear authoritative.
4. Do not route AI systems to archived documents by default.
5. Do not use archived content to override active or locked authority.
6. Preserve auditability by linking superseded documents to their replacement.
7. Prefer explicit metadata over folder location alone.

## Promotion Rules

Archived or superseded documents may return to authority only through explicit promotion. Promotion requires:

1. Status change from `archived` or `superseded` to `draft` or `active`.
2. Owner assignment.
3. Metadata update.
4. Conflict review.
5. Master routing update.
6. Clear explanation of why historical material is current again.

## Master Layer Responsibilities

The Master Layer must not route to archived or superseded documents as current authority. If historical context is necessary, Master documents may mention the archived document as evidence only.

## Canon Layer Responsibilities

Canon must not directly absorb archived material. Historical content must first be distilled into current truth and promoted through the normal authority process.

## Maintenance Responsibilities

Documentation maintainers must periodically identify:

1. Superseded documents without `superseded_by`.
2. Duplicate files with overlapping authority.
3. Empty placeholders.
4. Completion reports being used as authority.
5. Audit files being used as operating truth.
6. Uploaded source files still present in default AI context.

## Required Metadata Standard

Archived and superseded documents must use the standard metadata:

```yaml
id: stable-document-id
title: Human-readable title
status: draft | active | locked | superseded | archived
authority_level: canon | vision | master | adr | architecture | product | governance | operations | audit | archive
owner: owning-team-or-role
last_audited: YYYY-MM-DD
source_of_truth: true | false
supersedes: []
superseded_by: null
ai_read: true | false
```

For archived documents, the default is:

```yaml
status: archived
authority_level: archive
source_of_truth: false
ai_read: false
```
