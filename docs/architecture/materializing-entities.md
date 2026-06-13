---
id: BT-DOCS-ARCHITECTURE-MATERIALIZING-ENTITIES
title: "MaterializingEntity Pattern"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# MaterializingEntity Pattern

## Status
**Canonical – Required for all asynchronous domain entities**

---

## Problem

In modern distributed systems, many domain entities are **not instantly available** after creation.

Examples:
- Books ingested from external APIs
- AI-generated content
- Media processing (covers, EPUBs, audio)
- User-generated posts with enrichment
- Background normalization or indexing

A common failure mode is treating this **temporary absence** as an error, resulting in:
- “Unable to load content” screens
- Broken navigation flows
- Non-deterministic UI behavior
- Retry storms or ghost state

---

## Definition

A **MaterializingEntity** is a domain entity that:

- Has been **intentionally created**
- May **not yet be readable** by clients
- Will eventually become available **or fail explicitly**

This pattern **models that intermediate state explicitly** instead of relying on timing assumptions.

---

## Core States

Every MaterializingEntity MUST be in exactly one of the following states:

```ts
type MaterializationState =
  | 'PREPARING'   // Valid, expected, temporary
  | 'READY'       // Fully materialized and readable
  | 'FAILED';     // Terminal failure
```