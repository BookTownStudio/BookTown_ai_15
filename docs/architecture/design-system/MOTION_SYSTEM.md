---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-MOTION-SYSTEM
title: "BookTown Motion System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Motion System

Status: Foundation architecture.

## Motion Philosophy

Motion in BookTown should clarify state, preserve continuity, and reduce cognitive load. It should not decorate, distract, or delay reading and writing.

Reader and writer surfaces require the most restraint. Social, discovery, and marketplace surfaces may use more expressive transitions only when they improve comprehension.

## Motion Hierarchy

| Tier | Purpose | Duration Target |
| --- | --- | --- |
| Instant feedback | Button press, toggle, focus | 80-150ms |
| Micro transition | Hover, selection, chip state | 120-180ms |
| Surface transition | Drawer, modal, sheet, popover | 180-280ms |
| Page transition | Route or immersive screen change | 200-400ms |
| Celebratory motion | Publish success, rare milestones | Explicitly approved |

## Animation Principles

1. Motion must communicate cause and effect.
2. Interactive feedback must be faster than navigation motion.
3. Reader chrome should move quickly and predictably.
4. Writing surfaces must not animate layout in ways that disturb cursor stability.
5. Loading motion should imply progress or waiting, not decoration.
6. Repeated interactions must remain subtle.

## Token Requirements

Motion tokens must include:

- Duration.
- Easing.
- Delay.
- Stagger.
- Transform distance.
- Scale amount.
- Opacity transition.
- Reduced-motion replacement.

## Reduced-Motion Requirements

If the user has `prefers-reduced-motion`, the system must:

- Disable decorative motion.
- Replace spring movement with opacity or instant state changes.
- Preserve critical state communication.
- Avoid parallax, bounce, long staggers, and unnecessary scale.
- Keep reader controls immediate.

Reduced-motion handling must be implemented centrally, not screen by screen.

## Domain Rules

Reader:

- Chrome hide/reveal must be fast.
- Page/scroll controls must not animate text unexpectedly.
- Highlight and bookmark feedback may be subtle.

Writer:

- Toolbar and panel motion must not shift manuscript position unexpectedly.
- Save/conflict states should transition clearly but calmly.

Discovery and social:

- Feed and card motion must not make scrolling feel unstable.
- Entry animations should be bounded and optional.

Admin:

- Motion should be minimal and utility-focused.
