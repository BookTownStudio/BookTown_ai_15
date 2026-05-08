# BookTown T7 Infrastructure And Callable Edge Contract Stabilization Execution

## Executive Summary

T7 stabilized the remaining runtime edge and callable contract drift without introducing governance systems, navigation redesigns, broad infrastructure wrappers, AI architecture redesigns, or global entity rewrites.

The pass eliminated the remaining root TypeScript failures by tightening callable envelope narrowing, agent message role DTOs, Firebase document reference typing, notification preference contracts, messenger transport payloads, admin quote create/update payload separation, agent session predicates, and localized UI prop/import assumptions.

Root `npx tsc --noEmit` now passes with zero errors. This reduces the T6 baseline from 14 errors to 0.

## Callable Envelope Authority Changes

- Replaced the ambiguous `SuccessEnvelope & FailureEnvelope` intersection in `lib/authors/ensureCanonicalAuthor.ts` with an explicit `CallableEnvelope<T>` discriminated union.
- Added a small envelope guard that narrows only on `success === true | false`.
- Preserved legacy non-envelope author payload handling as a fallback, but without impossible intersection narrowing.

## AI/Agent Message Contract Changes

- Typed librarian memory messages in `lib/agents-service.ts` as `LibrarianMemoryMessage[]`.
- Preserved the existing `model -> assistant` runtime mapping while preventing role widening to generic `string`.
- Fixed agent session mapping in `services/firebaseDbService.ts` by returning `AgentSession | null` from the mapper and assigning `isPinned` as an explicit boolean runtime field.

## Firebase Adapter Stabilization

- Updated `lib/infrastructure/firebase/firestoreAdapter.ts` so document path resolution returns `DocumentReference<DocumentData>`.
- Normalized document paths through a required root segment before calling Firebase `doc()`, which fixes the overloaded collection/document reference ambiguity.
- Added an explicit empty-path failure instead of allowing invalid infrastructure calls to reach Firebase.

## Notification And Runtime Edge Contract Changes

- Added explicit `NotificationPreferences`, `NotificationPreferenceChannels`, `NotificationPreferenceCategories`, and update DTO typing in `lib/hooks/useNotificationPreferences.ts`.
- Removed `any`-based preference mutation and cache typing on the runtime-critical hook path.
- Aligned `MessagingDataService.sendMessage` with the Firebase implementation by adding the optional typed attachment transport payload.
- Removed a stale `PinIcon` import in `app/tabs/discover.tsx`; the screen already uses its local inline pin icon.
- Removed an invalid `onClick` prop passed to `DiscoveryEntryCard` in `app/tabs/home.tsx`; the component owns its navigation action.
- Fixed the localized `ReviewCard` Arabic fallback that compared `lang === 'en'` inside an already-Arabic branch.
- Split admin quote create/update payloads in `components/admin/CatalogAuthorityTab.tsx` so create payloads always include required bilingual quote/source fields, while update payloads remain partial.

## Infrastructure Runtime Boundary Clarification

- Callable envelopes are now separate from hydrated runtime DTO fallback handling.
- Messenger transport attachments are part of the messaging service contract rather than an untyped hook-only extra argument.
- Notification preference documents now have an explicit runtime DTO at the hook boundary.
- Firebase adapter document references are resolved at the infrastructure boundary instead of leaking overload ambiguity to callers.
- No monolithic infrastructure wrapper, compatibility shim, route change, or runtime governance system was introduced.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Production truth check, Vite build, and bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync and functions TypeScript build completed. |
| `npx tsc --noEmit` | Passed | Root runtime TypeScript drift is now 0 errors. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `git diff --check` | Passed | No whitespace errors in the working diff. |

## Remaining Runtime Drift

No root TypeScript errors remain after T7.

Residual architectural debt still exists outside compiler truth:

- Several callable envelope helpers remain duplicated across service modules and should eventually converge on one shared client helper.
- Notification preferences are typed at the hook boundary, but a future backend contract file should own the V1 preference schema.
- Admin quote forms now enforce create/update transport shape, but user-facing validation copy can be improved later without changing contract authority.

## Architectural Risks

- The root compiler is now truthful, so future drift will be easier to detect. The risk moves from hidden TypeScript failure to governance: maintaining scoped DTO ownership per domain.
- Callable envelope duplication is manageable now but should not spread into new callable clients.
- Infrastructure adapter typing is stable for document paths; collection-level adapter helpers should be introduced only when a real caller needs them.

## Post-T7 Verdict

T7 is complete for the approved scope.

Infrastructure and callable edge contracts are stabilized, AI/agent message role typing is deterministic, Firebase adapter typing is explicit, notification/runtime edge drift is removed, and Phase A through T6 guarantees remain intact. Root runtime TypeScript drift is now zero.
