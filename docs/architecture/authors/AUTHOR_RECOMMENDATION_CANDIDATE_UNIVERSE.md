---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-RECOMMENDATION-CANDIDATE-UNIVERSE
title: "Author Recommendation Candidate Universe"
status: active
authority_level: architecture
owner: author-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Author Recommendation Candidate Universe

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-CANDIDATE-UNIVERSE-001

## Purpose

This document defines which Authors may enter the future Author recommendation candidate pool.

The Author recommendation candidate universe is the bounded set of canonical Authors that may be evaluated as future recommendation targets because they have approved, user-specific, privacy-safe evidence.

Not every canonical Author is a valid candidate.

## Candidate Universe Matrix

| Author Category | Candidate Eligible | Reason |
|---|---:|---|
| Canonical Author with direct Author affinity | Yes | Strong user-specific evidence |
| Canonical Author with rolled-up Author affinity | Yes | Governed multi-Work evidence |
| Canonical Author with direct and rolled-up affinity | Yes | Strongest candidate class |
| Canonical Author with graph proximity only | No | Context only |
| Canonical Author with popularity only | No | Not user-specific |
| Canonical Author from search behavior only | No | Intent too weak |
| Display-name Author | No | Not canonical identity |
| Provider-only unresolved Author | No | Not canonical |
| Canonical Author with no summary | No for surfaced recommendation | Cannot be safely displayed |
| Withdrawn/suppressed Author affinity | No | User signal is no longer active |

## Candidate Source Matrix

| Source | May Generate Candidate | May Support Candidate | Notes |
|---|---:|---:|---|
| Direct Author affinity | Yes | Yes | Strongest approved source |
| Work-to-Author rolled affinity | Yes | Yes | Medium confidence max unless combined |
| Direct Author follow interaction | No directly | Yes | Must become affinity first |
| Work affinity | No directly | Yes after rollup | Cannot bypass rollup governance |
| Work interaction | No directly | Yes after rollup | Single Work forbidden |
| Author bookmark/future signal | Future | Future | Needs authority |
| Graph relationship | No | Yes | Context only |
| Author search | No | Limited context | Not recommendation evidence |
| Popularity/follower count | No | No | Forbidden |
| Display author name | No | No | Forbidden |
| Provider metadata | No | Limited identity context | Not user-specific |

## Candidate Eligibility Rules

Minimum requirements:

1. `entityType === "author"`
2. `authorityState === "canonical"`
3. `authoritySource === "author_authority"`
4. active approved candidate source
5. safe Author summary/display name
6. privacy tier
7. provenance
8. evidence source class
9. no hard suppression state
10. explanation-safe evidence boundary

## Candidate Expansion Rules

Allowed:

- direct Author affinity to Author candidate
- rolled-up Author affinity to Author candidate

Forbidden:

- Work affinity directly to Author candidate
- Work interaction directly to Author candidate
- Work -> Author -> similar Author
- Author -> influenced Author
- Author -> Works -> Author
- Search query to Author candidate
- Popular Authors
- Graph-near Authors

## Candidate Filtering Rules

Hard reject:

- non-Author entity
- non-canonical Author
- missing Author summary/display name
- no approved evidence
- search-only evidence
- graph-only evidence
- single-Work-only evidence
- privacy-unsafe evidence
- display-name-only evidence
- popularity-only evidence

Contradictory but not suppressive evidence may remain for future scoring with lower confidence.

## Candidate Suppression Rules

Suppress when:

- direct Author follow is withdrawn
- Author interaction is deleted or anonymized
- negative Author affinity is active and severe
- rolled evidence is negative-only
- negative evidence count is greater than or equal to positive evidence count
- privacy tier cannot be respected
- Author identity conflicts

## MatchMaker Participation

Author candidates must not enter MatchMaker V1.

Future Author candidates should be governed by versioned MatchMaker expansion or an adjacent pure MatchMaker-author engine.

## Readiness Verdict

The candidate universe is defined. Implementation must wait for scoring, confidence, explanation, output, consumption, and implementation-plan authorities.
