# Author Details Roadmap

Status: ARCHITECTURE_AUTHORITY

Request: BT-AUTHOR-DETAILS-ROADMAP-001

Owner: Author Intelligence / Author Details

## Purpose

This document defines the canonical roadmap for evolving Author Details from a functional profile page into a first-class canonical literary entity experience.

It materializes the decisions from:

- `BT-AUTHOR-DETAILS-END-TO-END-AUDIT-001`
- `BT-AUTHOR-QUOTE-EXPERIENCE-AUDIT-001`

This roadmap does not implement code. It defines phase objectives, implementation sequence, dependencies, blocking relationships, readiness gates, risks, and success criteria.

## Current Verdict

Author Details is functional but not yet a flagship canonical literary entity surface.

Current strengths:

- canonical Author route exists
- Author lookup exists
- biography display exists
- bibliography preview exists
- quote preview exists
- follow action exists
- Author-to-Book and Book-to-Author navigation exist

Current blockers:

- weak canonical authority display
- bibliography is thin and partly legacy-name dependent
- quote module is underdeveloped
- follow lifecycle is incomplete in UI
- no literary context module
- no Author recommendation consumption
- no Author pathway readiness
- no Book Details parity

## Roadmap Sequence

| Phase | Name | Status | Dependency |
|---|---|---|---|
| Phase A | Authority Hardening | Next | None |
| Phase B | Bibliography Hardening | After A | Authority model |
| Phase C | Author Quotes Module | After A, parallel with B where safe | Quote ecosystem |
| Phase D | Author Entity Experience | After A-C | Stable modules |
| Phase E | Discovery Author Recommendations | Separate track, before Author Details recommendations | Author Recommendation Consumer Model |
| Phase F | Author Details Recommendation Consumption | After D and E validation | Discovery validation and related-Author governance |
| Phase G | Author Pathways | Last | Pathway authority and Author graph maturity |

## Phase A - Authority Hardening

### Objective

Make Author Details clearly operate on canonical Author identity rather than display-name or provider-derived identity.

### Required Work

- introduce an Author Details authority model based on canonical Author refs
- align Author Details display data with Entity Platform concepts where practical
- expose canonical identity state internally for diagnostics
- preserve provider metadata as provenance/context, not identity
- define loading, missing, archived, unresolved, and non-canonical states
- ensure Book-to-Author navigation passes canonical Author IDs only

### Dependencies

- canonical Author Entity
- `AUTHOR_IDENTITY_COMPLETION.md`
- existing `getAuthor(authorId)` catalog read

### Blocking Relationships

Blocks:

- bibliography hardening
- Author graph/context modules
- Author Details recommendation placement
- Author pathways

### Readiness Gate

Phase A is complete when Author Details can prove:

- every rendered Author page is backed by a canonical Author ID
- display names are never treated as identity
- provider metadata does not become authority
- missing/non-canonical Authors have explicit states

### Success Criteria

- canonical Author identity is explicit
- Author Details no longer behaves as a generic profile page
- future modules can rely on stable Author identity

## Phase B - Bibliography Hardening

### Objective

Make bibliography a strong Author entity module rather than a simple horizontal book preview.

### Required Work

- prefer canonical `authorId` relationships for all bibliography queries
- quarantine display-name fallback as legacy repair only
- add pagination or bounded "view all" behavior
- add sorting rules appropriate to Author Details
- support grouping by reliable metadata when available
- preserve Author-to-Book navigation
- distinguish no Works, loading, partial, and legacy-repair states

### Dependencies

- Phase A authority hardening
- canonical Work references
- existing `getBooksByAuthor(authorId)` behavior

### Blocking Relationships

Blocks:

- flagship Author Details status
- future Work-context literary modules
- pathway modules that start from Author bibliography

### Readiness Gate

Phase B is complete when:

- bibliography is canonical-first
- large bibliographies do not degrade UX
- legacy name fallback cannot silently become authority
- Author-to-Book navigation remains stable

### Success Criteria

- Author Details can represent an Author's Works as a first-class entity relationship
- bibliography supports scan, navigation, and expansion
- prolific Authors remain performant and usable

## Phase C - Author Quotes Module

