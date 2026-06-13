---
id: BT-MASTER-DESIGN-SYSTEM-001
title: "BookTown Design System Master Document"
status: active
authority_level: master
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Design System Master Document

## Purpose

This document is the Master Layer entry point for the BookTown Design System, tokens, UI governance, and component authority. It summarizes authority and routes to lower-level design sources without replacing design-system documents or component implementation.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Design system governance.
- Design tokens.
- Component primitives.
- Typography, spacing, color, motion, brand, and iconography.
- Reader and writer experience systems.
- UI component authority and product surface consistency.

Out of scope:

- New visual design direction.
- New components.
- New token values.
- New product UX behavior.

## Runtime Authority

Runtime authority currently lives in:

- `components/ui/*`
- `components/layout/*`
- `components/icons/*`
- `components/content/*`

Component implementation owns rendered UI behavior. Design-system documentation owns visual language, token intent, governance, and component usage authority.

## Documentation Authority

Primary authority documents:

- [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md)
- [DESIGN_GOVERNANCE.md](../architecture/design-system/DESIGN_GOVERNANCE.md)
- [DESIGN_TOKENS.md](../architecture/design-system/DESIGN_TOKENS.md)
- [COMPONENT_PRIMITIVES.md](../architecture/design-system/COMPONENT_PRIMITIVES.md)
- [TYPOGRAPHY_SYSTEM.md](../architecture/design-system/TYPOGRAPHY_SYSTEM.md)
- [COLOR_SYSTEM.md](../architecture/design-system/COLOR_SYSTEM.md)
- [SPACING_SYSTEM.md](../architecture/design-system/SPACING_SYSTEM.md)
- [MOTION_SYSTEM.md](../architecture/design-system/MOTION_SYSTEM.md)
- [ICONOGRAPHY_SYSTEM.md](../architecture/design-system/ICONOGRAPHY_SYSTEM.md)
- [BRAND_SYSTEM.md](../architecture/design-system/BRAND_SYSTEM.md)
- [ACCESSIBILITY_SYSTEM.md](../architecture/design-system/ACCESSIBILITY_SYSTEM.md)
- [RTL_LTR_SYSTEM.md](../architecture/design-system/RTL_LTR_SYSTEM.md)
- [COMPONENT_INVENTORY.md](../architecture/design-system/COMPONENT_INVENTORY.md)
- [READER_EXPERIENCE_SYSTEM.md](../architecture/design-system/READER_EXPERIENCE_SYSTEM.md)
- [WRITER_EXPERIENCE_SYSTEM.md](../architecture/design-system/WRITER_EXPERIENCE_SYSTEM.md)

Related Vision:

- [EXPERIENCE_VISION.md](../vision/EXPERIENCE_VISION.md)

## System Architecture

The Design System is BookTown's frontend platform for consistent visual language, reusable components, tokens, motion, layout, accessibility direction, and domain-specific reading/writing experience patterns.

The architecture separates:

- Product experience vision.
- Design governance.
- Token systems.
- Component primitives.
- Domain-specific experience systems.
- Runtime component implementation.

## Core Components

| Component | Role |
|---|---|
| Design register | Routes design authority and maturity. |
| Tokens | Define reusable styling values. |
| Component primitives | Provide standard UI building blocks. |
| Typography/color/spacing/motion | Define core visual systems. |
| Iconography | Defines icon usage and visual semantics. |
| Brand system | Defines brand expression. |
| Accessibility system | Governs keyboard, focus, screen-reader, contrast, reduced-motion, and release-gate expectations. |
| RTL/LTR system | Governs Arabic/English and direction-aware interaction behavior. |
| Component inventory | Tracks component ownership, status, adoption, accessibility, RTL, dark mode, and deprecation status. |
| Reader experience system | Governs reader-specific UX. |
| Writer experience system | Governs writer-specific UX. |

## Data Authority

| Data | Authority |
|---|---|
| Token intent | Design token docs. |
| Runtime component behavior | Component implementation. |
| Product behavior | Product and domain Master docs, not design system. |
| Reader experience principles | Reader and design-system docs. |
| Writer experience principles | Writer and design-system docs. |
| Accessibility expectations | [ACCESSIBILITY_SYSTEM.md](../architecture/design-system/ACCESSIBILITY_SYSTEM.md), design governance, and component implementation. |
| RTL/LTR expectations | [RTL_LTR_SYSTEM.md](../architecture/design-system/RTL_LTR_SYSTEM.md), typography, iconography, and component primitives. |
| Component inventory status | [COMPONENT_INVENTORY.md](../architecture/design-system/COMPONENT_INVENTORY.md). |

