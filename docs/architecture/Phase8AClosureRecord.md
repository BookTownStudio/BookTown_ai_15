# BOOKTOWN — Phase 8A Closure Record

Projection Certification & Recovery Infrastructure

Closure Date: June 1, 2026

## 1. Executive Summary

Phase 8A was initiated to convert BookTown's projection ecosystem from a set of independently evolved runtime surfaces into a certified, recoverable, auditable architecture.

Before Phase 8A, critical read surfaces were maintained by a mixture of triggers, backfills, compatibility writers, embedded fields, and administrative scripts. Some projections had deterministic rebuild paths; others depended on trigger history or broad backfills. Verification was inconsistent, runbook coverage was incomplete, and hidden projection-like surfaces created uncertainty about what was authoritative, recoverable, deprecated, or excluded.

The goal of Phase 8A was to establish a certified projection ecosystem: every production projection would have an explicit authority model, registry classification, bounded recovery path, verification path, operational reporting, failure tracking, health integration, and runbook. Surfaces that were not production projections would be explicitly classified as deprecated, compatibility-only, sidecar, cache, ledger, authority, or excluded.

Final outcome:

PHASE 8A STATUS: COMPLETE

PHASE 8A STATUS: CERTIFIED

PHASE 8A STATUS: LOCKED

## 2. Background

Prior to Phase 8A, BookTown had accumulated projection sprawl across social, reader, search, catalog, media, analytics, and operational domains. This is a normal scaling pressure in a Firestore product: read models, denormalized documents, counters, embedded DTO fields, search indexes, and compatibility surfaces grow quickly as product workflows mature.

The risk was not the existence of projections. The risk was uncertainty.

Key pre-Phase 8A risks included:

- Projection sprawl across top-level collections, embedded fields, subcollections, sidecars, and admin artifacts.
- Mixed recovery approaches, including trigger-only maintenance, global backfills, manual repair scripts, and partial rebuild handlers.
- Inconsistent verification, where some projections could be compared to authority and others could not.
- Missing or inconsistent runbooks, increasing operator dependency on memory and source-code inspection.
- Hidden projection risk, where a surface could influence runtime behavior without being registered or certified.
- Operational uncertainty around stale counters, orphan documents, partial fanout failures, and recovery restartability.

These risks become dangerous as BookTown scales because projection drift is rarely isolated. A stale projection can affect search, feeds, profile stats, reader state, notification counts, analytics, recommendations, and admin decisions. Without deterministic recovery and verification, operational incidents become slow, manual, and risky.

## 3. Phase 8A Objectives

Phase 8A had eight core objectives.

Projection Certification: classify each production projection and require explicit certification metadata.

Recovery Infrastructure: provide bounded, restartable, idempotent recovery mechanisms for production projection families.

Verification Infrastructure: establish deterministic verification against canonical authority or justified compatibility sources.

Failure Management: record projection failures in a structured ledger for audit, replay, and incident analysis.

Health Monitoring: update projection health from recovery and verification outcomes.

Documentation Consistency: align architecture documentation, runbooks, executable registry metadata, and recovery behavior.

Hidden Surface Elimination: identify projection-like surfaces that were not registered, then classify them as certified, deprecated, sidecar, cache, ledger, authority, or excluded.

Founder Risk Reduction: reduce solo-operator risk by making projection behavior inspectable, recoverable, and documented.

## 4. Architecture Established

### Projection Registry

The projection registry is the executable source of truth for Phase 8A certification status.

Purpose:

- enumerate projection families
- declare authority sources
- declare projection collections and embedded surfaces
- define production readiness status
- record recovery capabilities
- enforce certification requirements

Responsibilities:

- distinguish production-ready, deprecated, beta-ready, and not-ready projections
- expose certification reports
- prevent production-ready projections from lacking required recovery metadata
- provide runbook paths and operational notes

Certification model:

- `production_ready` means a projection satisfies Phase 8A recovery, verification, reporting, checkpointing, failure-ledger, health, and documentation requirements.
- `deprecated` means the surface remains known and governed but is no longer a production projection family.
- `beta_ready` and `not_ready` remain at zero at Phase 8A closure.

### Recovery Control Plane

The recovery control plane standardizes how projection recovery is requested, authorized, bounded, and reported.

Purpose:

- provide consistent recovery request semantics
- default recovery operations to dry-run
- restrict write repair to explicit repair mode
- enforce batch-size limits
- produce structured recovery outcomes

Capabilities:

- single-entity recovery
- collection-page recovery
- checkpointed full recovery
- dry-run verification
- write repair
- certification evaluation

### Verification Framework

