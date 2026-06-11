# BookTown Design Tokens

Status: Foundation architecture.

## Token Philosophy

Tokens are the contract between design decisions and implementation. BookTown tokens must express semantic intent, not just raw color, size, or class names.

The design system must move from utility-class reuse to typed semantic tokens that can support web, PWA, and future native applications.

## Token Hierarchy

BookTown uses four token layers.

| Layer | Purpose | Example |
| --- | --- | --- |
| Base | Raw values with no product meaning | `blue.600`, `space.4`, `radius.2` |
| Semantic | Product meaning | `color.action.primary.bg` |
| Component | Primitive-level mapping | `button.primary.background` |
| Domain | Reader/writer/social specialization | `reader.paper.sepia.bg` |

Base tokens are never consumed directly by product screens. Screens consume primitives, and primitives consume semantic/component tokens.

## Required Token Families

- Color
- Typography
- Spacing
- Radius
- Border
- Shadow
- Elevation
- Motion duration
- Motion easing
- Opacity
- Z-index
- Breakpoint
- Container
- Focus ring
- Touch target
- Reader paper/ink
- Writer editor surface

## Semantic Color Token Model

Minimum semantic roles:

- `color.surface.canvas`
- `color.surface.panel`
- `color.surface.elevated`
- `color.surface.overlay`
- `color.text.primary`
- `color.text.secondary`
- `color.text.muted`
- `color.text.inverse`
- `color.border.default`
- `color.border.strong`
- `color.action.primary`
- `color.action.secondary`
- `color.action.ghost`
- `color.status.success`
- `color.status.warning`
- `color.status.danger`
- `color.status.info`
- `color.focus.ring`

## Theme Architecture

The app theme contract must support:

- Light
- Dark
- System preference
- Reader-specific themes: light, dark, sepia

Reader themes must be domain tokens that inherit from global semantics where possible and specialize only paper, ink, chrome, selection, highlight, and annotation surfaces.

## Current Implementation Mapping

Current sources to consolidate:

- Tailwind extension values.
- `components/ui/tokens.ts`.
- Inline Tailwind configuration in `index.html`.
- Reader theme maps.
- Longform hard-coded palette.
- Editor hard-coded ProseMirror/Tiptap styles.

The target state is one token package that generates or feeds Tailwind, component mappings, docs, and future native tokens.

## Native Compatibility

Tokens must be serializable into platform-neutral JSON. Web-specific class strings are not a valid source of truth.

Required properties:

- Stable token names.
- Explicit light/dark values.
- Type metadata.
- Deprecation metadata.
- Version metadata.
- Accessibility notes for color pairs.

## Token Change Rules

1. Semantic token changes require visual regression coverage.
2. Base token changes require mapped impact review.
3. Removing a token requires deprecation before deletion.
4. Component tokens may not bypass semantic tokens without documented exception.
5. No screen may introduce a new raw color for a semantic role.
