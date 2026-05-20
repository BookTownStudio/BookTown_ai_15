# Phase 8 Beta Readiness Assessment

## Launch Posture

BookTown is ready for controlled beta observation, not broad growth optimization. The platform now has a canonical backend-owned Home Discovery Console, reader continuity authority, preservation doctrine, editorial governance, recommendation diagnostics, and ecosystem continuity safeguards.

Launch confidence: controlled beta ready with operational observation required.

## Reader Stability

Reader authority remains server-owned through reading progress, reader sessions, manifest resolution, and signed URL infrastructure. Beta validation should focus on continuity under device switching, signed URL refresh, highlight persistence, large-book rendering, and offline recovery. No Phase 8 changes move progress authority to the frontend.

Operational gate: any reader change that creates client-owned progress truth is rejected.

## Search And Discovery

Search remains a discovery input, not a volatile recommendation authority. Current Home continuity only gives user-scoped search clicks a small bounded weight when those events are available. This preserves multilingual and canonical search authority while preventing search-driven recommendation swings.

Known beta observation item: search query telemetry is not yet consistently user-scoped, so Search-to-Home continuity is intentionally conservative.

## Social And Discussion Quality

From the Town remains a bounded literary signal row, not a chronological feed. Ranking favors literary attachments, thoughtful discussion depth, bookmarks, cultural terms, and quote/shelf resonance over shallow reaction volume.

Operational gate: engagement spikes do not outrank literary quality or moderation visibility.

## Writing Privacy

Home continuity may use only abstract writing metadata such as title, type, and status. Manuscript body content, private notes, editor text, and unpublished content bodies are outside Home discovery authority.

Automated guardrail: `scripts/betaReadinessGuardrails.mjs` blocks obvious manuscript-content reads from the Home continuity assembler.

## Cross-System Continuity

Home now observes reading, quotes, shelves, writing metadata, and user-scoped search continuity through bounded weights. No single subsystem may dominate Home identity. Continuity should evolve slowly and preserve calm literary coherence.

Key runtime metrics:

- `continuityCoherenceScore`
- `crossSystemDiversityScore`
- `continuityDriftRisk`
- `literaryIdentityStability`
- `ecosystemCalmScore`

## Moderation And Governance

Editorial entries remain capped, expiring, minority-weighted, and visually identical to organic entries. The beta risk is operational overuse, not missing capability.

Key runtime metrics:

- `editorialOverreachRisk`
- `editorialCalibration.occupancyAttempts`
- `editorialCalibration.hardPins`
- `expiredEditorialFiltered`
- `invalidEditorialFiltered`

## Runtime Observation

The Home readiness log is the first beta observation surface. It tracks recommendation quality, emotional tone, continuity stability, editorial pressure, preservation integrity, Firestore read amplification, and latency targets.

Key preservation metrics:

- `recommendationFatigueRisk`
- `diversityDegradationRisk`
- `explorationFamiliarityDrift`
- `feedContaminationTrendRisk`
- `orchestrationVolatilityRisk`
- `runtimeAmplificationRisk`
- `preservationIntegrityScore`

## Mobile And Low-Network Readiness

The current build preserves lightweight Home rendering and backend-prehydrated DTOs. Mobile beta observation should validate cold start, carousel smoothness, image stability, memory pressure, and reader recovery under constrained network conditions.

Operational gate: do not add new Home rows, pagination, animation systems, or client-side orchestration to solve beta feedback.

## Preservation Guardrails

Automated guardrails now run during `npm run build` via `production-truth:check`. They enforce:

- Four-row Home doctrine.
- Backend Home callable presence.
- Preservation doctrine presence.
- Preservation and ecosystem continuity logging.
- No obvious private manuscript-content reads in Home continuity.
- No infinite-feed mechanics in Home.
- No notification-pressure coupling in Home.
- Frontend consumption of the backend Home console hook.

## Primary Beta Risks

- Firestore amplification may need tuning after real beta traffic.
- Search continuity is intentionally limited until search events are consistently user-scoped.
- Editorial governance needs observation to prevent hard-pin overuse.
- Large reader assets and low-network behavior still require device-lab validation.

## Decision

Proceed to controlled beta with observation. Do not start major recommendation expansion, vector infrastructure, social-feed mechanics, or Home UX redesign until beta metrics show stable preservation integrity and reader continuity under real usage.