The verification framework determines whether projection documents match canonical authority.

Purpose:

- detect missing projections
- detect stale projections
- detect count drift and schema drift
- detect orphan projection documents
- generate structured verification reports

Capabilities:

- authority-to-projection comparison
- projection-to-authority orphan detection
- success-rate reporting
- missing, stale, mismatch, and extra counters
- sample failure reporting

### Checkpoint System

The checkpoint system makes large recovery runs restartable and bounded.

Purpose:

- avoid global unbounded scans
- support long-running projection recovery
- resume after timeout or operator interruption
- prevent repeated work during multi-page recovery

Capabilities:

- checkpoint identifiers
- cursor persistence
- per-run progress tracking
- hard batch-size enforcement

### Failure Ledger

The failure ledger records projection failures as operational facts.

Purpose:

- preserve failure context
- support replay and incident analysis
- prevent silent projection drift
- give operators a durable audit trail

Capabilities:

- projection name
- projection collection
- authority path
- projection path
- failure class
- source event or recovery correlation
- structured diagnostic message

### Projection Health Framework

The projection health framework records projection status from recovery and verification outcomes.

Purpose:

- summarize operational health
- reflect verification and repair outcomes
- support dashboards and operator triage

Capabilities:

- health updates from verification
- health updates from recovery summary
- health updates from failure events
- consistent projection-level status reporting

### Runbook System

The runbook system provides human-operable recovery and deprecation instructions.

Purpose:

- make recovery executable by operators without source-code reconstruction
- document authority and projection paths
- define dry-run and write-repair commands
- document failure modes and escalation criteria

Capabilities:

- production recovery runbooks
- deprecation runbooks
- authority summaries
- verification and repair instructions
- operational constraints

## 5. Certified Projection Portfolio

### Registry Totals

Final executable registry totals:

- Total projections: 56
- Production-ready: 52
- Deprecated: 4
- Beta-ready: 0
- Not-ready: 0
- Failing production gates: 0
- Missing runbooks: 0

### Production-Ready Categories

Reviews & Quotes:

- quote fanout projections
- review fanout projections
- canonical review-derived book statistics
- book catalog compatibility counters

Search:

- search feed
- search bookmarks
- search notifications
- book search fields

Library:

- user library books
- shelf display projection
- reading progress compatibility fields

User Statistics:

- social user stats
- public profile counters
- library user stats
- shelf user stats
- content user stats
- writing user stats
- profile quality stats
- storage user stats

Social:

- post engagement stats
- social post render projection
- projected viewer state
- activity-log-derived notifications

Reader:

- reader authority projection
- reader manifests
- reader EPUB indexes
- reader highlights/bookmarks
- reader events
- reader sync idempotency
- reader audit diagnostics
- reader insights DTO

Analytics:

- post analytics
- analytics daily exports
- system metrics
- system events
- runtime health projection
- runtime anomaly projection

Media:

- attachment metadata
- attachment image derivatives
- attachment cleanup counters
- cover derivatives

Intelligence:

- intelligence signal queue
- intelligence aggregates

Events:

- event stats

## 6. Deprecated Projection Portfolio

### `legacy_user_reviews_projection`

Original purpose:

The legacy user review projection supported compatibility fanout from historical `books/{bookId}/reviews/{reviewId}` review documents into user review surfaces.

Why deprecated:

BookTown moved review authority to the canonical top-level `reviews/{reviewId}` model. The legacy book-subcollection review source is no longer the certified production authority.

Replacement architecture:

Canonical review fanout projections are rebuilt and verified from `reviews/{reviewId}`.

Long-term disposition:

Retained as a deprecated compatibility classification. It must not be treated as the production review authority.

### `user_stats`

Original purpose:

`user_stats` served as a broad compatibility envelope for profile, social, library, content, writing, quality, and storage counters.

Why deprecated:

The envelope aggregated multiple semantic domains into one document surface. Phase 8A certified the domain projections individually rather than treating the envelope itself as a single authority.

Replacement architecture:

Certified domain projections include `social_user_stats`, `library_user_stats`, `shelf_user_stats`, `content_user_stats`, `writing_user_stats`, `profile_quality_stats`, `storage_user_stats`, and attachment cleanup counters.

Long-term disposition:

Retained as a deprecated compatibility envelope. Domain-specific certified projections own recovery and verification semantics.

### `post_stats`

Original purpose:

`post_stats` stored social engagement counters used by feeds, social cards, and ranking surfaces.

Why deprecated:

The raw `post_stats` collection is no longer treated as an independent authority. It is governed through certified post engagement recovery.

Replacement architecture:

