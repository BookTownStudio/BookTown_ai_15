# BookTown T5 Shelf And Profile Contract Authority Stabilization Execution

## Executive Summary

T5 stabilized the runtime-critical Shelf/Profile contract drift without changing navigation, route exposure, feature governance, global entity architecture, or unrelated runtime domains.

The pass removed the confirmed Shelf/Profile TypeScript failures by clarifying read-only versus interactive shelf rendering contracts, restoring profile toast/action wiring, aligning library stats with backend-authored `UserStats`, and separating shelf creation/move payloads from hydrated runtime entities.

Root `npx tsc --noEmit` now reports 22 errors, reduced from the previous 34. No remaining compiler errors are in the T5-touched Shelf/Profile files.

## Shelf Runtime DTO Changes

- Added `ShelfCreateDTO` in `services/db.types.ts` as the canonical shelf creation payload accepted by `ShelfDataService.createShelf`.
- Updated `useCreateShelf` to derive mutation variables from `ShelfCreateDTO` instead of duplicating the creation payload shape locally.
- Preserved `Shelf` as the hydrated runtime entity returned by backend services; no monolithic Shelf model or broad schema rewrite was introduced.

## Profile Runtime DTO Changes

- Restored `showToast` ownership in `app/drawer/profile.tsx` through the existing toast provider instead of leaving profile action callbacks dependent on an undeclared symbol.
- Replaced stale `userStats.counters` reads in `app/tabs/read.tsx` with backend-authored flat `UserStats` fields: `booksRead` and `shelvesCreated`.
- Localized notification empty-state identity handling in `app/notifications/feed.tsx` through an explicit join-date reader so the UI no longer assumes the auth runtime object is the full canonical `User` profile shape.

## Component Prop Alignment

- Stabilized `ShelfCarousel` so read-only profile usage does not need fake callbacks for menu, share, toggle, delete, or layout actions.
- Stabilized `ShelfHeader` menu construction so optional actions are only rendered when backed by an actual typed callback.
- Removed profile `ShelfCarousel` prop drift without adding no-op call sites or local compatibility shims.

## Library Identity Boundary Clarification

- `ShelfCarousel` now distinguishes read-only display mode from interactive library management mode through optional action props.
- `MoveBookModal` now requires the hydrated `Book` runtime DTO before invoking the move mutation and returns an explicit unavailable state if the book details are missing.
- `shelf-details` description handling was centralized into a small runtime field reader instead of repeated unsafe structural casts.

## Backend-To-Runtime Contract Flow Changes

- Shelf creation now follows `ShelfCreateDTO -> backend createShelf -> hydrated Shelf` flow.
- Shelf movement now follows `hydrated Book -> move mutation -> backend shelf action`; the UI no longer sends a mixed `{ bookId, book }` payload to a mutation whose runtime authority is the hydrated book DTO.
- Profile/library stats now read the backend service contract directly instead of a stale frontend-local nested counter assumption.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Production truth check, Vite build, and bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync and functions TypeScript build completed. |
| `npx tsc --noEmit` | Failed | 22 remaining errors, all outside T5-touched Shelf/Profile files. Previous baseline was 34. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |

## Remaining Runtime Drift

Remaining root TypeScript failures are outside T5 scope:

- Write/publish contracts: `app/project/publish.tsx`, `lib/editor/chapterNodes.ts`, `lib/templates/writeTemplates.ts`, `lib/projects/projectSummary.ts`.
- Discovery/Home UI drift: missing `PinIcon`, `onClick` prop mismatch.
- Admin/catalog quote input drift.
- AI/agent callable message typing drift.
- Author callable envelope narrowing drift.
- Messenger callable argument mismatch.
- Notification preference spread typing drift.
- Firebase adapter collection reference typing drift.
- Agent session pinned predicate mismatch.

## Architectural Risks

- Root compiler truth is still not clean because T5 intentionally did not absorb Write, AI, admin, Firebase adapter, or feature-surface drift.
- `ShelfCarousel` still contains unrelated `BookCard` entry casting that predates T5 and belongs to a later shelf-entry/book-card DTO pass.
- Profile identity remains split between auth session identity and full profile identity; T5 removed unsafe assumptions in the touched path, but a broader identity DTO consolidation should remain sequenced separately.

## Post-T5 Verdict

T5 is complete for the approved scope.

Shelf/Profile runtime authority is materially stabilized, component prop drift is removed on the profile shelf surface, toast/action wiring is restored, shelf create/move payloads now follow deterministic DTO boundaries, and Phase A through T4 guarantees remain intact. The remaining compiler errors are real but belong to later scoped passes, not Shelf/Profile contract authority.
