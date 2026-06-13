# Author Recommendation Consumption Model

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-CONSUMPTION-MODEL-001

## Purpose

This document governs where Author recommendations may and may not be consumed inside BookTown.

Author recommendation outputs must never become Search relevance, Reader behavior, Identity truth, Affinity truth, Graph truth, popularity ranking, or social follow suggestions.

## First Approved Consumer

The first approved consumer is future Discovery behind a dedicated feature flag:

```text
authorRecommendationsDiscovery
```

Discovery is the safest first surface because it is exploratory, avoids Search authority contamination, avoids Reader interruption, and does not imply recommendation output is canonical Author identity.

## Surface Eligibility Matrix

| Surface | Eligibility | Decision |
|---|---:|---|
| Discovery | Approved first | Best fit for exploratory Author intelligence |
| Home | Later | Higher visibility; only after Discovery validation |
| Author Details | Later | Related Authors require graph maturity |
| Book Details | Later | Prefer Author-context Work modules first |
| AI Librarian | Later | Requires conversational privacy governance |
| Admin | Diagnostics only | No user-facing recommendation consumption |
| Search | Prohibited | Search remains search authority |
| Search Results | Prohibited | Must not blend recommendation ranking into search |
| Reader | Prohibited | Privacy/interruption risk |
| Read Tab | Deferred | Strong privacy sensitivity |
| Social | Prohibited | Feedback-loop and social-suggestion risk |
| Notifications | Prohibited | Too intrusive |
| Writing/Publications | Deferred | Requires author/writer identity boundaries |

## Display Rules

Display as an Author card:

- Author name
- portrait if available
- short safe subtitle
- privacy-safe reason text
- optional confidence label
- navigation to Author Details

Do not display:

- output ID
- evidence IDs
- raw evidence
- numeric confidence score
- hidden weights
- raw private activity

## Display Transformation Matrix

| Output Field | Display Rule |
|---|---|
| Author ref | Navigation only |
| Author summary | Display name, image, brief safe metadata |
| Explanation summary | Short privacy-safe text |
| Confidence band | Optional label only |
| Confidence score | Internal only |
| Evidence IDs | Never display |
| Raw evidence | Never display |
| Privacy tier | Enforce internally |
| Authority boundary | Diagnostics/admin only unless product requires |

## Explanation Exposure Rules

Allowed:

- privacy-safe explanation summary
- broad evidence source classes
- contradiction note when material
- privacy limitation note when material
- confidence band/rationale when safe

Forbidden:

- raw reading history
- private shelf names
- private reviews
- private quotes
- search terms
- evidence IDs
- hidden formulas
- output IDs

## Confidence Exposure Rules

Display confidence band only by default.

Numeric confidence scores remain internal.

Confidence must never be described as:

- rating
- popularity
- certainty
- predicted enjoyment
- literary quality

## Privacy Rules

1. Preserve or narrow output privacy tier.
2. Private evidence may only be displayed as aggregate summaries.
3. Telemetry may log counts, confidence bands, and source classes only.
4. Cache per user only.
5. Recommendation impressions must not feed future recommendations without separate feedback-loop authority.

## Feature Flags

| Flag | Default | Scope |
|---|---:|---|
| `authorRecommendationsDiscovery` | Off | Discovery only |
| `authorRecommendationsHome` | Off | Future |
| `authorRecommendationsAuthorDetails` | Off | Future |
| `authorRecommendationsDebug` | Off | Admin/internal only |

## Fallback Rules

If disabled, empty, errored, privacy-blocked, or no eligible candidates:

- do not render the module
- do not insert popular Authors
- do not query Search as fallback
- do not degrade into graph-near Authors
- preserve existing surface behavior

## Future MatchMaker Compatibility

1. MatchMaker V1 remains Work-only.
2. Author outputs must not reuse V1 Work assumptions.
3. Author output consumption must preserve evidence, explanation, confidence, constraints, provenance, and privacy metadata.
4. Output IDs must not become entity, graph, affinity, identity, or search keys.

## Readiness Verdict

Consumption governance is defined. Implementation still requires an approved implementation plan and validated output contract.
