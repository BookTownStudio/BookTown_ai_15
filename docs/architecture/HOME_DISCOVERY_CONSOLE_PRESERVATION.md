---
id: BT-DOCS-ARCHITECTURE-HOME-DISCOVERY-CONSOLE-PRESERVATION
title: "Home Discovery Console Preservation Doctrine"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Home Discovery Console Preservation Doctrine

## Purpose

The Home Discovery Console is BookTown's canonical literary continuity surface. Its job is to help a reader return to reading, discover readable books, and encounter high-quality literary signals from the town without becoming a social feed, merchandising surface, or engagement-maximizing loop.

## Non-Negotiable Boundaries

- Home orchestration remains backend-owned through `getHomeDiscoveryConsole`.
- Home renders at most four experiential layers: Continue Reading, Ready to Read, Discover, and From the Town.
- Empty rows collapse server-side; reserved visual slots are prohibited.
- Algorithmic discovery remains the primary authority.
- Editorial content remains minority-weighted and visually identical to organic content.
- Private writing content must never be read into Home discovery. Only abstract user-owned metadata may influence continuity.
- Home must not add infinite scrolling, notification-driven prompts, feed pagination, or engagement-pressure mechanics.

## Calm UX Doctrine

Home should feel like entering a quiet literary environment. It should not pressure the reader to react, compete, chase trends, or extend a session. Calmness outranks velocity. Meaningful literary resonance outranks popularity spikes.

Operationally, any change that increases `recommendationAggressionScore`, `feedContaminationTrendRisk`, `continuityDriftRisk`, or `editorialOverreachRisk` must be treated as a preservation risk unless it also improves literary quality without increasing volatility.

## Recommendation Ethics

Recommendations should feel like guidance from an intelligent librarian, not a black-box retention system.

- Prefer literary continuity, traditions, form, language, shelves, quotes, and reading cadence over raw engagement.
- Use exploration gently; avoid random discovery and over-personalized loops.
- Keep explanations concise, non-creepy, and literary.
- Do not optimize for session time, outrage, controversy, or reaction volume.

## Editorial Governance

Editors steer discovery; they do not compose Home.

- Ready to Read supports at most two editorial entries, restricted to publicly readable in-app books.
- Discover supports at most two editorial entries.
- From the Town supports at most three editorial entries.
- Expired editorial entries must disappear server-side.
- Hard pins should remain rare and observable.
- Repeated hard-pin behavior, occupancy pressure, and invalid editorial attempts are governance drift signals.

## Ecosystem Continuity

Continuity may use bounded signals from reading, quotes, shelves, writing metadata, and user-scoped search behavior when available. No single subsystem may dominate Home identity. Continuity should evolve slowly enough that one action cannot abruptly reshape Home.

Writing continuity is privacy-constrained: manuscript text, private notes, and unpublished content bodies are outside Home discovery authority.

## Operational Observation

The Home readiness log is the canonical beta observation surface. Operators should monitor:

- `recommendationFatigueRisk`
- `diversityDegradationRisk`
- `explorationFamiliarityDrift`
- `feedContaminationTrendRisk`
- `editorialOverreachRisk`
- `orchestrationVolatilityRisk`
- `runtimeAmplificationRisk`
- `preservationIntegrityScore`

The default response to degraded metrics is bounded tuning, not new surfaces or architectural expansion.

## Guardrail Rule

If a proposed change makes Home louder, longer, more reactive, more commercial, more social-pressure-driven, or more client-orchestrated, it is rejected unless it directly protects reading continuity or literary quality and preserves the four-row doctrine.
