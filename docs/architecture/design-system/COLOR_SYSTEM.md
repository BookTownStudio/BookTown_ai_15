# BookTown Color System

Status: Foundation architecture.

## Color Philosophy

BookTown color should communicate structure, trust, literary atmosphere, and action hierarchy. Color must never be the only signal for state or meaning.

The visual language should avoid a one-note palette. Slate/dark surfaces and sky accents are acceptable as a base, but production design requires semantic roles, readable light mode, reader paper themes, and status colors.

## Color Architecture

The color system has four layers:

1. Base palette.
2. Semantic product tokens.
3. Component state tokens.
4. Domain theme tokens.

Screens should not consume base palette values directly.

## Required Semantic Roles

| Role | Purpose |
| --- | --- |
| Canvas | App background |
| Surface | Panels, cards, sheets |
| Elevated | Floating surfaces, popovers, modals |
| Overlay | Scrims and backdrop layers |
| Border | Structural separation |
| Text primary | Main readable text |
| Text secondary | Supporting text |
| Text muted | Metadata, placeholders |
| Action primary | Main action |
| Action secondary | Secondary action |
| Action destructive | Destructive action |
| Focus | Keyboard focus ring |
| Selection | Text selection and active ranges |
| Success | Confirmed positive state |
| Warning | Recoverable risk |
| Danger | Destructive or failed state |
| Info | Neutral system notice |

## Theme Strategy

BookTown must support light and dark app themes with parity. Dark mode may be the emotional default, but light mode must not be an afterthought.

Theme values must define:

- Canvas.
- Surface.
- Text.
- Border.
- Action.
- Focus.
- Status.
- Overlay.
- Skeleton/loading.

## Reader Color Strategy

Reader themes are a governed extension:

- Light paper.
- Dark paper.
- Sepia paper.

Reader colors must define:

- Paper.
- Ink.
- Muted ink.
- Chrome background.
- Chrome border.
- Progress.
- Highlight.
- Bookmark.
- Selection.
- Annotation affordance.

Reader themes should preserve immersive calm and must not inherit high-contrast app chrome without review.

## Accessibility Principles

1. Text/background pairs must target WCAG AA minimums.
2. Focus rings must be visible against every interactive surface.
3. Status colors require icon/text/state redundancy.
4. Disabled states must remain readable enough to identify controls.
5. Accent-on-dark and accent-on-light pairs must be contrast-tested before release.

## Current State Risk

Current implementation uses many raw slate, white, black, sky, amber, red, and custom hex values. This allows fast iteration but creates drift. The production target is semantic color consumption through primitives and documented exceptions for literary surfaces.