## User-Facing Surfaces

The Design System supports all user-facing surfaces, including:

- Home and discovery.
- Reader.
- Search.
- Book, author, and quote details.
- Social and messaging.
- Writing and publishing.
- Admin and operational dashboards.
- Public web pages.

## Operational Dependencies

- Frontend component library.
- Product surfaces.
- Accessibility review.
- Visual regression and QA processes where present.
- Documentation governance for design changes.

## Projection Dependencies

Design System has no direct projection ownership. It consumes display-ready data from product and projection systems but does not own projection authority.

## Governance Rules

- Design System must not define business logic.
- Product behavior belongs to product/domain documents.
- Components should consume typed data and render consistently.
- Token and component changes should route through design governance.
- Design docs are authority for UI language only within their scope.
- Root or legacy design summaries should route through the design-system register.
- `docs/DESIGN_SYSTEM.md` is superseded historical context and must not override the register or routed design-system authority documents.

## Current Maturity

Product maturity: Functional platform.

Architecture maturity: Governed.

Documentation maturity: Good.

Readiness: Internal Ready.

## Known Gaps

- Implementation migration remains partial across surfaces.
- Design governance should be connected to automated UI review over time.
- Public Web and Admin surfaces may need more explicit design-system adoption rules.
- Component inventory validation should be expanded as implementation migration proceeds.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_PRODUCT_MAP.md](MASTER_PRODUCT_MAP.md)
- [EXPERIENCE_VISION.md](../vision/EXPERIENCE_VISION.md)
- [DESIGN_SYSTEM_REGISTER.md](../architecture/design-system/DESIGN_SYSTEM_REGISTER.md)
- [DESIGN_GOVERNANCE.md](../architecture/design-system/DESIGN_GOVERNANCE.md)
- [ACCESSIBILITY_SYSTEM.md](../architecture/design-system/ACCESSIBILITY_SYSTEM.md)
- [RTL_LTR_SYSTEM.md](../architecture/design-system/RTL_LTR_SYSTEM.md)
- [COMPONENT_INVENTORY.md](../architecture/design-system/COMPONENT_INVENTORY.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| UI primitives | Design System | `components/ui/*` | Component primitive docs and design register. |
| Tokens | Design System | UI token implementation | Token docs. |
| Visual systems | Design System | UI/component implementation | Typography, color, spacing, motion, icon docs. |
| Accessibility | Design System; QA/Release | Component implementation and review gates | Accessibility system and design governance. |
| RTL/LTR behavior | Design System; Product Owners | Component/layout implementation | RTL/LTR system, typography, iconography, and primitive docs. |
| Component inventory | Design System | Component implementation evidence | Component inventory. |
| Domain experience systems | Design System; Product Owners | Product components | Reader/writer experience docs. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Product surfaces | Downstream | All product surfaces consume design primitives. |
| Experience Vision | Upstream | Vision defines desired feel. |
| Accessibility | Cross-cutting | Design system must preserve accessibility expectations. |
| RTL/LTR | Cross-cutting | Bilingual product behavior must be governed across primitives and surfaces. |
| Contracts/API | Upstream | Components consume typed data. |

## Authority Routing

| Question | Route |
|---|---|
| Design governance | [DESIGN_GOVERNANCE.md](../architecture/design-system/DESIGN_GOVERNANCE.md). |
| Component primitives | [COMPONENT_PRIMITIVES.md](../architecture/design-system/COMPONENT_PRIMITIVES.md). |
| Component inventory and adoption status | [COMPONENT_INVENTORY.md](../architecture/design-system/COMPONENT_INVENTORY.md). |
| Tokens | [DESIGN_TOKENS.md](../architecture/design-system/DESIGN_TOKENS.md). |
| Accessibility | [ACCESSIBILITY_SYSTEM.md](../architecture/design-system/ACCESSIBILITY_SYSTEM.md). |
| RTL/LTR and bilingual interaction behavior | [RTL_LTR_SYSTEM.md](../architecture/design-system/RTL_LTR_SYSTEM.md). |
| Reader/writer UX | Reader/Writer experience docs plus relevant product Master. |
| Product behavior | Relevant product/domain Master, not Design System. |

## Future Evolution

Future design-system changes should be recorded in design-system authority documents and reflected here as routing updates. This Master document must not introduce new visual rules or component behavior directly.
