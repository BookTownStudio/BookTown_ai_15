# BookTown Reader Experience System

Status: Foundation architecture.

## Reader Philosophy

The reader is BookTown's highest-attention environment. It must feel stable, quiet, and trustworthy. The UI should disappear when reading and return instantly when needed.

Reader experience quality is measured by continuity, legibility, responsiveness, and low interruption pressure.

## Reader Environment

The reader is a governed domain within the design system. It may use specialized tokens for paper, ink, chrome, margins, highlights, narration, offline state, and reading progress.

Reader specialization is allowed because reading differs from normal app navigation. It is not a license for ungoverned styling.

## Reader Typography

Reader typography must define:

- Font family options.
- Font size scale.
- Line-height scale.
- Margin scale.
- Maximum measure.
- Arabic reading behavior.
- Dyslexia-friendly mode requirements.
- Scroll and paginated mode differences.

Typography changes must avoid expensive recalculation on hot paths and must keep rendering predictable for large books.

## Reader Themes

Required reader themes:

- Light.
- Dark.
- Sepia.

Each theme must define:

- Paper.
- Ink.
- Muted ink.
- Chrome background.
- Chrome border.
- Selection.
- Highlight.
- Bookmark.
- Progress.
- Loading skeleton.

Reader themes must not conflict with the global app theme storage model.

## Reader Controls

Reader controls include:

- Back.
- Book details.
- Narration.
- Bookmark.
- Highlight.
- Offline download.
- Settings.
- Progress.
- Scroll/page mode switch.
- Previous/next page.

Controls must be reachable by touch, keyboard, and assistive technology. Icon-only controls require localized accessible labels.

## Reader Accessibility

Reader accessibility requirements:

1. Text resizing must be supported.
2. Themes must meet contrast targets.
3. Controls must be available without gesture-only access.
4. Reduced motion must disable non-essential chrome movement.
5. Page mode must preserve logical reading order.
6. Selection and annotation must remain operable on keyboard and touch where supported.
7. Offline and sync states must be communicated textually, not only by color.

## Relationship To Main Design System

Reader uses:

- Global color semantics where compatible.
- Domain reader tokens for paper and chrome.
- Shared primitive behavior for buttons, dialogs, sheets, progress, and settings.
- Shared accessibility contracts.

Reader does not own app-level navigation, auth, entity authority, or persistence contracts.

## Regression Signals

Reader experience should continue to track:

- Chrome visibility behavior.
- Hydration delay.
- Layout shift.
- Long tasks.
- Runtime warming.
- Offline state transitions.

These signals support runtime quality but do not replace visual and accessibility regression tests.
