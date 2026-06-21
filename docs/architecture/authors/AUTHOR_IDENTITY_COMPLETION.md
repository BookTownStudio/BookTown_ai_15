AUTHOR_IDENTITY_COMPLETION

Status

COMPLETED

⸻

Objective

Introduce canonical Author participation into the Literary Identity Graph through a pure adapter layer.

This phase allows explicit Author follow/unfollow actions to be represented as canonical UserEntityInteraction records without introducing:

* Author Affinity
* Author Recommendations
* Author MatchMaker Participation
* Work-to-Author Rollups
* Graph-Derived Author Intelligence
* Persistence Changes

The goal of this phase was Identity Graph participation only.

⸻

Architectural Decision

Authors are canonical literary entities.

Author follows represent the strongest explicit Author signal currently available inside BookTown.

Therefore:

User
↓
Follow Author
↓
UserEntityInteraction
↓
Literary Identity Graph

is approved.

However:

Read Work
↓
Like Author

remains prohibited.

No Author affinity is generated during this phase.

⸻

Scope

Implemented:

* Author Identity Graph adapter
* Canonical Author interaction mapping
* Follow lifecycle modeling
* Unfollow lifecycle modeling
* Unit test coverage

Not implemented:

* Author affinity
* Author recommendations
* MatchMaker participation
* Author pathways
* Work-to-Author rollups
* Author graph intelligence
* Persistence integration

⸻

Files Modified

Identity Graph Adapter

lib/domain/identityGraph/userEntityInteractionAdapter.ts

Tests

test/domain/identityGraph/userEntityInteractionAdapter.test.ts

⸻

Adapter Added

AuthorFollowInteractionInput

Input contract for canonical Author follow interactions.

toAuthorFollowInteraction()

Maps Author follow state into a canonical UserEntityInteraction.

⸻

Mapping Rules

Input	Output
authorId	createAuthorEntityRef(authorId)
Follow	UserEntityInteraction
Unfollow	UserEntityInteraction
Entity Type	author
Interaction Type	following
Source Surface	author_details
Source System	author_follow
Privacy Tier	private
Weight Class	durable

⸻

Lifecycle Rules

Follow

lifecycleState = recorded

Represents an active Author follow.

Unfollow

lifecycleState = withdrawn

Represents withdrawal of the follow signal.

No deletion, anonymization, expiration, or affinity behavior is introduced in this phase.

⸻

Privacy Model

Author follows are treated as:

private

Raw Author follow activity must not be publicly disclosed.

Future systems may use Author follows as private explanatory evidence only where governance permits.

Examples:

Allowed later:

Because you follow this author.

Not allowed:

Expose raw follow history
Expose follow timestamps
Expose private follow activity

⸻

Validation Results

Passed:

npx vitest run test/domain/identityGraph/userEntityInteractionAdapter.test.ts

Passed:

node functions/scripts/syncContracts.cjs

Passed:

npm run typecheck:functions

⸻

Architectural Boundaries Preserved

No changes were made to:

* MatchMaker
* Affinity Layer
* Literary Knowledge Graph
* Search
* Reader
* UI
* Firestore
* Functions
* Rules
* Indexes
* Services
* Persistence

The adapter remains:

Pure
Deterministic
Non-persistent
Identity-only

⸻

Author Readiness Status

Capability	Status
Canonical Author Entity	COMPLETE
Author Details	COMPLETE
Author Follow Authority	COMPLETE
Author Identity Graph Participation	COMPLETE
Author Affinity	NOT STARTED
Author Rollups	NOT STARTED
Author Recommendations	NOT STARTED
Author MatchMaker Participation	NOT STARTED
Author Pathways	NOT STARTED

⸻

Key Governance Rules

1. Author identity must always use canonical Author IDs.
2. Display author names must never create Author identity.
3. Reading a Work does not imply Author affinity.
4. Reviewing a Work does not imply Author affinity.
5. Quoting a Work does not imply Author affinity.
6. Graph proximity does not imply Author affinity.
7. Author follows are explicit Author signals.
8. MatchMaker V1 remains Work-only.

⸻

Next Recommended Phase

BT-AUTHOR-AFFINITY-AUTHORITY-001

Purpose:

Define when Author affinity may exist.

Questions to answer:

* Can Author follows create affinity?
* Can Work behavior create Author affinity?
* Can multiple Works create Author affinity?
* What confidence levels apply?
* How should contradictory signals behave?
* How should privacy boundaries operate?
* How should explanations be generated?

No Author recommendation or MatchMaker participation should begin before Author Affinity Authority is approved.

⸻

Completion Verdict

Author Identity Graph participation is complete.

Authors can now participate in the Literary Identity Graph through explicit canonical Author interactions.

No Author affinity, recommendation, pathway, or MatchMaker behavior has been introduced.

This phase is considered closed.