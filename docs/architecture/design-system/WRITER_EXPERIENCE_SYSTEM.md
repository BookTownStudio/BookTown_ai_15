---
id: BT-DOCS-ARCHITECTURE-DESIGN-SYSTEM-WRITER-EXPERIENCE-SYSTEM
title: "BookTown Writer Experience System"
status: active
authority_level: architecture
owner: design-system
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Writer Experience System

Status: Foundation architecture.

## Writer Philosophy

The writer experience is a creative production environment. It must support focus, confidence, and recovery. The interface should make structure, save state, collaboration, mentor assistance, and publishing readiness clear without crowding the manuscript.

Writing UI must feel like a professional literary workspace, not a generic rich-text form.

## Writing Environment

The writer domain includes:

- Manuscript editor.
- Formatting toolbar.
- Formatting pane.
- Outline.
- Collaboration cursors.
- Autosave and sync indicators.
- Recovery and conflict banners.
- Mentor/agent assistance.
- Project edit, preview, publish, and published states.

The writing environment may specialize density and tool placement, but it must inherit design-system tokens and primitive behavior.

## Editor Experience

Editor UX priorities:

1. Cursor stability.
2. Low visual noise.
3. Explicit save/sync/conflict state.
4. Predictable formatting controls.
5. Accessible keyboard operations.
6. Clear manuscript hierarchy.
7. Safe recovery from offline or conflict states.

Editor styling must migrate from embedded raw CSS toward editor domain tokens.

## Creative Focus Principles

- The manuscript is the primary object.
- Toolbars support intent and should not dominate.
- Mentor/agent surfaces must be opt-in and contextual.
- Recovery banners must be visible and actionable.
- Publishing readiness must be explicit before public release.
- Mobile writing must prioritize stable editing and safe actions over full desktop parity.

## Writing Typography

Writer typography must define:

- Manuscript body.
- Manuscript headings.
- Blockquote.
- Inline formatting.
- Placeholder text.
- Toolbar labels.
- Status indicators.
- Outline labels.

Language-aware blocks must preserve Arabic and English direction without manual screen-level overrides.

## Writing Accessibility

Requirements:

1. Formatting controls must have accessible labels.
2. Keyboard shortcuts must not be the only path.
3. Focus order must remain stable around toolbars and panels.
4. Color cannot be the only save/conflict signal.
5. Banners must be screen-reader discoverable.
6. Reduced motion must avoid shifting editor content.
7. Touch targets must remain usable on mobile.

## Relationship To Main Design System

Writer uses global primitives for buttons, sheets, inputs, banners, tabs, dialogs, and status indicators. It uses writer-domain tokens for manuscript surfaces, editor chrome, collaboration cursors, and conflict/recovery states.
