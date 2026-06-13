---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-AFFINITY-COMPLETION
title: "Author Affinity Completion"
status: locked
authority_level: audit
owner: author-platform
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: docs/architecture/authors/AUTHOR_AFFINITY_COMPLETION.md
---

AUTHOR_AFFINITY_COMPLETION

Status

COMPLETED

⸻

Objective

Introduce canonical Author Affinity into BookTown through explicit Author-targeted user behavior.

This phase enables direct Author affinity generation from canonical Author follow interactions while preserving the separation between:

* Work Affinity
* Author Affinity
* MatchMaker
* Recommendations
* Literary Graph relationships

The objective of this phase was limited Author Affinity participation only.

⸻

Architectural Decision

Author affinity must originate from explicit Author intent.

The first approved Author affinity signal is:

User
↓
Follows Author
↓
Author Affinity

The following remain prohibited:

Read Work
↓
Author Affinity
Review Work
↓
Author Affinity
Quote Work
↓
Author Affinity
Graph Proximity
↓
Author Affinity

Work behavior remains Work-scoped until a future Work-to-Author Rollup Authority is approved.

⸻

Scope

Implemented:

* Author Affinity Adapter
* Direct Author Follow → Author Affinity mapping
* Affinity lifecycle suppression rules
* Author Affinity test coverage

Not implemented:

* Work-to-Author rollups
* Author recommendations
* Author MatchMaker participation
* Author pathways
* Graph-derived Author affinity
* Reading-derived Author affinity
* Review-derived Author affinity
* Quote-derived Author affinity
* Persistence

⸻

Files Created

Affinity Adapter

lib/domain/affinity/authorAffinityAdapter.ts

Tests

test/domain/affinity/authorAffinityAdapter.test.ts

Export Registration

lib/domain/affinity/index.ts

⸻

Adapter Added

toAuthorAffinityFromFollowInteraction()

Creates Author EntityAffinity from a canonical Author follow interaction.

Accepted inputs:

entityType = author
interactionType = following
lifecycleState = recorded

Rejected inputs:

entityType != author
interactionType != following
non-canonical identity
withdrawn lifecycle
deleted lifecycle
anonymized lifecycle
display-name identity

⸻

Affinity Mapping Rules

Property	Value
Affinity Class	explicit
Strength Band	strong
Confidence	0.90
Privacy Tier	private
Entity Type	author
Source Signal	canonical Author follow

⸻

Lifecycle Rules

Recorded Follow

recorded

Creates active Author affinity.

⸻

Withdrawn Follow

withdrawn

Suppresses active Author affinity.

Returns:

null

No active affinity generated.

⸻

Deleted Follow

deleted

No active affinity generated.

Returns:

null

⸻

Anonymized Follow

anonymized

No active affinity generated.

Returns:

null

⸻

Privacy Model

Author affinity is classified as:

private

Raw Author follow activity must not be exposed publicly.

Allowed future explanation:

Because you follow this author.

Not allowed:

Expose follow timestamps
Expose follow history
Expose raw interaction payloads
Expose private affinity calculations

⸻

Confidence Model

Approved Confidence Sources

Source	Confidence
Direct canonical Author follow	High

Prohibited Confidence Sources

Source

Reading a Work

Completing a Work

Reviewing a Work

Quoting a Work

Graph proximity

Author popularity

Search history

Author page visits

⸻

Validation Results

Passed:

npx vitest run test/domain/affinity/*.test.ts

Passed:

node functions/scripts/syncContracts.cjs

Passed:

npm run typecheck:functions

⸻

Architectural Boundaries Preserved

No changes were made to:

* MatchMaker
* Recommendations
* Search
* Reader
* Literary Knowledge Graph
* Identity Graph contracts
* Firestore
* Functions
* Rules
* Indexes
* UI
* Services
* Persistence

The adapter remains:

Pure
Deterministic
Non-persistent
Author-specific
Affinity-only

⸻

Governance Decisions

Approved

1. Canonical Author follows may generate Author affinity.
2. Author affinity is explicit affinity.
3. Author affinity is private.
4. Withdrawn follows suppress affinity.
5. Deleted follows suppress affinity.
6. Anonymized follows suppress affinity.

Rejected

1. Reading one Work creates Author affinity.
2. Completing one Work creates Author affinity.
3. Reviewing one Work creates Author affinity.
4. Quoting one Work creates Author affinity.
5. Graph proximity creates Author affinity.
6. Author popularity creates Author affinity.
7. Display names create Author affinity.
8. MatchMaker outputs create Author affinity.

⸻

Current Author Readiness Status

Capability	Status
Canonical Author Entity	COMPLETE
Author Details	COMPLETE
Author Follow Authority	COMPLETE
Author Identity Graph	COMPLETE
Author Affinity	COMPLETE
Work→Author Rollups	NOT STARTED
Author Recommendations	NOT STARTED
Author MatchMaker Participation	NOT STARTED
Author Pathways	NOT STARTED

⸻

Key Architectural Principle

BookTown currently maintains:

Work Affinity
≠
Author Affinity

A user may love a Work without liking an Author.

A user may follow an Author without reading every Work.

These identities remain independent until a future governed rollup model is approved.

⸻

Next Recommended Phase

BT-WORK-TO-AUTHOR-ROLLUP-AUTHORITY-001

Purpose:

Define whether Work behavior may become Author affinity.

Questions to answer:

* Can reading multiple Works create Author affinity?
* Can reviewing multiple Works create Author affinity?
* Can quoting multiple Works create Author affinity?
* What thresholds are required?
* What confidence caps are required?
* How should contradictory signals behave?
* How should privacy-safe explanations be generated?

No Author recommendations or Author MatchMaker participation should begin before Work-to-Author Rollup Authority is approved.

⸻

Completion Verdict

Author Affinity is complete.

BookTown now supports canonical Author Affinity derived from explicit Author follows.

No Work-to-Author rollups, Author recommendations, Author pathways, or MatchMaker participation have been introduced.

This phase is considered closed.