---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-SPACING-SYSTEM
title: "BookTown Spacing System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Spacing System

Status: Foundation architecture.

## Spacing Philosophy

Spacing controls rhythm, density, and attention. BookTown needs calm reader layouts, efficient writing tools, expressive discovery surfaces, dense admin screens, and mobile-safe navigation. These modes require one spacing system with governed density variants.

## Spacing Scale

The production scale should be tokenized and platform-neutral.

| Token | Value | Usage |
| --- | ---: | --- |
| `space.0` | 0 | Reset |
| `space.1` | 4px | Tight icon/text gaps |
| `space.2` | 8px | Compact internal spacing |
| `space.3` | 12px | Control gaps |
| `space.4` | 16px | Default padding |
| `space.5` | 20px | Dense section spacing |
| `space.6` | 24px | Card and modal padding |
| `space.8` | 32px | Page section spacing |
| `space.10` | 40px | Large section breaks |
| `space.12` | 48px | Editorial spacing |
| `space.16` | 64px | Major page rhythm |

Arbitrary spacing values require governance when used outside special rendering surfaces.

## Layout Philosophy

BookTown layout uses rails, not unbounded full-width content. Current app rails are a good foundation and should become semantic container tokens.

Canonical rails:

- Compact rail: forms, settings, focused tasks.
- Default rail: normal app content.
- Reading rail: prose and longform content.
- Social rail: feed width.
- Wide rail: discovery/detail pages.
- Admin rail: operational dashboards.

## Container Strategy

Containers must define:

- Max width.
- Inline padding.
- Safe-area behavior.
- Breakpoint changes.
- Scroll ownership.
- Bottom navigation clearance.

Reader and editor containers may specialize but must publish their constraints as domain tokens.

## Responsive Strategy

Mobile:

- Respect safe areas.
- Maintain 44px minimum touch targets.
- Avoid horizontal scrolling.
- Prefer single-column flows.

Tablet:

- Preserve content measure.
- Avoid stretching cards without purpose.
- Keep navigation predictable.

Desktop:

- Use rails and side affordances.
- Increase density where useful.
- Avoid decorative empty space in operational views.

## Density Modes

Required density modes:

- Comfortable: reader, profile, discovery, onboarding.
- Standard: most app screens.
- Compact: admin, lists, filters, metadata-heavy views.
- Focus: writer and reader immersive modes.

Density changes must be token-driven, not screen-specific class rewrites.
