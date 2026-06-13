---
id: BT-AUDIT-T3-SOCIAL-ATTACHMENT-POST-AUTHORITY-STABILIZATION-EXECUTION
title: "BookTown T3 Social Attachment And Post Contract Authority Stabilization Execution"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/T3_social_attachment_post_authority_stabilization_execution.md
---

# BookTown T3 Social Attachment And Post Contract Authority Stabilization Execution

## Executive Summary

T3 stabilized Social attachment and Post runtime contract authority without changing Reader, Shelf/Profile, Search/Book, navigation, route exposure, feature governance, or global entity architecture.

The core correction was separating hydrated runtime attachments from post creation payloads. Composer state still uses hydrated `PostAttachment` objects for preview and drafts, while publishing now converts those objects into explicit backend creation DTOs. Attachment rendering now consumes explicit runtime references instead of relying on partial attachment objects or broad metadata casts.

| Metric | Before T3 | After T3 | Result |
|---|---:|---:|---|
| Runtime/root TypeScript errors | 51 | 39 | 12 fewer errors |
| Files with runtime/root TypeScript errors | 30 | 24 | 6 fewer files |
| Social composer attachment errors | Present | 0 | Stabilized |
| PostCard attachment cast errors | Present | 0 | Stabilized |
| Attachment renderer/viewer metadata cast errors | Present | 0 | Stabilized |
| Incomplete `as PostAttachment` construction in scoped Social runtime | Present | Removed | Stabilized |

## Attachment Contract Authority Changes

Canonical hydrated attachment authority remains the existing `PostAttachment` discriminated union in `/Users/solofilms/BookTown_ai_15/types/entities.ts`. T3 did not duplicate or replace that union.

Added explicit Social attachment boundary helpers in:

- `/Users/solofilms/BookTown_ai_15/types/socialAttachments.ts`

This module provides:

- `PostCreateAttachmentDTO`
- `StructuredPostCreateAttachmentDTO`
- `MediaPostCreateAttachmentDTO`
- `PostCreateDTO`
- hydrated attachment builders for book, author, shelf, quote, and publication attachments
- `toPostCreateAttachmentDTO`
- `buildAttachmentV1RuntimeRef`
- `buildRuntimeAttachmentFromRef`

The new module is a boundary adapter around the existing union, not a second union authority.

## Create vs Hydrated DTO Separation

Composer no longer sends hydrated `PostAttachment` objects directly to create-post backend calls.

Changed files:

- `/Users/solofilms/BookTown_ai_15/app/immersive/post-composer.tsx`
- `/Users/solofilms/BookTown_ai_15/lib/hooks/useCreatePost.ts`

Runtime behavior now separates:

```text
Composer preview/draft state
  -> hydrated PostAttachment

Publish mutation
  -> toPostCreateAttachmentDTO()
  -> PostCreateAttachmentDTO
  -> backend createSocialPost contract
```

This removes the previous mixed model where incomplete objects like `{ type: "book", entityId, bookId }` were forced into the hydrated `PostAttachment` union.

## Post Runtime Contract Flow Changes

Post creation now follows backend-authoritative create contracts:

```text
UI selection result
  -> hydrated attachment builder
  -> composer preview/draft
  -> creation DTO adapter
  -> dataService.social.createPost()
  -> backend createSocialPost
```

This preserves frontend preview ergonomics while ensuring the backend receives only its explicit creation payload:

- media attachments: `{ attachmentId, type }`
- structured attachments: `{ type, entityId, entityOwnerId? }`

No frontend-authored canonical Post truth was introduced.

## Attachment Renderer Alignment

Changed files:

- `/Users/solofilms/BookTown_ai_15/components/content/AttachmentRendererV1.tsx`
- `/Users/solofilms/BookTown_ai_15/components/content/AttachmentViewerOverlay.tsx`
- `/Users/solofilms/BookTown_ai_15/store/attachment-viewer.tsx`
- `/Users/solofilms/BookTown_ai_15/lib/media/AttachmentAnalytics.ts`
- `/Users/solofilms/BookTown_ai_15/components/content/PostCard.tsx`
- `/Users/solofilms/BookTown_ai_15/components/content/ThreadBody.tsx`

