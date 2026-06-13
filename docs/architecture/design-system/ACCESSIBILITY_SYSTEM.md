---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-ACCESSIBILITY-SYSTEM
title: "BookTown Accessibility System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Accessibility System

## Purpose

This document is the authoritative Design System document for accessibility governance. It consolidates accessibility expectations for tokens, primitives, themes, typography, motion, reader/writer experiences, and product-surface adoption without changing runtime implementation.

Accessibility is a release requirement. It is not a visual enhancement, optional QA pass, or screen-level exception.

## Scope

In scope:

- Keyboard behavior.
- Focus visibility and focus return.
- Screen-reader semantics.
- Color contrast.
- Motion reduction.
- Touch targets and hit areas.
- Reader and writer accessibility expectations.
- Accessibility review gates for design-system changes.

Out of scope:

- New component implementations.
- New runtime testing tools.
- New product behavior.
- New legal compliance claims.

## Authority

Accessibility authority flows through:

1. [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
2. [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
3. This document.
4. Component and domain-specific documents where routed.

Component-specific accessibility behavior is governed by [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md). Typography and color accessibility are governed by [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md) and [COLOR_SYSTEM.md](COLOR_SYSTEM.md).

## Accessibility Principles

1. Every interactive element must be reachable by keyboard where the platform supports keyboard interaction.
2. Focus state must be visible, deterministic, and theme-safe.
3. Icon-only controls require localized accessible labels.
4. Color cannot be the only carrier of meaning.
5. Motion must respect reduced-motion preference.
6. Reader and writer surfaces must preserve long-session comfort and assistive technology usability.
7. Accessibility behavior belongs to primitives first, not repeated screen-level fixes.

## Keyboard Governance

Keyboard behavior must be documented for:

- Buttons.
- Links.
- Inputs.
- Menus.
- Tabs.
- Dialogs.
- Sheets.
- Drawers.
- Reader controls.
- Editor controls.

New primitives must document keyboard entry, activation, escape/cancel behavior, focus movement, and focus restoration.

## Focus Governance

Focus states must:

- Use semantic focus tokens.
- Meet contrast requirements in light and dark themes.
- Remain visible in RTL and LTR layouts.
- Avoid being hidden by overlays, sticky chrome, or scroll containers.
- Return focus to the invoking control after modal, sheet, or drawer close.

## Screen-Reader Governance

Screen-reader behavior must use semantic HTML and ARIA only where native semantics are insufficient.

Required rules:

- Buttons must have names.
- Form controls must have labels.
- Dynamic status changes must use governed live-region behavior.
- Decorative icons must be hidden from assistive technology.
- Entity cards must expose clear title, author/source, and action semantics.

## Contrast Governance

Color pairs must target WCAG AA minimums for normal text, large text, controls, focus rings, and status indicators.

Design tokens must identify:

- Text/background pairs.
- Focus ring pairs.
- Disabled state pairs.
- Error/warning/success/info pairs.
- Reader paper/ink pairs.
- Dark and light mode pairs.

## Motion Accessibility

Motion must follow [MOTION_SYSTEM.md](MOTION_SYSTEM.md).

Reduced-motion behavior must:

- Disable decorative motion.
- Replace large transitions with instant or opacity-only state changes.
- Preserve meaning and continuity.
- Avoid layout shifts in reader and writer surfaces.

## Touch And Pointer Governance

Interactive targets must be sized and spaced for touch use where surfaces are mobile or tablet reachable.

Dense admin surfaces may use compact density only when labels, focus state, and error recovery remain clear.

## Release Gates

Design-system release review must verify:

- Keyboard smoke coverage for critical primitives.
- Focus visibility in light and dark themes.
- RTL accessibility smoke coverage.
- Reduced-motion behavior for motion-enabled primitives.
- Screen-reader names for icon-only and composite controls.
- Reader and writer critical-path accessibility.

## Debt Handling

Accessibility debt must declare:

- Owner.
- Affected component or surface.
- User impact.
- Temporary mitigation.
- Expiration or review date.
- Migration target.

Unowned accessibility debt is not allowed.

## Related Documents

- [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
- [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
- [DESIGN_GOVERNANCE.md](DESIGN_GOVERNANCE.md)
- [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md)
- [COLOR_SYSTEM.md](COLOR_SYSTEM.md)
- [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md)
- [MOTION_SYSTEM.md](MOTION_SYSTEM.md)
- [READER_EXPERIENCE_SYSTEM.md](READER_EXPERIENCE_SYSTEM.md)
- [WRITER_EXPERIENCE_SYSTEM.md](WRITER_EXPERIENCE_SYSTEM.md)

