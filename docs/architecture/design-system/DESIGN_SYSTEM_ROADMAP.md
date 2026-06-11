# BookTown Design System Roadmap

Status: Foundation architecture.

## Current State

BookTown has a functioning UI layer with useful foundations:

- Tailwind.
- Shared UI components.
- Bilingual text component.
- Dark mode provider.
- Reader preferences.
- Layout rails.
- Motion helpers.
- Custom icons.
- Domain-specific cards and modals.

The system is not yet production-grade because token authority, theme behavior, component reuse, accessibility contracts, RTL behavior, and brand governance are fragmented.

## Target State

BookTown should have a governed Design System Platform with:

- One semantic token source of truth.
- Generated web and future native token outputs.
- Canonical primitives.
- Accessible dialog, navigation, form, and feedback patterns.
- Unified light/dark/reader theme model.
- First-class Arabic and English support.
- Reader and writer domain subsystems.
- Visual regression and accessibility gates.
- Versioned governance.

## Phase 0: Documentation Foundation

Status: This document set.

Deliverables:

- Design philosophy.
- Brand architecture.
- Token architecture.
- Typography architecture.
- Color architecture.
- Component primitive architecture.
- Reader and writer architecture.
- Governance and roadmap.

## Phase 1: Token Authority

Goal: establish a platform-neutral token source of truth.

Work:

- Define token JSON/schema.
- Map existing Tailwind values.
- Map current reader colors and typography.
- Map longform/editor exceptions.
- Generate Tailwind extension values from tokens.
- Remove duplicate inline token definitions after implementation planning.

Milestone: no new semantic styling is added outside tokens.

## Phase 2: Primitive Hardening

Goal: make core controls production-grade.

Work:

- Button and IconButton.
- Input and Textarea.
- Dialog/Modal and Sheet.
- Card/Surface.
- Badge/Chip.
- Tabs/Menu/Popover.
- Toast/Snackbar.
- NavigationItem.

Milestone: new screens use primitives by default.

## Phase 3: Accessibility And RTL

Goal: make accessibility and bilingual layout systemic.

Work:

- Root `lang` and `dir` management.
- Focus trap and focus return.
- Keyboard navigation contracts.
- Reduced-motion handling.
- Contrast validation.
- Logical spacing migration plan.
- Screen-reader labeling rules.

Milestone: critical user flows pass light/dark/RTL keyboard smoke tests.

## Phase 4: Reader And Writer Domain Systems

Goal: govern the highest-value product experiences.

Work:

- Reader paper/ink/chrome tokens.
- Reader controls as primitives.
- Reader typography scale.
- Writer manuscript/editor tokens.
- Toolbar primitive alignment.
- Save/conflict/recovery status patterns.

Milestone: reader and writer no longer rely on ungoverned hard-coded visual systems.

## Phase 5: Product Surface Migration

Goal: migrate domain screens without changing business logic.

Priority order:

1. Auth and shell.
2. Reader.
3. Writer.
4. Book details and publication reader.
5. Search and discovery.
6. Social feed and composer.
7. Shelves/profile.
8. Marketplace/partner surfaces.
9. Admin.

Milestone: raw controls, hard-coded colors, and duplicated card patterns are reduced below approved thresholds.

## Phase 6: Governance Automation

Goal: enforce the design system in CI.

Work:

- Raw color linting.
- Arbitrary value reporting.
- Primitive import guidance.
- Visual regression snapshots.
- Accessibility checks.
- Token schema validation.
- Deprecation reports.

Milestone: design-system drift is blocked before release.

## Production-Grade Milestones

BookTown can call the design system production-grade when:

- All core tokens are semantic and versioned.
- Core primitives are accessible and documented.
- App, reader, and writer themes are unified.
- RTL is root-level and primitive-supported.
- Visual regression exists for critical surfaces.
- New product work cannot bypass primitives without documented exception.
