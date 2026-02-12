# BookTown UI Playbook
*A practical reference for interaction, layout, and UI ergonomics*

---

## 0. Purpose

This document exists to:
- Preserve interaction decisions
- Prevent UI drift as features scale
- Enable fast development without re-debating basics
- Keep BookTown calm, readable, and timeless

This is **not** a design system.  
This is a **set of rules and principles**.

When in doubt: follow this file.

---

## 1. Core Philosophy

- Calm over clever
- Predictable over impressive
- Familiar over novel
- Reading comfort beats visual density
- UI should disappear when content appears

If a UI choice draws attention to itself, it is probably wrong.

---

## 2. Layout & Structure Rules

### Page Structure
- Pages follow a vertical narrative
- Top → identity / context
- Middle → interaction
- Bottom → content

A page should tell one story from top to bottom.

### Spacing
- Sections breathe
- Lists may be tighter
- Never stack more than **3 dense elements** without spacing
- Empty space is intentional, not waste

If a screen feels busy, remove something before resizing anything.

---

## 3. Sticky & Scroll Behavior

- Sticky elements must **earn their presence**
- Sticky bars appear only after clear scroll intent
- Sticky bars must be visually quieter than scrolling content
- Sticky bars should never introduce *new* information

When sticky activates:
- Non-essential information fades out
- Identity simplifies (not duplicates)
- Stats and metadata yield first

Sticky ≠ persistent noise.

---

## 4. Identity & Context

### Identity Blocks
- Full identity appears once
- Compact identity appears only on scroll
- Never show full + compact identity at the same time
- Compact identity is centered by default

### Avatar Behavior
- Large avatar belongs to the hero section
- Mini avatar belongs only to sticky state
- Avatar morphs in size, not position
- Avatar never jumps or teleports
- Avatar should feel like the *same object* at all times

### Identity Interaction
- Clicking the user name or compact identity should scroll to top
- Identity is informational, not a navigation hub

---

## 5. Typography Hierarchy

Rules, not sizes.

- No more than **4 visible text sizes per screen**
- Titles feel structural, not decorative
- Body text must be readable without effort
- Captions never compete with body text
- Metadata is visually quieter than content

If hierarchy is unclear, reduce variation.

---

## 6. Buttons

### General
- Buttons should feel obvious without explanation
- Large tap areas always
- Calm visuals over loud colors

### Primary Buttons
- Used sparingly
- One primary action per screen
- Never aggressive in color

If two actions compete, one must visually yield.

### Secondary Buttons
- Text or outline
- Background only on interaction

### Icon Buttons
- Always circular or softly rounded
- Minimum 40px tap area
- Icons must be self-explanatory

---

## 7. Inputs & Fields

- Inputs look inactive until engaged
- Focus states are subtle, never aggressive
- Padding matters more than borders
- Rounded corners preferred over sharp edges

### Search-Specific Rule
- When search results appear:
  - Input visually demotes
  - Filters collapse, fade, or quiet down
  - Results become the dominant element

Search UI must step aside once content arrives.

---

## 8. Stats & Metadata

- Stats support context; they are not content
- Stats appear near identity, never inside content lists
- Stats may collapse, fade, or relocate on scroll
- Stats should never compete with titles or tabs
- When space is limited, stats yield first

Stats are optional context, never the hero.

---

## 9. Tabs & Navigation

- Tabs are destinations, not decorations
- Active state is always clear
- No unnecessary icons in tabs
- Swipe is allowed but never required
- Tabs should remain usable without looking at them

Navigation should never surprise.

---

## 10. Motion & Animation

- Motion explains change
- Motion never decorates
- Durations are short and consistent
- Ease-out over bounce
- No chained animations unless they explain causality

### Scroll & State Motion
- Fade is preferred over slide
- Scale is preferred over teleport
- Motion should reduce perceived complexity, not add flair

If motion is noticeable, it’s probably too much.

---

## 11. Color Usage

- One accent color per screen
- Accent color indicates state, not decoration
- Grays do most of the work
- Avoid pure black; prefer softened tones

Color should guide, not shout.

---

## 12. Corners, Shadows, Elevation

### Corners
- Medium radius by default
- Smaller radius only for dense lists

### Shadows
- Used only to communicate layering
- Never used for decoration
- Flat is preferred unless hierarchy requires depth

Elevation must earn its existence.

---

## 13. “Apple Rule” (Non-Negotiable)

If two options feel equally valid:
- Choose the calmer one
- Choose the more familiar one
- Choose the one that will age better

Elegance is restraint.

---

## 14. Anti-Patterns (Explicit)

- Multiple primary actions on one screen
- UI elements competing with content
- Sticky UI that does not simplify
- Decorative motion
- Showing the same information twice in different forms

If you feel the need to explain a UI choice, it’s probably wrong.

---

## 15. Scope of This Document

This file:
- Guides new screens
- Resolves UI debates quickly
- Serves as a PR and audit reference
- Acts as a shared language between humans and AI

This file does **not**:
- Replace component code
- Define exact pixel values
- Dictate visual trends

---

## 16. Final Note

Consistency is a feature.

BookTown should feel:
- Quiet
- Trustworthy
- Thoughtful
- Effortless

If a UI choice makes the user think about the UI, we failed.
