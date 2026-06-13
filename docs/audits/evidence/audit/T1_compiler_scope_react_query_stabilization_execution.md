---
id: BT-AUDIT-T1-COMPILER-SCOPE-REACT-QUERY-STABILIZATION-EXECUTION
title: "BookTown T1 Compiler Scope And React Query V5 Stabilization Execution"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/T1_compiler_scope_react_query_stabilization_execution.md
---

# BookTown T1 Compiler Scope And React Query V5 Stabilization Execution

## Executive Summary

T1 stabilized the runtime compiler boundary and the runtime-critical React Query v5 drift identified in Phase T0 without introducing schema rewrites, DTO redesigns, feature governance, route changes, or compatibility shims.

The root TypeScript project now represents the frontend runtime graph only. Functions, tests, and fixtures retain separate validation paths instead of being compiled under frontend runtime assumptions. React Query usage was migrated to v5 filter-object semantics on runtime paths, dangerous mutation variable inference was corrected on prioritized hooks, infinite query cursor contracts were made explicit, and runtime hook imports now flow through the local query architecture except for type-only `InfiniteData` usage.

`npx tsc --noEmit` is not yet green. That is expected after T1 because the remaining failures are concentrated in out-of-scope schema, DTO, Firestore adapter, reader/offline, and component contract drift. The runtime-critical React Query failure class was removed from the compiler output.

| Metric | Before T1 | After T1 | Result |
|---|---:|---:|---|
| Runtime/root TypeScript errors | 368 | 81 | 287 fewer errors |
| Files with runtime/root TypeScript errors | 106 | 35 | 71 fewer files |
| Legacy positional query filter calls | Present | 0 | Stabilized |
| React Query residual compiler errors | Present | 0 | Stabilized |
| Runtime direct React Query hook imports | Present | 0 | Stabilized |
| Unsafe readonly key casts | 155 | 138 | Reduced |

## Compiler Scope Authority Changes

The root compiler scope is now explicitly runtime-owned.

Changed files:

- `/Users/solofilms/BookTown_ai_15/tsconfig.json`
- `/Users/solofilms/BookTown_ai_15/tsconfig.tests.json`
- `/Users/solofilms/BookTown_ai_15/tsconfig.fixtures.json`
- `/Users/solofilms/BookTown_ai_15/package.json`

Runtime `tsconfig.json` now includes app runtime directories and explicitly excludes `functions`, `test`, `src/test`, `dev`, `scripts`, `server`, `edge`, `dist`, and generated/test patterns. This prevents fixture, test, and functions drift from polluting the frontend runtime compiler truth.

New deterministic validation commands:

- `npm run typecheck:runtime`
- `npm run typecheck:tests`
- `npm run typecheck:fixtures`
- `npm run typecheck:functions`

This does not suppress runtime errors. It separates compiler authority by runtime domain so each layer is validated under the correct assumptions.

## React Query V5 Migration Changes

Runtime React Query filter calls were migrated to v5 object syntax:

- `invalidateQueries({ queryKey })`
- `cancelQueries({ queryKey })`
- `refetchQueries({ queryKey })`
- `removeQueries({ queryKey })`

Verification:

```text
rg --pcre2 "queryClient\.(invalidateQueries|cancelQueries|refetchQueries|removeQueries)\((?!\{)" app components lib services store -g '*.{ts,tsx}'
0 matches
```

Deprecated mutation loading semantics were migrated from `isLoading` to `isPending` where the value came from React Query mutations. `keepPreviousData` usage was replaced with v5-compatible `placeholderData: (previousData) => previousData` in runtime catalog/detail paths.

Runtime hook imports were normalized away from direct TanStack runtime hook imports. Remaining direct imports from `@tanstack/react-query` are limited to query-client bridge modules and type-only `InfiniteData` imports required for typed infinite query cache snapshots.

## Mutation Generic Corrections

Dangerous `useMutation` generic ordering was corrected on runtime-critical hooks so mutation variables are no longer inferred as `void`.

Prioritized files stabilized:

- `/Users/solofilms/BookTown_ai_15/lib/hooks/useAgentChat.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useProjectMutations.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useBookmarkToggle.ts`
- `/Users/solofilms/BookTown_ai_15/app/drawer/admin.tsx`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useGoodreadsImport.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useModeration.ts`

The correction uses React Query v5 ordering:

```ts
useMutation<TData, TError, TVariables>(...)
```

No broad mutation abstraction layer was introduced.

## Infinite Query Stabilization

Infinite query cursor/page semantics were made explicit on runtime-critical paths.

Changed files:

- `/Users/solofilms/BookTown_ai_15/lib/hooks/useNotifications.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useThreadComments.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useSocialSearch.ts`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useSocialFeeds.ts`
- `/Users/solofilms/BookTown_ai_15/app/drawer/admin.tsx`