### Objective

Replace the thin single featured quote preview with a richer, bounded Author quote module.

### Required Work

- show a bounded list of public quotes by Author
- preserve the "View all quotes" path
- show source Work context when `bookId` exists
- link each quote to Quote Details
- expose provenance-safe quote context
- support empty, loading, and error states
- keep private/user quotes hidden unless a separate private quote module is authorized

### Dependencies

- Quote entity model
- Quote Details
- `searchPublicQuotes({ authorId })`
- Quote save/bookmark flows

### Blocking Relationships

Blocks:

- Author Details flagship UX
- quote-driven literary context
- future Author pathway modules that use quotes

### Readiness Gate

Phase C is complete when:

- Author Details shows more than one quote when available
- Quote-to-Author and Author-to-Quote navigation are coherent
- no private quote data appears
- quote provenance is not overstated as canonical truth

### Success Criteria

- Author quotes feel like a meaningful Author entity dimension
- the weakness identified in `BT-AUTHOR-QUOTE-EXPERIENCE-AUDIT-001` is resolved
- Quote ecosystem maturity is reflected inside Author Details

## Phase D - Author Entity Experience

### Objective

Bring Author Details closer to Book Details parity as a canonical literary entity surface.

### Required Work

- redesign Author Details information architecture around stable modules
- add mature hero, authority, biography, bibliography, quotes, and follow lifecycle sections
- add unfollow UI and explicit followed state
- improve mobile layout and empty states
- introduce literary context placeholders only where authority exists
- keep affinity, recommendations, and pathways hidden until later phases

### Dependencies

- Phase A
- Phase B
- Phase C

### Blocking Relationships

Blocks:

- Author Details recommendation consumption
- Author Details pathway placement
- flagship positioning

### Readiness Gate

Phase D is complete when Author Details achieves:

- clear module hierarchy
- complete follow/unfollow lifecycle
- strong bibliography and quote sections
- mobile-safe layout
- no authority ambiguity

### Success Criteria

- Author Details becomes a first-class canonical Author experience
- users can understand an Author through identity, biography, Works, quotes, and follow state
- the page no longer feels materially thinner than Book Details for Author-specific concerns

## Phase E - Discovery Author Recommendations

### Objective

Expose Author Recommendations first in Discovery, not Author Details.

### Required Work

- create Discovery integration plan
- implement feature flag `authorRecommendationsDiscovery`
- build authorized input snapshot
- run pure Author Recommendation Engine
- transform outputs into Discovery DTOs
- display confidence band only
- hide raw evidence, evidence IDs, output IDs, and numeric confidence
- add fallback, caching, telemetry, and privacy tests

### Dependencies

- implemented and validated Author Recommendation Engine
- `AUTHOR_RECOMMENDATION_CONSUMER_MODEL.md`
- Discovery integration authority

### Blocking Relationships

Blocks:

- Home Author Recommendation consumption
- Author Details Author Recommendation consumption

### Readiness Gate

Phase E is complete when:

- Discovery integration passes validation
- feature flag is default off
- empty/error output preserves existing Discovery behavior
- telemetry is aggregate only
- no feedback loop exists

### Success Criteria

- Discovery becomes the first validated consumer of Author Recommendations
- recommendation privacy and explanation boundaries are proven before higher-authority surfaces consume outputs

## Phase F - Author Details Recommendation Consumption

### Objective

Allow Author Details to consume Author Recommendations only after the page is mature enough to avoid authority confusion.

### Required Work

- define related/recommended Author placement authority
- determine whether recommendations belong on Author Details at all
- design a module that does not imply graph truth, influence truth, similarity truth, or canonical relationship truth
- expose only privacy-safe explanation summary and confidence band
- preserve output boundaries from `AUTHOR_RECOMMENDATION_CONSUMER_MODEL.md`
- add feature flag `authorRecommendationsAuthorDetails`
- add strict fallback and no-module behavior

### Dependencies

- Phase D complete
- Phase E validated
- related-Author governance
- Author Recommendation consumer rules

### Blocking Relationships

Blocks:

- any Author Details recommendation UI
- any related Author module that uses recommendations

### Readiness Gate

Phase F is complete when:

