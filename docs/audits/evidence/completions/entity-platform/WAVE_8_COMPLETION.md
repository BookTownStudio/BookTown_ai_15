---
id: BT-DOCS-ARCHITECTURE-ENTITY-PLATFORM-WAVE-8-COMPLETION
title: "Wave 8 Completion"
status: locked
authority_level: audit
owner: entity-platform
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: docs/architecture/entity-platform/WAVE_8_COMPLETION.md
---

Wave 8 completed successfully.

Affinity Layer compatibility established.

UserEntityInteraction can now produce EntityAffinity.

Supported affinity sources:

- Reading
- Shelving
- Reviewing
- Quoting
- Bookmarking
- Search clicks
- Entity-attached discussion

Affinity remains:

- Derived
- Non-persistent
- Privacy-preserving
- Non-recommendational

No MatchMaker integration.
No graph expansion.
No entity rollups.
No recommendation changes.

BookTown is now Affinity Layer compatible at the adapter layer.

Next milestone:

BT-WAVE-9-MATCHMAKER-INPUT-SNAPSHOT-READINESS-001