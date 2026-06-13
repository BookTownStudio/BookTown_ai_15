---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-COMPONENT-INVENTORY
title: "BookTown Component Inventory"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Component Inventory

## Purpose

This document defines the authoritative inventory structure for Design System components. It tracks component ownership, governance status, accessibility status, RTL status, dark mode status, adoption status, and deprecation status.

This document does not create, rename, or modify runtime components.

## Scope

In scope:

- Component governance inventory.
- Primitive and product component classification.
- Adoption status.
- Accessibility, RTL, and dark mode status.
- Deprecation tracking.

Out of scope:

- Runtime component implementation.
- Component API changes.
- Visual redesign.
- Product behavior decisions.

## Inventory Authority

Component inventory authority flows through:

1. [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
2. [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
3. [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md)
4. This document.

## Inventory Fields

Every governed component entry must include:

| Field | Required | Meaning |
|---|---|---|
| Component | Yes | Stable component or primitive name. |
| Category | Yes | Primitive, composite, domain, layout, icon, feedback, navigation, input, overlay, reader, writer, admin, or legacy. |
| Owner | Yes | Owning platform or domain. |
| Status | Yes | Proposed, active, governed, deprecated, or archived. |
| Accessibility Status | Yes | Unknown, partial, governed, validated, or blocked. |
| RTL Status | Yes | Unknown, partial, governed, validated, or not-applicable. |
| Dark Mode Status | Yes | Unknown, partial, governed, validated, or not-applicable. |
| Adoption Status | Yes | Experimental, partial, recommended, standard, legacy, or blocked. |
| Deprecation Status | Yes | None, planned, deprecated, blocked-from-new-use, or archived. |

## Status Definitions

| Status | Meaning |
|---|---|
| Proposed | Candidate component or primitive under design review. |
| Active | Used in product but not fully governed. |
| Governed | Documented behavior, states, accessibility, RTL, and theme behavior exist. |
| Deprecated | Retained temporarily while migration occurs. |
| Archived | Historical record only; not for active use. |

## Required Component Families

Initial inventory coverage must include:

| Component | Category | Owner | Status | Accessibility Status | RTL Status | Dark Mode Status | Adoption Status | Deprecation Status |
|---|---|---|---|---|---|---|---|---|
| Button | Primitive | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Input | Primitive | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Card | Primitive | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Modal/Dialog | Overlay | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Sheet/Drawer | Overlay | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Tabs | Navigation | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Navigation rail | Navigation | Design System | Active | Partial | Partial | Partial | Partial | None |
| Icon button | Primitive | Design System | Active | Partial | Partial | Partial | Recommended | None |
| Status banner | Feedback | Design System | Proposed | Unknown | Unknown | Unknown | Experimental | None |
| Reader chrome | Reader | Reader Platform; Design System | Active | Partial | Partial | Partial | Partial | None |
| Writer toolbar | Writer | Writing Platform; Design System | Active | Partial | Partial | Partial | Partial | None |
| Admin table | Admin | Control Plane; Design System | Active | Partial | Partial | Partial | Partial | None |

## Adoption Rules

1. Product teams should prefer standard or recommended components before creating local patterns.
2. Active components may be used, but new high-traffic surfaces should not depend on unresolved accessibility, RTL, or theme gaps without review.
3. Deprecated components must declare a migration target.
4. Legacy components must not become new product defaults.
5. Component status changes require Design Governance review.

## Review Cadence

Component inventory should be reviewed when:

- A new primitive is introduced.
- A product surface adopts a new reusable pattern.
- Accessibility, RTL, or dark mode validation changes.
- A component becomes deprecated.
- A design-system migration phase completes.

## Related Documents

- [MASTER_DESIGN_SYSTEM.md](../../master/MASTER_DESIGN_SYSTEM.md)
- [DESIGN_SYSTEM_REGISTER.md](DESIGN_SYSTEM_REGISTER.md)
- [DESIGN_GOVERNANCE.md](DESIGN_GOVERNANCE.md)
- [COMPONENT_PRIMITIVES.md](COMPONENT_PRIMITIVES.md)
- [ACCESSIBILITY_SYSTEM.md](ACCESSIBILITY_SYSTEM.md)
- [RTL_LTR_SYSTEM.md](RTL_LTR_SYSTEM.md)

