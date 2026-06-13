---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-DESIGN-SYSTEM-REGISTER
title: "BookTown Design System Platform Register"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Design System Platform Register

Status: Foundation architecture.
Scope: Documentation only.
Owner: Product Engineering / Design System Platform.

## Purpose

The BookTown Design System Platform is the canonical source of truth for product visual language, interaction behavior, accessibility expectations, bilingual UI behavior, reader and writer experience standards, and future native design portability.

BookTown is not a generic SaaS interface. It is a literary intelligence platform spanning reading, writing, discovery, social interpretation, MatchMaker, agents, marketplace, partner surfaces, and administration. The design system must therefore govern both product utility and literary atmosphere.

## Platform Position

The Design System Platform sits beside these core BookTown platforms:

- Data Platform
- Entity Platform
- Literary Knowledge Graph
- Literary Identity Graph
- MatchMaker
- Reader Runtime
- Writer Runtime

Its authority is presentational and interactional. It must not own business logic, persistence logic, entity authority, search ranking, or AI decisioning.

## Canonical Documents

| Document | Authority |
| --- | --- |
| `DESIGN_PHILOSOPHY.md` | Product personality, design doctrine, emotional design principles |
| `BRAND_SYSTEM.md` | Brand architecture, visual identity, logo philosophy, sub-brand strategy |
| `DESIGN_TOKENS.md` | Token hierarchy, semantic tokens, theme architecture, native compatibility |
| `TYPOGRAPHY_SYSTEM.md` | English, Arabic, reader, writer, and accessibility typography |
| `COLOR_SYSTEM.md` | Semantic color model, themes, reader palettes, contrast rules |
| `ICONOGRAPHY_SYSTEM.md` | Icon categories, sizes, states, RTL expectations |
| `SPACING_SYSTEM.md` | Spacing scale, rails, containers, responsive density |
| `MOTION_SYSTEM.md` | Motion hierarchy, durations, reduced-motion requirements |
| `COMPONENT_PRIMITIVES.md` | Primitive layer and component governance |
| `ACCESSIBILITY_SYSTEM.md` | Accessibility governance, keyboard behavior, focus, contrast, reduced motion, and release gates |
| `RTL_LTR_SYSTEM.md` | Arabic/English and RTL/LTR interaction governance |
| `COMPONENT_INVENTORY.md` | Component ownership, status, adoption, accessibility, RTL, dark mode, and deprecation tracking |
| `READER_EXPERIENCE_SYSTEM.md` | Reader environment and relationship to app tokens |
| `WRITER_EXPERIENCE_SYSTEM.md` | Writer environment and creative focus principles |
| `DESIGN_GOVERNANCE.md` | Ownership, review, versioning, and design debt process |
| `DESIGN_SYSTEM_ROADMAP.md` | Migration plan from current implementation to production-grade system |

## Current State Summary

The current product has usable foundations: Tailwind, shared UI components, bilingual text handling, dark mode, reader preferences, motion helpers, custom icons, and app layout rails. It is not yet a complete design system because token authority, component reuse, theme governance, accessibility contracts, and RTL behavior are fragmented.

The system currently contains multiple implementation sources that must be routed through this register and the canonical design-system documents:

- Tailwind extension values.
- `components/ui/tokens.ts`.
- Inline Tailwind configuration in `index.html`.
- Screen-level Tailwind classes.
- Reader-specific theme and typography maps.
- Longform and editor-specific hard-coded styling.
- Legacy root design summaries such as `docs/DESIGN_SYSTEM.md`.

## Design System Invariants

1. Design decisions must have one canonical authority.
2. Product logic remains outside the design system.
3. Components consume semantic tokens, not raw brand colors.
4. Reader and writer experiences may specialize, but must inherit from platform tokens.
5. Arabic and English are first-class, not variants.
6. Accessibility is a release requirement, not an enhancement.
7. New primitives require documented states, keyboard behavior, RTL behavior, and theme behavior.
8. Visual exceptions require explicit governance approval and expiration.

## Implementation Boundary

This architecture defines the target platform. It does not modify current application code, tokens, themes, components, routes, Firebase, functions, or business logic.