Renderer and viewer code no longer casts attachment metadata to generic `Record<string, unknown>` where the contract already exposes typed metadata fields. PostCard and ThreadBody now use typed runtime attachment reference builders rather than returning partial objects and forcing them into `PostAttachment`.

## Social Runtime Boundary Clarification

Boundaries after T3:

- `PostAttachment`: hydrated runtime/display union.
- `PostCreateAttachmentDTO`: backend creation payload.
- `AttachmentRef`: backend/post content reference.
- `AttachmentV1`: renderable media attachment runtime object.
- `buildRuntimeAttachmentFromRef`: explicit adapter from `AttachmentRef` to a renderable runtime reference when hydration is unavailable.

Boundaries intentionally not touched:

- Reader/offline DTOs.
- Shelf/Profile DTOs.
- Write template DTOs.
- Search/Book DTOs.
- Feature governance.
- Navigation/runtime topology.
- Global `types/entities.ts` redesign.

## Validation Results

| Command | Status | Evidence |
|---|---|---|
| `npm run build` | Passed | Production truth precheck passed, Vite built 1208 modules, production bundle truth verification passed. |
| `npm --prefix functions run build` | Passed | Contract sync completed and functions TypeScript build passed. |
| `npm run production-truth:check` | Passed | Runtime fixture import boundary passed. |
| `npx tsc --noEmit` | Failed | 39 scoped runtime errors remain across 24 files. No scoped Social attachment/Post errors remain. |

T3-specific verification:

| Check | Status |
|---|---|
| Incomplete composer attachment construction removed | Passed |
| Create DTOs separated from hydrated runtime DTOs | Passed |
| `useCreatePost` now accepts creation DTOs | Passed |
| PostCard attachment cast errors removed | Passed |
| ThreadBody partial attachment cast removed | Passed |
| Attachment renderer/viewer metadata cast errors removed | Passed |
| React Query v5 regression | None detected |
| Search/Book authority regression | None detected |
| Phase A production truth regression | None detected |

## Remaining Runtime Drift

Remaining `tsc` failures are outside the approved T3 Social attachment/Post scope.

| Area | Remaining Drift | Scope Status |
|---|---|---|
| Author canonicalization | Callable envelope narrowing mirrors older Book canonicalization drift | Out of scope |
| Profile/Shelf UI | Toast wiring and ShelfCarousel prop contract drift | Out of scope |
| Write templates | `WriteContentNode` literal widening | Out of scope |
| Reader/offline | EPUB runtime and offline record typing drift | Out of scope |
| Notifications/read stats | User/profile stats field mismatches | Out of scope |
| Firestore/infrastructure | Generic Firestore adapter and notification preferences drift | Out of scope |
| Admin quotes | Required quote payload fields remain optional locally | Out of scope |

Dominant remaining error codes:

- `TS2339`: property drift in non-Social domains.
- `TS2345`: argument contract mismatches in non-Social domains.
- `TS2304`: unresolved local UI symbol drift.

## Architectural Risks

T3 removes the Social attachment creation/runtime ambiguity but does not make all Social systems final. Remaining risks to track later:

- Backend hydrated Post responses still rely on service normalization in `firebaseDbService`; a later backend contract pass should formalize `PostRuntimeDTO` at the callable boundary.
- Draft storage still stores hydrated attachment state for preview continuity. This is acceptable for current runtime, but draft persistence should eventually get its own explicit draft DTO.
- Social search/profile projection attachment refs remain separate contract surfaces and should be audited in a future social projection pass.

T3 avoided broad union widening and did not introduce a monolithic Post model.

## Post-T3 Verdict

T3 is successful for its approved scope.

Social attachment create/runtime boundaries are explicit, incomplete attachment construction was removed from the composer and thread rendering paths, attachment renderer metadata assumptions were tightened, and the runtime compiler error count was materially reduced from 51 to 39. Phase A, T1, and T2 guarantees remain intact.

The codebase is not yet globally type-stable. The remaining failures are real authority issues in Author canonicalization, Reader/offline, Shelf/Profile, Write templates, and infrastructure contracts, not Social attachment/Post contract drift.