Stabilization applied:

- Added required `initialPageParam`.
- Typed page params as `string | undefined`.
- Typed page snapshots through `InfiniteData<..., string | undefined>`.
- Removed runtime-critical `unknown` cursor leakage.
- Preserved existing cache topology and backend data authority.

## Query Key Authority Changes

Query key handling was stabilized without redesigning DTOs or cache topology.

Applied changes:

- Migrated query filters to object syntax for readonly key compatibility.
- Reduced unsafe query key casts from 155 to 138 occurrences.
- Converted runtime hook imports to local query architecture where applicable.
- Preserved existing query key factories and invalidation topology.

Remaining `as unknown as any[]` casts are not all safe to remove inside T1 because several are entangled with schema/DTO drift that belongs to the next stabilization phase.

## Validation Results

| Command | Status | Evidence |
|---|---|---|
| `npm run build` | Passed | Production truth precheck passed, Vite build completed, production bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Shared contracts synced and functions TypeScript build completed. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `npx tsc --noEmit` | Failed | 81 scoped runtime errors remain across 35 files. No residual React Query v5 migration errors were present. |

Residual React Query verification:

| Check | Status |
|---|---|
| Positional `invalidateQueries/cancelQueries/refetchQueries/removeQueries` | 0 matches |
| Malformed TanStack replacement imports | 0 matches |
| Runtime direct TanStack hook imports | 0 matches |
| `isLoading`, `keepPreviousData`, `initialPageParam`, `TS2559`, mutation `void` residuals in final tsc log | 0 matches |

## Remaining Runtime-Critical Drift

The remaining TypeScript failures are outside the T1 scope and should not be solved by local casts or compatibility fiction.

| Area | Remaining Drift | Root Cause | T1 Verdict |
|---|---|---|---|
| Book DTO/entity surfaces | Book-to-record casts and missing/variant fields | Multiple Book shapes remain active | Defer to DTO authority stabilization |
| Social attachments/posts | Attachment union and post composer mismatches | Component assumptions exceed canonical DTO guarantees | Defer to social contract pass |
| Firestore adapters/search | Raw Firestore document shape assumptions | Adapter result model is not aligned with service contracts | Defer to Firestore contract pass |
| Reader/offline systems | Offline ebook and reader record shape mismatches | Reader storage DTOs are partially divergent | Defer to reader contract pass |
| Profile/shelf UI props | Component props expect richer shapes than callers provide | Route/component contract drift | Defer to component contract pass |
| Write/publish templates | Template literal and release preflight widening | Write DTOs are not centrally authoritative | Defer to write contract pass |
| Discovery/read tabs | Missing icon/module and component prop mismatch | Local UI contract drift | Fix in next scoped runtime cleanup |

Dominant remaining error codes:

- `TS2339`: property drift across entity and component contracts.
- `TS2352`: unsafe casts between incompatible entity shapes.
- `TS2345`: argument contract mismatches.

## Architectural Risks

T1 removed the React Query v5 instability class but did not make the full type system authoritative. The highest remaining risk is schema/DTO drift being patched locally with casts instead of consolidated under explicit contract ownership.

Immediate risks:

- Root `tsc` still fails, so CI should not yet treat runtime typecheck as release-gating until the next scoped stabilization pass removes the remaining contract drift.
- Unsafe entity casts remain in Book, social, reader, and Firestore paths.
- Component-level prop assumptions still exceed backend or service guarantees in several screens.

Controlled deferrals:

- No schema rewrite was attempted.
- No `types/entities.ts` decomposition was attempted.
- No route exposure, feature governance, navigation, or product topology was changed.
- Dormant future systems were preserved.

## Post-T1 Verdict

T1 is successful for its approved scope.

Compiler scope authority is now deterministic, Phase A production truth guarantees are preserved, React Query v5 runtime semantics are stabilized, mutation variable `void` inference was removed from prioritized runtime hooks, and infinite query semantics now have explicit page/cursor contracts.

The codebase is not yet globally type-stable. The next stabilization pass should target contract authority and schema drift directly, starting with Book entity authority, Firestore adapter contracts, social attachment/post DTOs, and reader/offline DTOs. Those remaining failures are structural contract issues, not React Query migration issues.
