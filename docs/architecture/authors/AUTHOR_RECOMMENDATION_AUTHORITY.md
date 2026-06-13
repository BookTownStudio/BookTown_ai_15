# Author Recommendation Authority

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-RECOMMENDATION-AUTHORITY-001

Owner: Author Intelligence / MatchMaker Future Expansion

## Purpose

This document defines the canonical authority for future Author recommendations in BookTown.

An Author recommendation is a privacy-safe literary intelligence output that suggests a canonical Author as a meaningful creator identity for a user to explore, follow, or contextualize.

An Author recommendation is not:

- a popularity ranking
- a social follow suggestion
- a search result
- a Work recommendation substitute
- a graph-near Author card
- an inferred psychological claim
- an LLM opinion

## Mission

Author recommendations should answer:

> Why is this canonical Author a meaningful literary identity target for this user now?

They must preserve:

- canonical Author identity
- user privacy
- evidence explainability
- confidence discipline
- separation from Work recommendations
- separation from entity, graph, affinity, identity, search, and popularity authority

## Recommendation Definition Matrix

| Question | Decision |
|---|---|
| What is recommended? | A canonical `author` entity |
| What is the user action? | Explore Author, follow Author, view Works by Author |
| Is it a Work recommendation? | No |
| Is it Search? | No |
| Is it a social suggestion? | No |
| Is it popularity-based? | No |
| Is it MatchMaker derived intelligence? | Future yes |
| Is it allowed in MatchMaker V1? | No |

## Approved Signals

Approved future evidence:

- direct Author affinity
- rolled-up Author affinity
- canonical Author bookmarks/follows after authority
- multiple canonical Work affinities linked to the same Author through governed rollup
- privacy-safe expressive Work evidence after rollup governance

## Rejected Signals

Rejected as candidate, scoring, confidence, or explanation support:

- popularity
- global follower count
- graph proximity alone
- one Work read or completed
- display author names
- raw search behavior
- provider metadata alone
- MatchMaker output feedback loops

## Eligibility Rules

A future Author recommendation requires:

1. canonical `author` ref
2. display-safe Author summary
3. at least one approved user-specific evidence source
4. privacy-safe explanation
5. confidence band
6. no suppressive negative state
7. no dependency on popularity, graph-only, search-only, display-name-only, or single-Work-only evidence

## MatchMaker Participation Decision

Author recommendations should be part of a future versioned MatchMaker expansion or adjacent pure MatchMaker-author engine.

They must not be implemented as an ad hoc recommender.

MatchMaker V1 remains Work-only.

## Consumption Decision

Author recommendation consumption is governed separately by `AUTHOR_RECOMMENDATION_CONSUMPTION_MODEL.md`.

The first approved consumer is future Discovery, not Search, Reader, Social, Notifications, or authority systems.

## Readiness Verdict

Author recommendations are architecturally justified but not implementation-ready until the full authority stack is present:

- candidate universe
- scoring model
- confidence and explanation model
- output contract
- consumption model
- implementation plan
