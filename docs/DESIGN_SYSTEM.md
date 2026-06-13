---
id: BT-DOCS-DESIGN-SYSTEM
title: "📘 BookTown Design System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# 📘 BookTown Design System

## UI Canon --- v1.0

Authoritative Production Design Standard

------------------------------------------------------------------------

# 1. Design Philosophy

## 1.1 Core Identity

BookTown UI must feel:

-   Calm\
-   Literary\
-   Precise\
-   Minimal\
-   Intentional\
-   High-end but restrained\
-   Structured yet breathable

We design for readers and thinkers --- not dopamine-driven scrolling.

**Content is primary. Interface is secondary.**

The interface must never compete with text.

------------------------------------------------------------------------

## 1.2 Visual Tone

-   Dark, elegant surfaces\
-   Soft glass layers\
-   Gentle blur\
-   Low-contrast borders\
-   No harsh edges\
-   No heavy shadows\
-   No visual noise

Avoid:

-   Neon UI\
-   Oversaturated colors\
-   Aggressive gradients\
-   High-motion gimmicks

------------------------------------------------------------------------

# 2. Layout System

## 2.1 Spacing Scale

Use only consistent spacing units:

-   4px → `p-1`
-   8px → `p-2`
-   12px → `p-3`
-   16px → `p-4`
-   24px → `p-6`
-   32px → `p-8`

Do not introduce arbitrary spacing values.

------------------------------------------------------------------------

## 2.2 Page Structure

Each primary tab follows:

1.  Header\
2.  Scrollable Content Area\
3.  Optional Floating Interaction Layer

Scrollable containers must use:

`overflow-y-auto`

Avoid nested scroll containers unless explicitly required.

------------------------------------------------------------------------

# 3. Surface System

## 3.1 Primary Card (Canonical Surface)

This defines BookTown's core visual identity (used in Social tab).

`rounded-[0.7rem]`\
`bg-white/5`\
`border border-white/10`\
`backdrop-blur-md`

Rules:

-   Do not change the radius.
-   Do not increase border opacity.
-   Do not stack blur levels.
-   Do not replace with solid backgrounds unless necessary.

------------------------------------------------------------------------

## 3.2 Secondary Surface (Internal Blocks)

Used inside cards only:

`bg-white/3`\
`border border-white/5`\
`rounded-[0.5rem]`

------------------------------------------------------------------------

## 3.3 Elevated Interactive Surface (Popovers / Dropdowns)

`bg-neutral-900/80`\
`backdrop-blur-lg`\
`border border-white/10`\
`rounded-[0.7rem]`

Used for overlays only.

------------------------------------------------------------------------

# 4. Image System

## 4.1 Feed Image Rules

Images must use:

`w-full`\
`h-auto`\
`object-cover`

Never:

-   Use `h-full` in feed context\
-   Force aspect ratio via `aspect-*`\
-   Hardcode heights

------------------------------------------------------------------------

## 4.2 Maximum Height Constraint

To prevent viewport takeover:

`max-h-[72dvh]`

Use only when necessary.

------------------------------------------------------------------------

## 4.3 Borders & Radius

-   Images should inherit container radius\
-   No debug outlines in production\
-   No arbitrary border styles

------------------------------------------------------------------------

# 5. Typography System

## 5.1 Hierarchy

Post Body:

`text-[15px] md:text-[16px]`\
`leading-relaxed`

Metadata:

`text-xs`\
`opacity-60`

Secondary captions:

`text-sm`\
`opacity-70`

------------------------------------------------------------------------

## 5.2 Typography Rules

-   No ALL CAPS titles\
-   No oversized headlines in feed\
-   No dramatic font scaling\
-   Maintain editorial tone

------------------------------------------------------------------------

# 6. Motion System

## 6.1 Standard Transition

`transition-all duration-300 ease-in-out`

Do not exceed 300ms unless modal.

------------------------------------------------------------------------

## 6.2 Micro-Interactions

Allowed:

-   `scale-[1.01]`\
-   Soft opacity fade\
-   Small translate-y transitions

Forbidden:

-   Bounce animations\
-   Large scaling\
-   Parallax\
-   Aggressive transforms

------------------------------------------------------------------------

# 7. Blur & Glass Rules

Standard blur:

`backdrop-blur-md`

Maximum allowed:

`backdrop-blur-lg`

Never stack blur layers.

------------------------------------------------------------------------

# 8. Color System

## 8.1 Base Background

Dark neutral base (e.g., `neutral-950`).

------------------------------------------------------------------------

## 8.2 Accent Color

Primary accent:

`#0077B6`

Use for:

-   Active states\
-   Primary buttons\
-   Focus highlights

Never use as large surface background.

------------------------------------------------------------------------

## 8.3 Border Opacity

Default:

`border-white/10`

Secondary:

`border-white/5`

Never exceed `/15`.

------------------------------------------------------------------------

# 9. Interaction Rules

## 9.1 Primary Button

`rounded-[0.7rem]`\
`bg-[#0077B6]`\
`hover:bg-[#00659c]`

------------------------------------------------------------------------

## 9.2 Secondary Button

`bg-white/5`\
`border border-white/10`\
`rounded-[0.7rem]`

------------------------------------------------------------------------

## 9.3 Icons

-   Subtle by default\
-   Opacity \~70%\
-   Hover → 100%\
-   No oversized icons

------------------------------------------------------------------------

# 10. Architecture Rules

## 10.1 No Visual Drift

New components must:

-   Reuse canonical surface classes\
-   Follow spacing scale\
-   Follow typography hierarchy

If deviation is needed:

1.  Update this document first\
2.  Then implement

------------------------------------------------------------------------

## 10.2 Inline Styles

Inline styles are allowed only for:

-   Dynamic runtime values\
-   Rare positioning cases

Never for:

-   Layout hacks\
-   Radius overrides\
-   Height fixes

------------------------------------------------------------------------

# 11. Forbidden Patterns

Do NOT:

-   Use `h-full` on feed images\
-   Introduce new radius values\
-   Add new blur intensities\
-   Increase border opacity beyond standard\
-   Hardcode fixed pixel heights\
-   Introduce heavy shadows\
-   Create random opacity variations

------------------------------------------------------------------------

# 12. Surface Parity Rule

All primary tabs must visually align:

-   Social\
-   Read\
-   Write\
-   Discover\
-   Drawer\
-   Profile

They are one cohesive system.

------------------------------------------------------------------------

# 13. Governance

When implementing new features:

1.  Check this file\
2.  Reuse existing surface styles\
3.  Reuse spacing scale\
4.  Avoid improvisation\
5.  Document changes before implementation

This document is the single source of truth for UI.

------------------------------------------------------------------------

# 14. Long-Term Evolution

Future extensions may include:

-   Extracted `designTokens.ts`\
-   Theme variants\
-   Accessibility mode\
-   Exhibition styling\
-   Admin variant styling

All evolutions must preserve:

**Calm. Literary. Structured. Minimal.**

------------------------------------------------------------------------

# 15. Final Principle

BookTown is not a social media app.

It is a literary ecosystem.

The UI must feel like a modern digital library ---\
not a feed engine.
