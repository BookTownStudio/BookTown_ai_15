# BookTown Typography System

Status: Foundation architecture.

## Typography Strategy

BookTown typography must support utility UI, longform reading, manuscript writing, Arabic UI, English UI, dense admin workflows, and public literary content.

Current foundations are Inter, Cairo, and Merriweather. The target system should preserve this split while making role, scale, line height, and language behavior canonical.

## Font Roles

| Role | Family | Usage |
| --- | --- | --- |
| UI English | Inter | Navigation, controls, metadata, dense interfaces |
| UI Arabic | Cairo | Arabic UI labels, controls, navigation, metadata |
| Reading prose | Merriweather or governed serif | Longform book-like reading |
| Writing editor | Inter or governed editor serif/sans mode | Manuscript authoring |
| Numeric/data | Inter | Admin, metrics, counters |

## Type Role Architecture

Minimum canonical roles:

- `display`
- `pageTitle`
- `sectionTitle`
- `subsectionTitle`
- `body`
- `bodyLarge`
- `bodySmall`
- `caption`
- `label`
- `metadata`
- `quote`
- `readerBody`
- `readerHeading`
- `editorBody`
- `adminTable`
- `buttonLabel`

Each role must define:

- Font family.
- Size.
- Line height.
- Weight.
- Letter spacing.
- Language-specific overrides.
- Responsive behavior.

## English Typography

English UI should use compact, readable hierarchy with restrained weights. Uppercase labels are allowed only for metadata and section markers, with controlled tracking values.

English reading typography should prioritize long-session comfort: generous line height, stable measure, and no excessive contrast from surrounding chrome.

## Arabic Typography

Arabic typography must not be a direct mirror of English values. Cairo should receive language-specific size, line-height, and weight tuning where required.

Arabic rules:

- Root direction must be `rtl` when Arabic is active.
- Logical spacing must replace hard-coded left/right where possible.
- Quote, border, icon, and navigation direction must be governed.
- Arabic labels should avoid forced uppercase conventions.

## Reading Typography

Reader typography requires independent but connected tokens:

- Font size steps.
- Line-height steps.
- Margin/density steps.
- Reading mode differences.
- Selection color.
- Annotation highlight style.
- Arabic reading behavior.

Reader text must support accessible resizing without layout collapse.

## Writing Typography

Writing typography must prioritize cursor stability, manuscript rhythm, and low fatigue. Editor styles must be tokenized rather than embedded as raw CSS strings.

Writing roles:

- Manuscript paragraph.
- Manuscript heading.
- Blockquote.
- Comment/mentor note.
- Toolbar label.
- Sync/conflict status.

## Accessibility Requirements

1. Body text must remain legible at browser zoom and OS text scaling.
2. Line height must support dyslexia-friendly and large-text modes.
3. Text in buttons must not overflow at mobile widths.
4. Contrast pairs must be documented in the color system.
5. Reader font-size controls must not rely on unbounded layout recalculation.
