---
id: BT-AUDIT-T6-WRITE-PUBLISHING-AUTHORITY-STABILIZATION-EXECUTION
title: "BookTown T6 Write And Publishing Contract Authority Stabilization Execution"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/T6_write_publishing_authority_stabilization_execution.md
---

# BookTown T6 Write And Publishing Contract Authority Stabilization Execution

## Executive Summary

T6 stabilized the runtime-critical Write/Publishing compiler drift without changing editor UX, feature governance, navigation, route exposure, global entity architecture, or unrelated domains.

The pass removed the Write template literal widening failures, editor node semantic ambiguity, project summary node casting drift, and publish preflight narrowing failure. Root `npx tsc --noEmit` now reports 14 errors, reduced from the T5 baseline of 22. No remaining compiler errors are in the T6-touched Write/Publishing files.

## Write Runtime DTO Changes

- Kept `WriteContentNode` and `WriteContentDoc` as the canonical runtime editor DTO authority from `types/entities.ts`.
- Updated editor helper construction in `lib/editor/chapterNodes.ts` so generated text nodes explicitly return `WriteContentNode`.
- Removed an unnecessary child-node cast in chapter node sizing because nested content is already typed by the canonical editor node contract.

## Template Literal Stabilization

- Updated `lib/templates/writeTemplates.ts` helper constructors to return `WriteContentNode` explicitly.
- Prevented template starter nodes from widening from literal discriminators like `"paragraph"` and `"heading"` into generic `string`.
- Preserved template behavior and starter content structure; no template UX or editor model redesign was introduced.

## Publishing Payload Authority Changes

- Stabilized publish preflight handling in `app/project/publish.tsx` by narrowing on `preflight.ok === false`.
- Preserved backend release creation and publish target flow. The frontend still performs structural preflight only and does not invent publishing truth.
- No new publish payload DTO abstraction was introduced because the existing drift was caused by union narrowing, not a missing transport object.

## Project Summary Contract Flow

- Updated `lib/projects/projectSummary.ts` to traverse `WriteContentNode` directly instead of casting editor nodes to generic records.
- Project synopsis extraction now derives from the canonical editor node DTO and only falls back to HTML parsing when structured content does not provide synopsis text.
- Removed the runtime-critical `WriteContentNode -> Record<string, unknown>` summary cast tied to editor DTO ambiguity.

## Write Runtime Boundary Clarification

- Template definitions remain seed definitions.
- Runtime editor nodes remain `WriteContentNode`.
- Publish preflight remains a structural validator over `WriteContentDoc`.
- Project summaries remain derived read models over editor content.
- No monolithic Write/editor model, compatibility shim, broad schema rewrite, or editor UX redesign was introduced.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Production truth check, Vite build, and bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync and functions TypeScript build completed. |
| `npx tsc --noEmit` | Failed | 14 remaining errors, all outside T6-touched Write/Publishing files. Previous T5 baseline was 22. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `git diff --check` | Passed | No whitespace errors in the working diff. |

## Remaining Runtime Drift

Remaining root TypeScript failures are outside T6 scope:

- Discovery/Home UI drift: missing `PinIcon` and an `onClick` prop mismatch.
- Admin/catalog quote input drift.
- ReviewCard locale comparison drift.
- AI/agent message role typing drift.
- Author callable envelope narrowing drift.
- Messenger callable argument mismatch.
- Notification preference spread typing drift.
- Firebase adapter collection reference typing drift.
- Agent session pinned predicate mismatch.

## Architectural Risks

- Root compiler truth is still not clean because the remaining failures belong to UI infrastructure, admin/catalog, AI/agent, callable envelope, messenger, notification preference, and Firebase adapter domains.
- `WriteContentDoc` validation is still structurally light in runtime adapters; this pass removed compiler drift but did not introduce a full node parser or persistence validator.
- Publishing remains dependent on backend release creation for final authority, which is correct, but future publish DTO work should keep preflight, release creation, and bridge flows as separate contracts.

## Post-T6 Verdict

T6 is complete for the approved scope.

Write/Publishing runtime authority is materially stabilized, template literal widening is removed on runtime-critical paths, project summary extraction now follows canonical editor node DTOs, publishing preflight narrowing is deterministic, and Phase A through T5 guarantees remain intact. The remaining compiler failures are real but belong to later scoped passes, not Write/Publishing contract authority.
