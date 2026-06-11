# BookTown Component Primitives

Status: Foundation architecture.

## Primitive Layer Purpose

Component primitives are the only approved bridge between product screens and design tokens. They own visual state, accessibility behavior, theme behavior, RTL behavior, and interaction consistency.

Business logic, data fetching, entity authority, and workflow orchestration must stay outside primitives.

## Canonical Primitive Families

Required primitive layer:

- Button
- IconButton
- LinkButton
- Input
- Textarea
- Select
- Checkbox
- Switch
- Radio
- SearchField
- Card
- Surface
- Modal/Dialog
- Sheet/Drawer
- Popover/Menu
- Tabs
- Badge
- Chip
- Avatar
- Toast/Snackbar
- Skeleton
- EmptyState
- ErrorState
- Progress
- Tooltip
- NavigationItem
- AppHeader
- ScreenHeader
- BottomNavigation

## Primitive Contract

Each primitive must document:

- Purpose.
- Allowed variants.
- Required props.
- Accessibility behavior.
- Keyboard behavior.
- Focus behavior.
- Disabled/loading behavior.
- RTL behavior.
- Light/dark behavior.
- Reader/writer domain exceptions.
- Test requirements.

## Button Architecture

Button variants:

- Primary.
- Secondary.
- Ghost.
- Destructive.
- Quiet.
- Icon.

Button states:

- Default.
- Hover.
- Pressed.
- Focus-visible.
- Disabled.
- Loading.
- Selected where applicable.

Minimum target size is 44px unless used in dense admin contexts with explicit approval.

## Input Architecture

Inputs must own:

- Label association.
- Help text.
- Error text.
- Required/optional indication.
- Prefix/suffix slots.
- Validation state display.
- RTL direction.
- Disabled/read-only state.

Raw inputs and textareas should be migrated behind primitives.

## Card Architecture

Cards must be split by semantic purpose:

- Content card.
- Entity card.
- Action card.
- Quote card.
- Book card.
- Admin data card.
- Reader annotation card.

The current generic `Card` should become a surface primitive or be replaced by semantic card primitives. Product cards should not recreate border, shadow, radius, and padding independently.

## Modal, Dialog, Sheet

Dialogs must provide:

- Focus trap.
- Focus return.
- Escape close policy.
- Labelled title.
- Optional description.
- Inert background.
- Scroll containment.
- Mobile sheet behavior when appropriate.

Sheets and drawers must share overlay, z-index, focus, and motion governance.

## Navigation Primitives

Navigation primitives must cover:

- Bottom tabs.
- Drawer rows.
- Header back buttons.
- Secondary tabs.
- Breadcrumbs where needed.
- Reader chrome controls.

Navigation state must be semantic and accessible through `aria-current`, labels, and keyboard focus.

## Future Governance

No new screen-level component pattern may be added when an existing primitive can express the behavior. New primitives require design-system review, tests, and documentation before broad use.