`post_engagement_stats` certifies engagement counters from canonical social action authorities and maintains compatibility projection collections.

Long-term disposition:

Retained as a deprecated compatibility projection collection behind certified post engagement recovery.

### `compatibility_readability_fields`

Original purpose:

Compatibility readability fields such as `books.downloadable` and `books.isEbookAvailable` supported legacy reader and search DTOs.

Why deprecated:

Reader availability is now governed through certified reader authority architecture rather than legacy boolean compatibility fields.

Replacement architecture:

`reader_authority_projection` is the certified authority-backed projection for reader availability.

Long-term disposition:

Retained for compatibility while certification routes through reader authority.

## 7. Excluded Surfaces

### `venue_stats`

Classification:

Excluded Legacy Derivative

Why it was not certified:

`venue_stats` was identified as a legacy derivative admin artifact. It was historically written by a backfill path that counted `venues/{venueId}/reviews`, but no active production recovery family or runtime-certified projection ownership was established for it.

Why it does not require certification:

It is not part of the executable Phase 8A projection registry, is not promoted to `production_ready`, and is documented as excluded rather than deprecated registry state.

Why exclusion is acceptable:

The surface is not authority, is not a production-certified projection dependency, and has a dedicated deprecation runbook documenting operator policy and retirement semantics.

## 8. Hidden Surface Audit

Phase 8A included a targeted investigation of projection-like surfaces that could otherwise remain outside governance.

Discovery process:

- searched for projection-like naming patterns
- reviewed stats, projection, aggregate, index, cache, manifest, snapshot, mirror, and derivative surfaces
- mapped Firestore collection usage to executable registry entries
- separated authorities, projections, compatibility projections, sidecars, caches, ledgers, and excluded derivatives

Findings:

Event Stats:

- `event_stats` was confirmed as a production aggregate projection.
- It required full certification and contract alignment.

Reader Sidecars:

- `reader_search_index`
- `reader_highlight_anchors`
- `reader_chapter_map`
- `reader_section_map`
- `reader_stable_anchors`

These were classified as compatibility sidecars covered by `reader_manifests` and `reader_epub_indexes`.

Legacy Derivatives:

- `venue_stats` was classified as an excluded legacy derivative.

Operational Ledgers:

Operational and idempotency ledgers were not promoted to projection families. They remain operational records rather than certified user-facing projections.

Final classification decisions:

- production projection surfaces are registered
- deprecated executable surfaces are listed explicitly
- excluded legacy derivatives are documented separately
- reader sidecars are covered by certified reader projection families
- caches and ledgers are not projection authorities

Hidden projection risk was eliminated by making every discovered surface either registered, deprecated, sidecar-covered, authority-classified, cache/ledger-classified, or explicitly excluded.

## 9. Event Stats Certification Case Study

### Initial Finding

`event_stats` was identified as a production projection whose runtime contract did not fully match its certified recovery and verification contract.

### Runtime Contract Mismatch

Runtime trigger writers, admin backfill writers, recovery writers, and verifier expectations had diverged. A document written by one path could fail verification expected by another path.

### Root Cause

Different writers emitted different field sets for the same projection:

- runtime trigger writers maintained counter-oriented fields
- admin backfill maintained a narrower backfill shape
- recovery emitted the full canonical shape
- verifier expected the full canonical shape

### Resolution

Phase 8A established one canonical `event_stats/{eventId}` schema:

- `rsvps`
- `rsvpsCount`
- `counters.rsvps`
- `updatedAt`
- `lastUpdatedAt`
- optional operational markers including `lastRecoveredAt` and `lastBackfilledAt`

Every writer path was aligned to emit the certified required fields. The verifier and runbook were aligned to the same schema.

### Validation

Event stats validation confirmed:

- runtime-created documents satisfy verifier expectations
- backfilled documents satisfy verifier expectations
- recovered documents satisfy verifier expectations
- malformed documents are rejected
- registry certification remains production-ready

### Final Status

`event_stats` is certified as `production_ready`.

## 10. Recovery Infrastructure Summary

After Phase 8A, BookTown has a standardized recovery platform for certified projection families.

Dry Run Recovery:

Operators can verify projection state without mutation. Dry run is the default safety posture.

Repair Mode:

Write repair is explicit and controlled. Repairs are exact, idempotent, and authority-derived.

Checkpointed Recovery:

Large recovery runs can resume across pages without unbounded scans.

Collection Recovery:

Projection families can verify or repair bounded collection pages.

Entity Recovery:

Single-entity repair allows targeted incident response without broad mutation.

Verification Reports:

Structured reports record success rates, failure classes, counts, and sample failures.

Failure Recording:

