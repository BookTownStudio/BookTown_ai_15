---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-IDENTITY-COMPLETION
title: "Author Identity Completion"
status: locked
authority_level: audit
owner: author-platform
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: docs/architecture/authors/AUTHOR_IDENTITY_COMPLETION.md
---

AUTHOR_IDENTITY_COMPLETION

Status: COMPLETE

Purpose

Establish Authors as first-class canonical entities within the BookTown Literary Identity Graph.

This phase defines how users may directly interact with Authors as entities independent from Works.

⸻

Completed Components

Canonical Author Entity

Implemented:

* Canonical author entity type
* Author entity references
* Author authority source
* Author identity records
* Author details experience

Authority:

* Canonical Author identity always derives from authorId
* Display names are not identity

⸻

Author Follow Authority

Implemented:

* Follow Author
* Unfollow Author
* Follow status

Rules:

* Follow is an explicit Author action
* Follow does not imply reading behavior
* Follow does not imply Author recommendation eligibility
* Follow does not imply Work affinity

⸻

Author Identity Graph Participation

Implemented:

toAuthorFollowInteraction(...)

Produces:

User
→ follows
→ Author

Interaction Type:

following

Properties:

entityType: author
privacyTier: private
weightClass: durable
sourceSurface: author_details
sourceSystem: author_follow

⸻

Governance Decisions

Approved:

* Canonical Author follows may enter the Identity Graph
* Author interactions must use canonical Author IDs
* Follow is an explicit Author signal

Forbidden:

* Display-name identity
* Graph-derived identity
* Popularity-derived identity
* Work-derived identity

⸻

Lifecycle Rules

Recorded:

User currently follows Author

Withdrawn:

User unfollowed Author

Deleted / Anonymized:

Not eligible for active identity participation

⸻

Privacy Rules

Author follows are private.

Raw follow activity:

* must not be exposed publicly
* must not be exposed as raw evidence
* may be summarized only in private contexts

⸻

Not Included

This phase does not implement:

* Author Affinity
* Author Recommendations
* MatchMaker participation
* Work-to-Author rollups
* Author pathways

⸻

Completion Verdict

Author identity participation is complete.

Authors are now valid first-class entities within the Literary Identity Graph.