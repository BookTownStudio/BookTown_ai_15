---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-RTL-LTR-SYSTEM
title: "BookTown RTL/LTR Interaction System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown RTL/LTR Interaction System

## Purpose

This document is the authoritative Design System document for bilingual interaction governance. It defines how BookTown treats Arabic and English as first-class interface outputs across layout, typography, iconography, navigation, reader, writer, and component primitives.

## Scope

In scope:

- RTL and LTR layout behavior.
- Arabic and English typography behavior.
- Directional icon behavior.
- Component primitive direction requirements.
- Reader and writer bilingual behavior.
- Bilingual QA expectations.

Out of scope:

- Translation content strategy.
- Locale detection implementation.
- New runtime i18n behavior.
- Product-specific Arabic copy decisions.

## Authority

Bilingual interaction authority flows through:

1. [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
2. [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
3. This document.
4. [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md), [ICONOGRAPHY_SYSTEM.md](ICONOGRAPHY_SYSTEM.md), and [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md).

## Core Principles

1. Arabic and English are equal system outputs.
2. RTL is not a mirrored afterthought.
3. Directional behavior belongs to primitives and layout rules, not ad hoc screen fixes.
4. Text direction, icon direction, reading direction, and navigation direction must be governed separately.
5. Reader and writer surfaces may specialize bilingual behavior but must inherit platform rules.

## Layout Direction

Root layout direction must follow the active language or explicit content direction.

Governed behavior:

- Page rails must support RTL and LTR.
- Navigation order must remain logical in both directions.
- Inline metadata must preserve readable order.
- Mixed-language content must not force incorrect direction globally.
- Overlays, drawers, and sheets must define side behavior in both directions.

## Typography Direction

Typography rules are governed by [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md).

Required rules:

- Arabic UI must not reuse English uppercase conventions.
- Arabic line-height and weight may require language-specific tuning.
- Arabic reading typography must preserve comfortable measure and rhythm.
- Mixed Arabic/English metadata must avoid broken punctuation or reversed entity order.

## Icon Direction

Icon behavior is governed by [ICONOGRAPHY_SYSTEM.md](ICONOGRAPHY_SYSTEM.md).

Icons that must mirror in RTL include:

- Back and forward.
- Chevron-left and chevron-right.
- Indent and outdent.
- Previous and next when spatial.
- Directional navigation arrows.

Icons that normally must not mirror include:

- Brand marks.
- Media play.
- Search.
- Settings.
- Status symbols.
- External provider marks.

## Component Requirements

Each primitive must document:

- LTR behavior.
- RTL behavior.
- Directional icon behavior.
- Focus order.
- Keyboard order.
- Label alignment.
- Density behavior in Arabic and English.
- Theme compatibility in both directions.

## Reader Requirements

Reader surfaces must support:

- Arabic reading behavior.
- English reading behavior.
- Mixed-language metadata.
- Direction-safe progress and location controls.
- Direction-safe highlights and annotations where supported.
- Reader chrome that does not obscure text in either direction.

## Writer Requirements

Writer surfaces must support:

- Direction-aware manuscript blocks.
- Stable cursor behavior.
- Language-aware editor chrome.
- Direction-safe toolbar and sheet behavior.
- Mixed-language drafting without screen-level overrides.

## QA Gates

Bilingual design review must include:

- Light and dark mode in RTL and LTR.
- Keyboard navigation in RTL and LTR.
- Mobile and desktop layout checks.
- Reader and writer critical paths.
- Icon mirroring checks.
- Mixed-language metadata checks.

## Related Documents

- [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
- [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
- [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md)
- [ICONOGRAPHY_SYSTEM.md](ICONOGRAPHY_SYSTEM.md)
- [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md)
- [READER_EXPERIENCE_SYSTEM.md](READER_EXPERIENCE_SYSTEM.md)
- [WRITER_EXPERIENCE_SYSTEM.md](WRITER_EXPERIENCE_SYSTEM.md)

