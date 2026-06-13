---
id: BT-DOCS-ARCHITECTURE-AUTHORS-AUTHOR-RECOMMENDATION-CONFIDENCE-EXPLANATION-MODEL
title: "Author Recommendation Confidence And Explanation Model"
status: active
authority_level: architecture
owner: author-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Author Recommendation Confidence And Explanation Model

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-CONFIDENCE-EXPLANATION-001

## Confidence Definition

Confidence for an Author recommendation means trust in the evidence supporting why this canonical Author is being suggested now.

Confidence is not:

- recommendation score
- affinity strength
- predicted enjoyment
- popularity
- literary quality
- graph importance
- canonical truth
- likelihood the user will follow the Author

Score ranks candidates. Confidence explains evidence trust.

## Explanation Definition

An Author recommendation explanation is a deterministic, privacy-safe account of:

- why this canonical Author is being suggested
- what evidence classes support it
- what confidence band applies
- what privacy and authority boundaries exist
- whether evidence is mixed, indirect, or limited

It must never expose raw private activity or hidden scoring internals.

## Confidence Source Matrix

| Source | Impact | Notes |
|---|---|---|
| Direct Author affinity | Strong positive | Highest trust source |
| Rolled-up Author affinity | Moderate positive | Derived and capped |
| Direct + rolled agreement | Strong positive | Best trust pattern |
| Evidence diversity | Positive | Multiple approved evidence classes |
| Canonical Author authority | Positive/precondition | Required |
| Active lifecycle state | Positive/precondition | Withdrawn/deleted/anonymized cannot support confidence |
| Contradictions | Negative | Lower and cap confidence |
| Negative evidence | Negative | Must reduce confidence |
| Privacy withholding | Limiting | Lowers explanation completeness |
| Graph context | Weak/context only | Cannot create high confidence |
| Popularity | Forbidden | No confidence contribution |
| Search-only | Forbidden | No confidence contribution |
| One Work | Forbidden | No confidence contribution |

## Confidence Bands

| Band | Range | Meaning | User Communication |
|---|---:|---|---|
| Low | 0.00-0.44 | Evidence is weak, sparse, indirect, mixed, or privacy-limited | Low confidence: evidence is limited or mixed. |
| Medium | 0.45-0.74 | Evidence supports the suggestion but has limits | Medium confidence: evidence supports this, with some limits. |
| High | 0.75-1.00 | Strong, diverse, direct, privacy-safe evidence with no material contradiction | High confidence: evidence is strong and consistent. |

High confidence requires direct Author affinity plus reinforcing evidence. Rolled-up evidence alone cannot be high.

## Confidence Formula

```text
confidence =
  0.40 * directEvidenceTrust +
  0.25 * rolledEvidenceTrust +
  0.15 * evidenceDiversity +
  0.10 * lifecycleTrust +
  0.10 * explanationCompleteness
  - penalties
```

Then apply caps.

## Confidence Caps

| Condition | Cap |
|---|---:|
| Direct + rolled evidence, no contradiction | 0.90 |
| Direct Author affinity only | 0.74 |
| Rolled Author affinity only | 0.70 |
| Rolled evidence with private withholding | 0.60 |
| Contradictory evidence | 0.55 |
| Withdrawn direct Author follow present | 0.50 |
| Negative-heavy evidence | 0.44 or suppress |
| Graph context only | no confidence output |
| Popularity/search/display-only | no confidence output |

## Explanation Evidence Rules

| Evidence | Disclosure Level |
|---|---|
| Direct Author follow | "You follow this author" in private context |
| Rolled Author affinity | Aggregate: repeated activity across several works |
| Work signal classes | Source class only: saved, reviewed, quoted, read |
| Negative evidence | Generic uncertainty: some signals reduce confidence |
| Graph context | Context only |
| Private evidence | Aggregate only |
| Public evidence | Summary only |
| Popularity/search/display | Not disclosed as support |

## Mandatory Explanation Components

- primary reason class
- evidence source classes
- confidence band
- confidence rationale
- privacy boundary
- authority boundary
- contradiction note when applicable
- evidence IDs or handles in future output contract

## Forbidden Explanations

- Because you read one book by this author.
- Raw reading history.
- Private shelf names.
- Private review text.
- Private quotes.
- Search terms.
- Popularity claims.
- Readers like you follow.
- Hidden formulas or weights.
- Display-name identity claims.
- You will like this Author.

## Templates

Direct affinity:

```text
Recommended with {band} confidence because you have direct activity with this author.
```

Rolled affinity:

```text
Recommended with {band} confidence because repeated activity across several works by this author supports the suggestion.
```

Direct + rolled:

```text
Recommended with {band} confidence because direct author activity and repeated work-level activity both support this author.
```

Contradictory:

```text
Recommended with {band} confidence because evidence is mixed, so confidence is limited.
```

Privacy-limited:

```text
Recommended with {band} confidence because privacy-safe evidence supports this author, but some details are not shown.
```

## Trust Rules

1. Confidence is independent from score.
2. Confidence is independent from rank.
3. Confidence is independent from popularity.
4. Evidence must be canonical.
5. Evidence must be privacy-safe.
6. Direct and rolled evidence are not equal.
7. Contradictions must lower confidence.
8. Withdrawals must reduce or suppress confidence.
9. Explanation must match evidence actually used.
10. No hidden evidence claims.

## Readiness Verdict

Confidence and explanation architecture is defined. Author recommendations still require output contract, consumption, and implementation-plan authority before implementation.
