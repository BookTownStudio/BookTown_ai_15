---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-RECOMMENDATION-OUTPUT-CONTRACT
title: "Author Recommendation Output Contract"
status: active
authority_level: architecture
owner: author-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Author Recommendation Output Contract

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-OUTPUT-CONTRACT-001

## Purpose

This document defines the durable output shape for future Author recommendations.

No code contract is implemented by this document. It is the architecture authority that a future implementation must follow.

## Output Mission

An Author recommendation output must be:

- canonical
- explainable
- confidence-bearing
- privacy-safe
- deterministic
- non-authoritative over identity, affinity, graph, search, reader, or MatchMaker V1 truth

## Proposed Output Shape

```ts
interface AuthorRecommendation {
  readonly metadata: AuthorRecommendationMetadata;
  readonly targetAuthorRef: LiteraryEntityRef; // entityType author
  readonly targetSummary: EntitySummary;
  readonly reason: AuthorRecommendationReason;
  readonly evidence: readonly AuthorRecommendationEvidence[];
  readonly explanation: AuthorRecommendationExplanation;
  readonly confidence: AuthorRecommendationConfidence;
  readonly constraints: readonly AuthorRecommendationConstraint[];
}
```

## Metadata

Required metadata:

- deterministic `outputId`
- `outputType: "author_recommendation"`
- contract version
- generated timestamp
- provenance
- privacy tier
- source input contract version when present

Output IDs must never become entity IDs, graph IDs, affinity IDs, identity IDs, search keys, or feedback-loop keys.

## Target Requirements

The target must be:

- `entityType === "author"`
- canonical
- authority source `author_authority`
- display-safe
- backed by an Author summary

Missing summary suppresses surfaced recommendation.

## Reasons

Allowed reason classes:

- `direct_author_affinity`
- `rolled_author_affinity`
- `direct_and_rolled_author_affinity`
- `author_identity_reinforcement`
- `author_exploration`

Forbidden reasons:

- popularity
- graph-only proximity
- search-only intent
- display-name match
- one-Work activity

## Evidence

Evidence may include:

- direct Author affinity evidence
- rolled-up Author affinity evidence
- privacy-safe Work signal class summaries
- canonical Author summary evidence
- graph context only as supporting context, never qualifying evidence

Evidence must not include:

- raw reading history
- raw shelf names
- raw review text
- raw quotes
- raw search text
- hidden scoring formulas
- popularity counts as support

## Explanation

Every output must include:

- primary reason class
- evidence IDs or handles
- source boundaries
- confidence band and rationale
- privacy boundary
- authority boundary
- contradiction note when applicable

Authority boundary must state that the output is derived intelligence and not canonical truth.

## Confidence

Every output must include:

- band: low, medium, or high
- score: internal bounded numeric value
- rationale: privacy-safe explanation of trust

Numeric confidence scores are internal by default and should not be exposed to users unless a future debug/admin contract permits it.

## Constraints

Allowed constraint classes:

- privacy
- authority
- scope
- confidence
- safety
- freshness
- diversity

Required constraints:

- no popularity-only recommendation
- no graph-only recommendation
- no display-name identity
- no single-Work recommendation
- preserve privacy tier

## Privacy Rules

Output privacy tier must preserve or narrow the strictest contributing evidence tier.

Private evidence may support an output only when the explanation can remain aggregate and privacy-safe.

If privacy-safe explanation is impossible, suppress the output.

## MatchMaker Boundary

This output is not part of MatchMaker V1.

Future implementation may either extend MatchMaker through a versioned Author target expansion or create an adjacent pure Author recommendation engine governed by MatchMaker standards.

## Readiness Verdict

The output contract is architecturally defined. Code contracts must not be implemented until an implementation plan is approved.
