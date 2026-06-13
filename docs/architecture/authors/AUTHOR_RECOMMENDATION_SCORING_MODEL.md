# Author Recommendation Scoring Model

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-SCORING-MODEL-001

## Mission

Author recommendation score is a deterministic ranking value for already-eligible canonical Author candidates.

Score decides ordering only.

Score is not:

- confidence
- affinity strength
- predicted enjoyment
- popularity
- literary quality
- graph importance
- identity truth
- affinity truth

Candidate eligibility must happen before scoring. Scoring must never rescue an ineligible Author.

## Approved Scoring Inputs

| Input | May Score | Role |
|---|---:|---|
| Direct Author affinity | Yes | Primary signal |
| Rolled-up Author affinity | Yes | Secondary signal |
| Direct + rolled-up agreement | Yes | Agreement boost |
| Recency of approved affinity | Yes | Small freshness modifier |
| Evidence diversity | Yes | Small boost |
| Negative Author evidence | Yes | Penalty only |
| Withdrawn Author affinity | Yes | Suppression or penalty |
| Privacy limitation | Yes | Small penalty |
| Graph context | Context only | No base score |
| Author summary quality | Filter/precondition | No ranking score |

## Forbidden Scoring Inputs

| Input | Score Contribution |
|---|---:|
| Popularity | Forbidden |
| Follower count | Forbidden |
| Graph proximity alone | Forbidden |
| Search behavior | Forbidden |
| Display-name matches | Forbidden |
| Provider metadata alone | Forbidden |
| One Work read/completed | Forbidden |
| Raw reading history | Forbidden |
| Raw review/quote text | Forbidden |
| MatchMaker output feedback | Forbidden |
| Randomness | Forbidden |

## Weighting Model

Scores are on a `0.00` to `1.00` scale.

| Component | Weight |
|---|---:|
| Direct Author affinity | 0.45 |
| Rolled-up Author affinity | 0.30 |
| Evidence diversity | 0.10 |
| Recency | 0.07 |
| Agreement boost | 0.08 |
| Penalties | subtractive |

## Formula

```text
baseScore =
  0.45 * directAffinityScore +
  0.30 * rolledAffinityScore +
  0.10 * evidenceDiversityScore +
  0.07 * recencyScore +
  0.08 * agreementScore

finalScore = clamp(baseScore - penalties, 0, scoreCap)
```

## Combination Rules

| Pattern | Score Behavior |
|---|---|
| Direct Author affinity only | Strong base, medium cap |
| Rolled-up affinity only | Moderate base, medium cap |
| Direct + rolled-up agreement | Highest eligible base |
| Direct positive + rolled weak | Small boost |
| Rolled positive + no direct | No high score |
| Direct withdrawn + rolled positive | Heavy penalty/cap |
| Negative-only | Suppress before scoring |
| Graph-only | No candidate |

## Penalty Rules

| Condition | Penalty | Cap |
|---|---:|---:|
| Direct positive + negative Author signal | -0.25 | 0.55 |
| Rolled positive + negative Work evidence | -0.15 | 0.60 |
| Direct positive + withdrawn follow | -0.30 | 0.50 |
| Direct and rolled evidence materially disagree | -0.15 | 0.60 |
| Minor mixed evidence | -0.08 | 0.70 |
| Negative >= positive | suppress | none |
| Private direct follow evidence | -0.03 | none |
| Private rolled evidence | -0.05 | 0.70 |
| Material evidence cannot be explained | -0.10 | 0.60 |

## Score Caps

| Candidate Pattern | Cap |
|---|---:|
| Direct + rolled, no contradiction | 0.95 |
| Direct only | 0.80 |
| Rolled only | 0.70 |
| Private rolled evidence only | 0.65 |
| Contradictory evidence | 0.55-0.60 |
| Withdrawn direct follow present | 0.50 |
| Sparse minimum evidence | 0.65 |
| Graph/context-only | no score |

## Tie Breaking

Apply in order:

1. higher final score
2. direct + rolled evidence beats single-source evidence
3. higher confidence band
4. fewer contradictions
5. more distinct approved evidence classes
6. more recent approved evidence
7. lexicographic `authorRef.entityId`

No randomness is allowed.

## Confidence Separation

Score ranks eligible Authors. Confidence states trust in evidence.

Score must not be copied into confidence. Confidence must not be copied into score.

## Readiness Verdict

The scoring architecture is defined. Implementation must wait for durable confidence, explanation, output, consumption, and implementation-plan authorities.
