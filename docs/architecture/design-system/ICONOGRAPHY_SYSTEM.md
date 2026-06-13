---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-ICONOGRAPHY-SYSTEM
title: "BookTown Iconography System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Iconography System

Status: Foundation architecture.

## Icon Philosophy

Icons in BookTown are functional language. They should help users scan reading, writing, navigation, social, and admin actions without competing with text or book content.

Icons must be consistent in stroke, size, alignment, mirroring behavior, accessible naming, and state treatment.

## Icon Categories

| Category | Examples |
| --- | --- |
| Navigation | Home, Read, Discover, Write, Social |
| Literary entities | Book, Author, Quote, Shelf, Venue |
| Reader controls | Bookmark, Highlight, Narration, Settings, Progress |
| Writer controls | Bold, Italic, Align, Undo, Redo, Publish |
| Social actions | Like, Comment, Repost, Share |
| System | Search, Filter, Close, Back, More, Download |
| Status | Success, Warning, Error, Lock |
| Agent/AI | Brain, Mentor, Lore, Lightbulb |
| Admin | Analytics, Security, Flag |

## Sizing Rules

Canonical sizes:

- 16px: dense metadata and inline affordances.
- 20px: compact buttons and list rows.
- 24px: primary navigation and standard controls.
- 32px: empty states and feature headers.
- 48px+: brand or illustration-only contexts.

Icon buttons must meet touch-target requirements even when icon glyphs are smaller.

## State Rules

Every actionable icon state must define:

- Default.
- Hover.
- Pressed.
- Focus-visible.
- Active/selected.
- Disabled.
- Loading/busy where applicable.

Color-only active states are not sufficient. Use label, fill, stroke, background, or ARIA state where appropriate.

## RTL Considerations

Directional icons must be explicitly classified:

- Mirror in RTL: back, forward, chevron, indent, outdent.
- Do not mirror: book, search, user, settings, calendar, lock.

Mirroring must be controlled by the primitive or icon system, not ad hoc per screen.

## Accessibility

Decorative icons must be hidden from assistive technology. Icon-only buttons require localized accessible labels. Icons paired with text should not duplicate screen-reader output unless needed.

## Governance

New icons require:

- Category.
- Canonical name.
- Size behavior.
- RTL behavior.
- Filled/active behavior if applicable.
- Usage examples.

Icons should remain visually compatible with the existing custom SVG library unless the product formally migrates to a third-party icon set.