- Discovery recommendation consumption has been validated
- Author Details has mature authority, bibliography, quotes, and follow lifecycle
- recommendation module copy cannot be mistaken for canonical graph relationship
- no output IDs, evidence IDs, raw evidence, or numeric confidence are displayed

### Success Criteria

- Author Details can safely show derived Author intelligence without mutating or implying entity/graph/affinity truth
- recommendation consumption remains reversible, feature-flagged, and fallback-safe

## Phase G - Author Pathways

### Objective

Introduce Author-centered literary pathways only after Author graph and pathway authority exists.

### Required Work

- define Author pathway authority
- define allowed pathway types
- define evidence and explanation model
- define privacy model
- define graph-context limits
- determine placement inside Author Details
- add pathway-specific feature flag and fallback behavior

### Dependencies

- Phase D complete
- Author graph maturity
- pathway architecture authority
- privacy-safe explanation authority

### Blocking Relationships

Blocks:

- Author-to-Author pathway UI
- Author-to-Tradition pathway UI
- Author-to-Work journey UI

### Readiness Gate

Phase G is complete when:

- pathways are explainable
- pathways are bounded
- graph context cannot create unsupported claims
- private user behavior is not exposed
- pathway outputs cannot become graph truth

### Success Criteria

- Author Details can support literary journeys without confusing suggestions with canonical ontology
- pathway modules preserve all authority boundaries

## Dependency Matrix

| Capability | Depends On | Blocks |
|---|---|---|
| Authority hardening | Canonical Author identity | All advanced Author Details modules |
| Bibliography hardening | Authority hardening | Entity experience, pathways |
| Quotes module | Quote ecosystem, authority hardening | Entity experience |
| Follow lifecycle | Existing Author follow service | Entity experience |
| Entity experience | Authority, bibliography, quotes, follow lifecycle | Recommendation placement |
| Discovery recommendations | Recommendation engine and consumer model | Author Details recommendations |
| Author Details recommendations | Discovery validation, entity experience | Related Author modules |
| Author pathways | Pathway authority, graph maturity | Pathway UI |

## Risk Matrix

| Risk | Severity | Mitigation |
|---|---:|---|
| Display-name fallback becomes Author authority | High | Phase A and B must canonicalize identity boundaries |
| Author Details recommendations imply graph truth | High | Defer until Phase F and use explicit derived-intelligence copy |
| Private quote or affinity evidence leaks | High | Keep private evidence hidden and test DTO boundaries |
| Bibliography fails for prolific Authors | Medium | Add pagination/grouping and bounded queries |
| Quote module overstates unverified attribution | Medium | Use provenance-safe labels |
| Home/Author Details consumes recommendations before Discovery validation | Medium | Enforce Phase E before Phase F |
| Pathways launch without graph authority | High | Require Phase G authority before implementation |
| Follow lifecycle remains one-way | Medium | Add unfollow and explicit state in Phase D |

## Implementation Sequence

1. Execute Phase A authority hardening.
2. Execute Phase B bibliography hardening.
3. Execute Phase C Author quotes module.
4. Execute Phase D Author entity experience.
5. Execute Phase E Discovery Author Recommendations.
6. Re-audit Author Details for recommendation placement.
7. Execute Phase F only if the re-audit approves placement.
8. Define Author pathway authority.
9. Execute Phase G only after pathway authority is approved.

## Permanent Boundaries

- MatchMaker V1 remains Work-only.
- Author Details must not mutate entity truth.
- Author Details must not mutate graph truth.
- Author Details must not mutate identity truth.
- Author Details must not mutate affinity truth.
- Author Recommendations must not appear on Author Details before Discovery validation.
- Author pathways must not appear before pathway authority exists.
- Raw private reading history, shelves, reviews, quotes, and affinity evidence must not be displayed.
- Recommendation outputs must not become future recommendation inputs.

## Architecture Authority Decision

Author Details may evolve into a flagship canonical literary entity surface only through this phase order.

The next implementation request should target:

```text
BT-AUTHOR-DETAILS-AUTHORITY-HARDENING-001
```

Recommendation and pathway work must remain deferred until the readiness gates in this roadmap are satisfied.