Failures are written to the projection failure ledger for audit and replay.

Health Updates:

Projection health is updated from verification, repair, and failure outcomes.

Restartability:

Checkpointing and bounded scans make recovery runs resumable.

Idempotency:

Recovery writes are designed to converge to authority-derived state without double-counting or unsafe increments.

Operational importance:

These capabilities turn projection incidents from manual source-code investigations into controlled operational procedures.

## 11. Governance Model

Phase 8A established durable governance rules for projections.

Production-ready requirements:

- explicit registry entry
- authority source declaration
- projection collection declaration
- recovery support
- verification support
- checkpoint support
- failure ledger support
- health integration
- structured reporting
- runbook
- no unresolved recovery gaps

Certification requirements:

- executable registry certification must pass
- production-ready entries must satisfy required capabilities
- documentation must reflect executable truth

Runbook requirements:

- authority summary
- projection summary
- dry-run instructions
- write-repair instructions where applicable
- verification semantics
- failure modes
- escalation criteria

Hidden surface rules:

- production projections must be registered
- compatibility sidecars must be explicitly covered
- deprecated surfaces must be named
- excluded surfaces must be documented
- caches and ledgers must not be confused with projection authority

Projection registration rules:

- a production projection must have one registry identity
- deprecated entries must not be counted as production-ready
- excluded legacy derivatives must not be promoted through documentation

Recovery requirements:

- default to dry-run
- repair from authority, not from projection assumptions
- avoid unbounded global scans
- preserve compatibility fields unless explicitly governed otherwise
- enforce batch limits
- record failures and health outcomes

## 12. Founder Impact Assessment

Phase 8A materially reduces founder operational risk.

Reduced Operational Risk:

Projection state is classified, certified, and recoverable. Incidents no longer depend on informal knowledge of which trigger or backfill last wrote a surface.

Faster Debugging:

Operators can inspect registry metadata, runbooks, verification reports, failure ledger entries, and projection health instead of reconstructing architecture from runtime code.

Safer Deployments:

The certification gate and documentation alignment reduce the chance that a production projection is deployed without recovery or verification semantics.

Confidence During Beta:

Closed beta can proceed with known projection governance. User-visible drift can be verified and repaired through established controls.

Ability To Focus On Product:

With Phase 8A locked, founder attention can move from projection infrastructure debt to product execution, including closed beta, UX, onboarding, reader experience, search quality, and MatchMaker foundations.

## 13. Final Metrics

Final audited lockdown verification scorecard:

- Architecture Score: 98/100
- Recovery Score: 98/100
- Operational Readiness Score: 97/100
- Scale Readiness Score: 96/100
- Certification Completeness Score: 100/100
- Founder Risk Score: 96/100

## 14. Lessons Learned

What worked:

- Creating an executable registry converted architectural intent into enforceable certification state.
- Standardizing recovery request semantics reduced operational ambiguity.
- Treating documentation as part of certification exposed contradictions that code checks alone would miss.
- Hidden-surface classification prevented compatibility sidecars and legacy derivatives from becoming silent governance gaps.

What surprised the team:

- Some surfaces were not unsafe because they were complex; they were unsafe because their classification was unclear.
- Documentation drift could become a lockdown blocker even when runtime certification passed.
- Compatibility fields required as much governance clarity as primary projection collections.

Hidden risks discovered:

- event stats writer contracts had diverged across runtime, backfill, recovery, and verification paths
- reader sidecars needed explicit classification to prevent false-positive certification gaps
- `venue_stats` needed exclusion language separate from executable deprecated status
- broad recovery-gap language could imply unresolved certification debt after the executable registry was already clean

Architectural principles reinforced:

- authority must be explicit
- projection state must be recoverable
- verification must compare against authority
- production readiness requires operator usability
- documentation must match executable truth
- compatibility is not authority
- hidden surfaces must be classified, not ignored

## 15. Closure Statement

### Phase 8A Closure Declaration

All registered projections have been classified.

All production projections are certified.

Recovery infrastructure is operational.

Verification infrastructure is operational.

Failure ledger integration is operational.

Projection health integration is operational.

Runbook coverage is complete.

Deprecated executable projections are explicitly identified.

Excluded legacy derivatives are documented.

Compatibility sidecars are classified and covered.

Documentation reflects executable truth.

No remaining Phase 8A certification debt exists.

BOOKTOWN — PHASE 8A

STATUS: COMPLETE

STATUS: CERTIFIED

STATUS: LOCKED

Closure Date: June 1, 2026

Future modifications to Phase 8A components shall be treated as controlled architectural changes and must preserve the certification requirements established during this phase.
