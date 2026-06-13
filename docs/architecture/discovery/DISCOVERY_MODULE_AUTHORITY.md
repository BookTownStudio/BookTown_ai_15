# Discovery Module Authority

Status: ARCHITECTURE_AUTHORITY

Request: BT-DISCOVERY-RECOMMENDATION-BOUNDARIES-001

Owner: Discovery / Product Architecture

## Purpose

This document defines how modules inside Discovery are authorized, named, placed, displayed, hidden, and governed.

Discovery modules are not interchangeable UI blocks. Each module must declare its producer, namespace, authority, display contract, fallback behavior, telemetry scope, and privacy boundary.

## Discovery Mission

Discovery is an exploratory hub for literary experiences.

It may host AI, recommendations, editorial modules, and future literary intelligence, but each module must preserve source authority and user trust.

## Module Authority Rules

Every Discovery module must define:

1. module name
2. namespace
3. producing system
4. governing authority
5. feature flag if dynamic or personalized
6. display DTO
7. allowed display fields
8. forbidden display fields
9. loading behavior
10. empty behavior
11. error fallback
12. telemetry fields
13. privacy classification
14. feedback-loop policy

If a module cannot define these fields, it must not be added.

## Approved Module Types

| Module Type | Status | Notes |
|---|---|---|
| AI Agent grid | Existing | Entry point to AI agent experiences |
| AI Librarian conversation | Existing | Conversational namespace only |
| Author Recommendations | Approved for implementation after this authority | Must use dedicated module and flag |
| MatchMaker Discovery | Future | Requires MatchMaker Discovery consumer authority |
| MatchMaker Work Recommendations | Future | Discovery currently deferred for MatchMaker V1 |
| Editorial Discovery | Future/conditional | Requires editorial module authority |
| Pathways | Future | Requires pathway authority |

## Prohibited Module Types

| Module Type | Status | Reason |
|---|---|---|
| Search result injection | Prohibited | Search authority contamination |
| Reader interruption module | Prohibited | Reader privacy and focus boundary |
| Social recommendation module | Prohibited | Social feedback-loop and privacy risk |
| Notification-like recommendation module | Prohibited | Too intrusive without opt-in authority |
| Graph-near author module without graph authority | Prohibited | Implies canonical relationship truth |
| Popular authors fallback | Prohibited | Popularity is not recommendation evidence |

## Author Recommendation Module Authority

The first governed recommendation module approved for Discovery is:

```text
Recommended Authors
```

Namespace:

```text
author_recommendations
```

Feature flag:

```text
authorRecommendationsDiscovery
```

Placement:

```text
Discovery landing
  AppNav
  Intro/history row
  Recommended Authors
  AI Agent grid
```

The module must not appear inside AI Librarian chat.

## Module Display Rules

Author Recommendation cards may display:

- Author name from display-safe `targetSummary`
- Author image if display-safe and present in summary metadata
- short safe subtitle
- explanation summary
- confidence band label
- broad source class labels
- navigation to Author Details

Author Recommendation cards must not display:

- output ID
- evidence IDs
- raw evidence
- raw affinity details
- raw reading history
- raw shelf, review, or quote text
- numeric confidence
- score
- hidden weights
- graph internals
- Search terms

## Visual Distinction Rules

Modules from different namespaces must be visually and semantically distinct.

Required distinctions:

- title communicates module scope
- no AI chat bubble styling for governed recommendation modules
- no "AI says" copy for governed engine outputs
- no "recommended by graph" copy without graph authority
- no "because you searched" copy for Author Recommendations
- no "similar author" copy without related-author authority

Recommended Author copy must communicate derived intelligence without claiming truth.

Allowed examples:

- "Recommended Authors"
- "Suggested from your literary signals"
- "Confidence: High"

Forbidden examples:

- "Authors you will love"
- "Similar authors"
- "Influenced by"
- "Popular near you"
- "Based on your search history"

## Loading, Empty, And Error Rules

| State | Required Behavior |
|---|---|
| Feature flag off | Render nothing |
| Input unavailable | Render nothing |
| Loading | Optional compact skeleton, never blocking whole Discovery |
| Empty output | Render nothing |
| Engine error | Render nothing |
| Privacy suppression | Suppress affected cards; render nothing if all suppressed |
| Invalid DTO | Suppress affected card or module |

The module must not insert fallback popular authors, Search results, AI suggestions, or graph-near authors.

## Module Ordering Rules

Phase 1 ordering:

1. Discovery page chrome
2. Intro/history row
3. Recommended Authors module
4. AI Agent grid

Rationale:

- visible enough for canary validation
- not elevated above page identity
- does not interrupt AI agent use
- keeps Author Recommendations separate from AI Librarian

## Telemetry Boundaries

Module telemetry may include:

- namespace
- feature flag state
- module rendered boolean
- output count
- confidence band histogram
- source class histogram
- fallback reason enum
- latency bucket
- card open count

Module telemetry must not include:

- output IDs
- evidence IDs
- raw evidence
- raw affinity records
- raw private activity
- numeric confidence
- Search terms

## Feedback Loop Prevention

Module interactions are display telemetry only.

Card opens, follows, impressions, and dismissals must not feed Author Recommendation candidate generation, scoring, confidence, or future input snapshots without separate feedback-loop authority.

## Implementation Sequence

1. Add namespace and module authority tests.
2. Add `authorRecommendationsDiscovery` flag.
3. Add DTO adapter for Author Recommendation outputs.
4. Add `Recommended Authors` module in the approved placement.
5. Add privacy and forbidden-field tests.
6. Add fallback tests.
7. Add aggregate telemetry only.
8. Run Discovery validation audit before canary.

## Architecture Authority Decision

Discovery modules must be governed by namespace and producer authority.

The first approved governed recommendation module is `Recommended Authors`, produced only by the Author Recommendation Engine, displayed only on the Discovery landing surface, and gated by `authorRecommendationsDiscovery`.
