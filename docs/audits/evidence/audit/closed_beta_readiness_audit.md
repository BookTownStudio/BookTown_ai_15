---
id: BT-AUDIT-CLOSED-BETA-READINESS-AUDIT
title: "BookTown Closed Beta Readiness Audit"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/closed_beta_readiness_audit.md
---

# BookTown Closed Beta Readiness Audit

Audit name: `BookTown_Closed_Beta_Readiness_Audit`  
Audit type: `full_system_product_readiness`  
Mode: read-only product audit  
Date: 2026-05-06  
Repository: `/Users/solofilms/BookTown_ai_15`

## Executive Summary

BookTown is not ready for a full Phase 1 closed beta with the current exposed product surface.

A constrained closed beta is viable only if the launch surface is reduced to the authenticated reading loop: account bootstrap, search, book details, acquire/read access, reader, shelves/library, feedback, and one guarded AI Librarian experience for consenting users. The rest of the product should be hidden from beta users until it is either production-backed or deliberately removed from the visible IA.

The implemented system has meaningful production architecture: Firebase Auth, Firestore rules, Cloud Functions, callable APIs, App Check enforcement on key AI/search paths, backend-owned aggregation, server-owned post stats, a canonical Work/Edition/Author model, SSR/public sitemap functions, and a real reader manifest pipeline. However, the visible app still exposes mock-backed discovery, incomplete AI surfaces, fragile search quality, unmounted/stub API endpoints, broad client mutation paths, route-level overload, and a failing test/typecheck posture.

The strongest production-grade path is `Search -> Book Details -> Acquire -> Reader -> Shelf`. That loop is real enough to beta test after critical fixes. The broad social, discovery, events, AI camera, summarization, speech, direct messaging, public publishing, and admin/intelligence surfaces are not beta-safe.

### Verification Evidence

Commands executed:

| Command | Result | Production meaning |
|---|---:|---|
| `npm run build` | Passed | Vite can produce a production bundle, but large chunks and mock chunks are present. |
| `npm --prefix functions run build` | Passed | Cloud Functions TypeScript build succeeds. |
| `npx tsc --noEmit` | Failed | App-wide TypeScript integrity is broken; Vite build is hiding substantial type drift. |
| `npm test` | Failed | Root test suite has 85 failures across frontend/functions/compiled tests. |
| `npm --prefix functions test` | Failed | Functions suite has 89 failures, concentrated in canonical authority, quotes, and search quality. |

Hard blockers:

1. Production bundle includes reachable mock-backed features and silent mock fallbacks.
2. Search tests fail for Arabic/transliteration/ranking/external availability behavior.
3. TypeScript integrity is broken across React Query, admin, agent, publishing, book details, and offline paths.
4. Root and functions tests fail in critical backend domains.
5. Visible AI camera/chat/summarize/speech surfaces are stubbed, unmounted, or non-functional.
6. Firestore rules allow overly broad notification updates and multiple client-side mutation surfaces.
7. Route exposure is much larger than the production-ready core loop.

Final launch decision: do not run closed beta against the full current application. Run a constrained invite-only reading beta after the must-fix list in this report is completed.

## System Reality Overview

BookTown is a Vite/React single-page app backed by Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions.

Implemented production architecture:

- React/Vite frontend with a custom navigation store in `store/navigation.tsx`.
- Firebase app initialization with App Check gating in production via `lib/firebase.ts`.
- Auth bootstrap through Cloud Functions and Firebase Auth.
- Firestore rules that deny client writes to core canonical collections such as `books`, `authors`, `editions`, `posts`, `comments`, `projects`, `reading_progress`, `attachments`, `post_stats`, `system_metrics`, and `audit_log`.
- Cloud Function domains for library, reader, social, profile, writing, quotes, messaging, admin, AI, and SSR.
- Express `/api` function with health, search, search click telemetry, and AI REST routes.
- Hosting rewrites for `/api/**`, sitemap generation, SSR public pages, and SPA fallback.
- Backend-owned canonical aggregation and social stats model in the architecture.

Implemented but unstable or incomplete:

- Search and acquire/read paths are real but currently fail important quality tests.
- Reader manifest and progress paths are real, but offline reading is fragile and storage lifecycle is not beta-grade.
- Social feed and posting paths use backend callables, but social moderation/product readiness is not sufficient for beta scale.
- Write/project/publish paths exist but are too broad and type-fragile for first beta exposure.
- AI Librarian and Discover Agent callables exist, but several visible AI surfaces call stubs or nonexistent routes.
- Admin and intelligence workflows exist but are dangerous and should remain superadmin-only manual operations.

Mocked, hidden, or misleading:

- `data/mocks.ts` is imported by reachable production screens and appears as a production bundle chunk.
- Discovery Flow, BookFlow, For You content, and agent metadata rely on mock data.
- Quick recommendations silently fall back to mock book IDs when recommendations fail or return empty.
- `/api/ai/chat` is a deterministic placeholder, not a real LLM chat endpoint.
- AI summarize exists as a stub and is not mounted in the API.
- Speech generation returns `null`.
- Camera identify pathways are visually exposed but not production-backed.

## Feature Inventory

| feature_name | module | frontend_status | backend_status | firebase_status | ui_status | mobile_status | production_status | hidden_or_exposed | dependencies | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth and user bootstrap | `lib/auth.tsx`, `functions/src/user/bootstrap.ts` | Implemented | Implemented | Auth + `users` + `public_profiles` | Usable | Mostly safe | Beta-safe after smoke test | Exposed | Firebase Auth, callable bootstrap | Default shelves omit `currently-reading`; this conflicts with Continue Reading assumptions. |
| App shell/navigation | `App.tsx`, `store/navigation.tsx`, `types/navigation.ts` | Implemented | N/A | N/A | Broad route surface | Needs route hiding | Partially beta-safe | Exposed | React lazy routes | Too many immature routes are reachable for closed beta. |
| Home search | `app/tabs/home.tsx`, `hooks/useUnifiedBookSearch.ts` | Implemented | Real `/api/search/books` | App Check, telemetry optional | Good baseline | Needs mobile smoke | Beta-safe after search fixes | Exposed | Search API, canonical index | `ebookOnly` UI maps to `availabilityOnly`; search quality tests fail. |
| Search result acquisition | `useUnifiedBookSearch`, library/reader functions | Implemented | Real acquisition/read access functions | Server-owned books/attachments | Partially clear | Needs mobile smoke | Beta-critical but unstable | Exposed | External providers, Storage | External availability and readable source tests fail. |
| Book details | `app/book-details.tsx` | Implemented | Mixed callable/data service | Core writes server-owned | Feature-rich | Needs mobile QA | Partially beta-safe | Exposed | Books, authors, reviews, shelves | Imports mock books and has TypeScript drift. |
| Reader | `app/reader/[bookId].tsx`, reader domain | Implemented | Real manifest/progress/session callables | Server-owned reading docs | Core works by architecture | Needs device QA | Beta-critical | Exposed | Storage signed URLs, PDF/EPUB viewer | Large chunks; signed URL TTL is sane; offline still fragile. |
| Offline reading | `lib/offline/*`, reader offline callable | Implemented | Partial | Cache API/IndexedDB/localStorage | Hidden-ish | Risky | Not beta-ready | Partially exposed | Browser storage | Type incompatibility between offline record types; no strong integrity lifecycle. |
| Shelves/library | shelf services, `app/shelf/[id].tsx` | Implemented | Mixed callable + allowed follower write | Firestore shelves/followers | Usable | Likely safe | Beta-safe after shelf bootstrap fix | Exposed | Auth, Firestore | Direct shelf follower writes are allowed; personal shelves should be bounded. |
| Profile/public profile | profile domain, `app/drawer/profile.tsx` | Implemented | Real callables | Rules constrain profile writes | Usable | Needs smoke | Beta-safe | Exposed | Auth, Firestore | Missing `showToast` type/import reported by `tsc`. |
| Author details | `app/author-details.tsx` | Implemented | Real/derived data | Server-owned authors | Usable | Unknown | Partially beta-safe | Exposed | Canonical authors | Safe as read-heavy surface if write actions are guarded. |
| Quotes | `app/quote-details.tsx`, quote domain | Implemented | Real callables | Server-owned canonical quote collections | Usable | Unknown | Not beta-blocking | Exposed | Quotes functions | Functions quote tests fail around transaction mocking and canonical author auto-link. |
| AI Librarian | `functions/src/api.ts`, `functions/src/ai/librarian.ts` | Implemented | Real Gemini/Vertex path | Requires auth + App Check + `aiConsent` | Usable | Needs rate/cost QA | Conditionally beta-safe | Exposed | Vertex/Gemini, quotas | Best AI candidate for beta, but must be opt-in and monitored. |
| Discover agents | `app/tabs/discover.tsx`, `functions/src/domains/ai.ts` | Mixed | Real callable for mentor/quotes/lore | Requires auth/App Check/consent | Polished surface | Unknown | Partially beta-safe | Exposed | Gemini 2.5 Flash | Agent metadata is mock-backed; cost/rate controls are less clear than Librarian. |
| AI chat/camera identify | `services/realAgentService.ts`, `/api/ai/chat` | Exposed | Stub | Auth only for chat; no App Check | Misleading | Unknown | Not beta-ready | Exposed | REST API | Returns placeholder text; identify-book is not real. Hide controls. |
| AI summarize | `functions/src/ai/summarize.ts`, API contract | Broken | Stub/unmounted | N/A | Not reliable | N/A | Not beta-ready | Partially exposed through service | None | Function returns 501 and route is not mounted. |
| AI speech | `RealAgentService.generateSpeech` | Stub | None | N/A | Not reliable | N/A | Not beta-ready | Service exposed | None | Returns `null` with warning. Hide any speech affordance. |
| Discovery static directions | `app/discovery/index.tsx` | Implemented | N/A | N/A | Present | Unknown | Not beta-ready | Exposed | Navigation params | Direction clicks appear not to execute real search in Home. |
| Discovery Flow / For You | `app/discovery/flow.tsx` | Mock-backed | None/partial | N/A | Rich but misleading | Unknown | Not beta-ready | Exposed | `data/mocks.ts` | Books/users/quotes/venues/events/fairs are mock-heavy. |
| BookFlow feed | `app/bookflow/feed.tsx` | Mock-backed | None | N/A | Present | Unknown | Not beta-ready | Route/file present | `mockBookFlowData` | Should not be reachable in beta. |
| Write projects/editor | `app/tabs/write.tsx`, `app/editor/[id].tsx`, write domain | Implemented | Real callables | Client writes denied for projects | Usable but fragile | Needs editor QA | Architecturally important, not beta-safe broadly | Exposed | Functions, Storage | Editor imports `mockAgents`; React Query/type drift in project hooks. |
| Publish book/blog/publication | write domain, project screens | Implemented | Real publish callables | Server-owned projects/books | Complex | Unknown | Not beta-ready | Exposed | EPUB generation, canonical bridge | Publishing affects canonical/public surfaces; hide for beta except internal tests. |
| Social feed | `app/tabs/social.tsx`, social domain | Implemented | Real callable feed | Posts/comments server-owned | Usable | Needs QA | Conditionally safe as read-only | Exposed | Callable feed, stats triggers | Creation/moderation risk is too high for broad beta. |
| Post composer/posts/comments | `app/post-composer.tsx`, social functions | Implemented | Real callables | Server-owned posts/comments | Feature-rich | Unknown | Not beta-safe without moderation hardening | Exposed | Auth, reports, aggregation | Direct like/repost subcollections also allowed; duplicate mutation path risk. |
| Social search | social functions | Implemented | Real callable search | Firestore indexes required | Unknown | Unknown | Not beta-ready | Exposed | Search indexes | Needs abuse, pagination, index, and privacy review. |
| Notifications | `app/notifications-feed.tsx`, notification triggers | Implemented | Real triggers | Rules allow owner update | Usable | Unknown | Needs security fix | Exposed | Firestore | Rules allow broad owner updates, not just read/readAt. |
| Direct messaging | `app/messenger/*`, messaging domain | Implemented | Real callables | Participant-only reads, writes false | Usable | Unknown | Not beta-ready | Exposed | Auth, notifications | Abuse, moderation, retention, and support workflows not beta-ready. |
| Goodreads import | `app/goodreads-import.tsx`, library import functions | Implemented | Real callables | Server-owned imports | Utility UI | Unknown | Internal-only | Exposed | External CSV/import processing | Type drift in mutation hooks; operationally useful but not beta-critical. |
| Venues/events/bookfairs | venue/event services, discovery flow | Mixed | Mostly client-direct Firestore | Rules allow user writes | Present/mock | Unknown | Not beta-ready | Exposed in discovery | Firestore, Storage | Client authority is broad; product does not need this for reading beta. |
| Book reviews | profile/library/social domains | Implemented | Real callables/direct reads | Mixed | Present | Unknown | Partially beta-safe | Exposed | Auth, books | Keep only if tied to core reading loop and moderation is available. |
| Attachments/uploads | attachment domain, storage rules | Implemented | Real callables/storage | Bounded Storage writes | Mostly hidden | Unknown | Internal/limited beta only | Partially exposed | Storage, functions | Direct user-upload originals allowed after server doc exists; no malware/checksum lifecycle visible. |
| Feedback | feedback screen/service | Implemented UI | Backend uncertain | Root Firestore `feedback` writes denied | Present | Likely safe UI | Broken until verified | Exposed | Firestore/Storage | `submitFeedback` appears to write a denied root collection; needs callable or rule alignment. |
| Admin dashboard | `app/drawer/admin.tsx`, admin domain | Implemented | Real privileged functions | Admin/superadmin rules | Powerful | Desktop-only | Admin-only manual | Guarded | Custom claims | Type drift; dangerous operations must remain non-beta. |
| Admin intelligence | `app/admin/intelligence.tsx`, admin intelligence functions | Implemented | Real scheduled/control functions | Admin-only | Operational | Desktop-only | Internal-only | Guarded | Admin claims, metrics | Do not expose to beta. |
| SSR/sitemap/public pages | `functions/src/ssr/*`, hosting rewrites | Implemented | Real functions | Reads public data | SEO/public | N/A | Safe after smoke | Public | Hosting | Not core beta but valuable. |

## Readiness Matrix

Scores are reality-based on current implementation, tests, rules, route exposure, and production behavior. `beta_safe_boolean` means safe for the recommended constrained closed beta, not for unrestricted public launch.

| feature_name | readiness_score_10 | stability_score | security_score | ux_score | mobile_score | backend_integrity_score | scalability_score | major_risks | critical_missing_parts | beta_safe_boolean |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Auth/bootstrap/profile | 7 | 7 | 8 | 7 | 7 | 7 | 8 | Shelf mismatch, type drift | Deterministic shelf setup | true |
| Home search | 6 | 5 | 8 | 7 | 6 | 6 | 7 | Failing search quality tests | Arabic/ranking/dedupe fixes | true after fixes |
| Acquire/read access | 6 | 5 | 8 | 6 | 6 | 7 | 7 | External availability failures | Provider/readability contract tests | true after fixes |
| Reader | 6 | 6 | 8 | 7 | 5 | 7 | 6 | Large chunks, device variance | Mobile/device QA, offline boundaries | true after fixes |
| Shelves/library | 6 | 6 | 7 | 6 | 6 | 6 | 7 | Mixed direct/callable writes | Shelf bootstrap/read-state consistency | true |
| Book details | 5 | 4 | 7 | 7 | 5 | 5 | 6 | Mock fallback, type drift | Remove mocks, fix detail params | true after fixes |
| AI Librarian | 6 | 6 | 8 | 7 | 6 | 7 | 5 | Cost/rate/hallucination | Tight quotas, logging, consent review | true with limits |
| Discover agents | 4 | 4 | 7 | 6 | 5 | 5 | 4 | Mock metadata, cost unknown | Real agent registry and quotas | false |
| AI chat/camera identify | 1 | 2 | 4 | 3 | 3 | 1 | 5 | Stub response, no App Check | Real endpoint or hide | false |
| AI summarize/speech | 0 | 1 | 5 | 2 | 2 | 0 | 5 | Stub/unmounted/null | Production service or hide | false |
| Discovery Flow / For You | 2 | 3 | 5 | 6 | 4 | 1 | 4 | Mock content disguised as product | Replace with real backend or hide | false |
| Write editor | 5 | 4 | 7 | 6 | 4 | 6 | 6 | Type drift, mock agents | Editor QA, autosave/publish boundaries | false for broad beta |
| Publishing | 3 | 3 | 7 | 5 | 4 | 5 | 5 | Canonical/public side effects | Contract tests and admin review | false |
| Social feed read | 5 | 5 | 7 | 6 | 5 | 6 | 6 | Moderation and feed quality | Seeded content, safe reporting | false by default |
| Social creation/comments | 4 | 4 | 6 | 6 | 5 | 6 | 5 | Abuse/moderation/duplicate paths | Moderation gate and clear policies | false |
| Notifications | 4 | 5 | 4 | 6 | 5 | 5 | 6 | Overbroad update rule | Restrict owner updates to read fields | false until fixed |
| Direct messaging | 3 | 4 | 6 | 5 | 5 | 5 | 5 | Abuse/support burden | Blocking/reporting/retention policy | false |
| Goodreads import | 4 | 4 | 7 | 5 | 4 | 5 | 5 | Type drift, operational edge cases | Beta support docs and tests | false |
| Venues/events/bookfairs | 2 | 3 | 3 | 4 | 4 | 2 | 4 | Client writes, mock surfaces | Backend ownership and moderation | false |
| Feedback | 3 | 4 | 5 | 6 | 6 | 2 | 6 | Likely denied write path | Callable or rules alignment | false until fixed |
| Admin dashboard | 4 | 4 | 7 | 5 | 3 | 5 | 6 | Dangerous operations | Superadmin-only manual runbooks | false for beta users |
| SSR/sitemap/public pages | 6 | 6 | 7 | 6 | 6 | 6 | 7 | Needs smoke tests | Public page QA | true |

Overall full-system readiness: 4/10.  
Recommended constrained beta readiness after must-fix items: 6/10.

## Beta Scope Recommendation

### Recommended For Closed Beta

Expose only this scope:

| Surface | Decision | Required guard |
|---|---|---|
| Auth/account bootstrap | Include | Email/Google auth only; no anonymous beta. |
| Home search | Include | Fix search failing tests first; App Check must be active. |
| Book details | Include | Remove mock fallback paths from visible beta flow. |
| Acquire/read access | Include | Verify readable source contract and signed URL lifecycle. |
| Reader | Include | Test PDF/EPUB on mobile and desktop; hide offline if unstable. |
| Shelves/library | Include | Ensure default shelf lifecycle is deterministic. |
| Profile basics | Include | Keep profile edits bounded to existing rule schema. |
| Feedback | Include only after fix | Must use a rule-aligned callable or allowed collection path. |
| AI Librarian | Include for consenting users only | Hard quotas, App Check, structured logs, no authoritative claims. |
| SSR/public pages | Include | Smoke test public book/profile/publication rendering. |

### Should Hide For Now

- Discovery Flow / For You.
- BookFlow feed.
- Discover static directions if they do not execute real search.
- Discover agent carousel except a single AI Librarian entry.
- Camera identify-book.
- Summarize.
- Speech generation.
- AI shelf vibe/chat features backed by `/api/ai/chat`.
- Goodreads import for normal beta users.
- Direct messaging.
- Social search.
- Public post creation/comments/reposts for general beta users.
- Venues, events, bookfairs, venue reviews, RSVPs.
- Offline reading controls unless end-to-end tested.

### Dangerous To Expose

- Admin dashboard and admin intelligence to any non-admin or broad beta account.
- `adminDeleteAllBooks`, deletion execution, purge/backfill operations outside a manual superadmin runbook.
- Public publishing to canonical books/longform without review.
- Client-writable venues/events in a beta product where the core value proposition is reading.
- Mock-backed recommendation/discovery surfaces that look real.
- Stubbed AI camera/chat/summarize controls.

### Architecturally Important But Not Beta Ready

- Canonical literary authority admin tooling.
- Recommendation intelligence and scheduled metrics.
- Offline ebook entitlement lifecycle.
- Public social graph and moderation workflows.
- Direct messaging.
- Write-to-publish pipeline.
- Goodreads/import pipelines.
- Venue/event ecosystem.

### Safe Manual Operations

- Firebase deploy/build from a clean release branch.
- Superadmin-only user support and profile correction.
- Superadmin-only data backfills after dry run and export.
- Manual review of reports and feedback.
- Manual search index validation before inviting users.
- Manual AI usage/cost review daily during beta.

### Future Phase Only

- AI camera book identification.
- AI summarization.
- AI speech.
- Public book fairs/events/venues.
- Direct messaging at scale.
- Public publishing marketplace behavior.
- Broad social discovery.
- Automated canonical conflict resolution without human review.

## Critical Risks

| Risk | Severity | Evidence | Required action |
|---|---:|---|---|
| Mock data is present in reachable production screens | Critical | `data/mocks.ts` imports in Discover, Discovery Flow, BookFlow, agent, editor, book details, quick recs; production build emits `mocks` chunk | Hide or remove mock-backed routes and silent fallback logic before beta. |
| Search quality is not stable | Critical | Functions tests fail for Arabic exact-title, ranking, language filter, external readable sources, normalization, missing tokenization module | Fix tests and contracts before exposing search as the beta entrypoint. |
| TypeScript integrity is broken | Critical | `npx tsc --noEmit` fails across React Query, admin, agent, publishing, book details, offline, Vite config | Fix reachable beta path type errors and restore typecheck as release gate. |
| Test suite is failing | Critical | Root suite 85 failures; functions suite 89 failures | Closed beta must not launch from a known-red baseline. |
| Stubbed AI is visibly exposed | High | `/api/ai/chat` placeholder, summarize unmounted/501, speech `null`, camera capture no-op/stub | Hide these controls or implement real validated endpoints. |
| Notification rule is overbroad | High | Owner can update notification documents as long as `uid` unchanged | Restrict updates to read/readAt/status fields only. |
| Feedback path likely fails | High | Client writes root `feedback`; rules do not allow root `feedback` writes | Move to callable or align Firestore rule/schema. |
| Too much route surface is reachable | High | SPA exposes 30+ immersive/admin/social/discovery/write routes | Add beta feature gates and route guards. |
| Social/moderation not beta-ready | High | Real posting exists, but abuse/report/support workflows are not launch-hardened | Hide creation; keep internal testing only. |
| Offline reader is fragile | Medium | Type mismatch in offline records; cache/localStorage lifecycle | Hide or label as unavailable for beta. |

## Route And Screen Audit

| route | screen_name | reachable | working | responsive | mobile_safe | uses_real_data | uses_mock_data | known_errors | blocking_issues |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| `/` | Home | yes | partial | likely | partial | yes | yes | Search quality failures; quick rec mock fallback | Fix search and remove mock fallback. |
| `/read` | Read tab | yes | partial | likely | partial | yes | possible | Shelf/read-state mismatch | Verify `currently-reading` lifecycle. |
| `/discover` | Discover tab | yes | partial | likely | partial | mixed | yes | Mock agent metadata | Hide or reduce to real AI Librarian. |
| `/discover/explore` | Discovery directions | yes | partial | unknown | unknown | no | no/static | Direction query may not execute real search | Hide until wired. |
| `/discovery-flow` | Discovery Flow | yes | partial | unknown | no | mixed | yes | Mock books/users/venues/events/fairs | Hide. |
| `/write` | Write tab | yes | partial | unknown | no | yes | possible | Project hook type drift | Hide publishing; allow drafts only if tested. |
| `/write/editor/:projectId` | Editor | yes | partial | unknown | no | yes | yes | Mock agents; type drift | Internal-only. |
| `/write/project/:projectId/edit` | Project edit | yes | partial | unknown | no | yes | no | React Query type drift | Internal-only. |
| `/write/project/:projectId/publish` | Publish | yes | partial | unknown | no | yes | no | Mutation generic drift | Hide. |
| `/write/project/:projectId/preview` | Preview | yes | partial | unknown | partial | yes | no | Type drift | Hide. |
| `/write/project/:projectId/published` | Published | yes | partial | unknown | partial | yes | no | Needs QA | Hide. |
| `/social` | Social tab | yes | partial | likely | partial | yes | no | Moderation readiness | Hide creation; optional internal read-only. |
| `/post/:postId` | Post details | yes | partial | unknown | partial | yes | no | Depends on callable and moderation | Hide for public beta. |
| `/post-composer` | Composer | yes | partial | unknown | no | yes | no | Type drift and moderation risk | Hide. |
| `/post/:postId/discussion` | Discussion | yes | partial | unknown | no | yes | no | Moderation risk | Hide. |
| `/messages` | Messenger list | yes | partial | unknown | no | yes | no | Abuse/support burden | Hide. |
| `/messages/:conversationId` | Messenger chat | yes | partial | unknown | no | yes | no | Abuse/support burden | Hide. |
| `/books/:bookId` | Book details | yes | partial | likely | partial | yes | yes | Mock fallback, detail param test drift | Include after fixes. |
| `/reader/:bookId` | Reader | yes | partial | likely | partial | yes | no | Large chunks, offline fragility | Include after device QA. |
| `/authors/:authorId` | Author details | yes | likely | unknown | partial | yes | no | Needs QA | Include if read-only. |
| `/quotes/:ownerId/:quoteId` | Quote details | yes | partial | unknown | partial | yes | no | Quote tests failing | Non-core. |
| `/profile/:uid?` | Profile | yes | partial | likely | partial | yes | no | Type error for toast import | Include basics after fix. |
| `/bookmarks` | Bookmarks | yes | partial | unknown | partial | yes | no | Needs QA | Include if tied to reading loop. |
| `/quotes` | Quotes drawer | yes | partial | unknown | partial | yes | no | Quote backend tests fail | Hide if noisy. |
| `/authors` | Authors drawer | yes | partial | unknown | partial | yes | no | Needs QA | Optional read-only. |
| `/venues` | Venues drawer | yes | partial | unknown | no | mixed | yes/mixed | Client direct writes | Hide. |
| `/venues/:venueId` | Venue details | yes | partial | unknown | no | mixed | possible | Client direct writes and moderation | Hide. |
| `/settings` | Settings | yes | likely | likely | partial | yes | no | Needs smoke | Include minimal. |
| `/feedback` | Feedback | yes | broken until verified | likely | likely | no | no | Root feedback writes likely denied | Fix before beta. |
| `/notifications` | Notifications | yes | partial | unknown | partial | yes | no | Overbroad update rule | Fix before beta exposure. |
| `/agent-chat` | Agent chat | yes | partial/stub | unknown | no | mixed | yes | Stub REST endpoint | Hide. |
| `/live-search` | Live search/camera | yes | broken | unknown | no | no | no | Identify-book uses stub | Hide. |
| `/people-flow` | People flow | yes | partial | unknown | no | mixed | likely | Needs data trace | Hide. |
| `/goodreads-import` | Goodreads import | yes | partial | desktop | no | yes | no | Type drift | Internal-only. |
| `/drafts` | Drafts | yes | partial | unknown | partial | yes | no | Needs QA | Optional internal. |
| `/email` | Email | yes | unknown | unknown | no | unknown | unknown | Not traced | Hide. |
| `/admin` | Admin dashboard | gated | partial | desktop | no | yes | no | Type drift, dangerous ops | Admin-only. |
| `/admin/intelligence` | Admin intelligence | gated | partial | desktop | no | yes | no | Operational risk | Admin-only. |
| `/blog/:slug` | Publication/blog reader | yes | partial | likely | partial | yes | no | Needs SSR/public smoke | Optional public. |
| `/publication/:id` | Publication reader | yes | partial | likely | partial | yes | no | Needs QA | Optional public. |
| `/read/publication/:id` | Publication reader alias | yes | partial | likely | partial | yes | no | Needs QA | Optional public. |
| `/sitemap.xml` | Sitemap | public | likely | N/A | N/A | yes | no | Needs smoke | Safe after QA. |
| `/api/health` | API health | public | yes | N/A | N/A | yes | no | None | Safe. |
| `/api/search/books` | Search API | public with App Check | partial | N/A | N/A | yes | no | Failing quality tests | Fix before beta. |
| `/api/search/click` | Search telemetry | public | partial | N/A | N/A | yes | no | No App Check/auth found | Lock down or disable telemetry. |
| `/api/ai/librarian` | AI Librarian API | auth/App Check | partial | N/A | N/A | yes | no | Cost/hallucination risk | Include only with limits. |
| `/api/ai/chat` | AI chat API | auth only | stub | N/A | N/A | no | no | Placeholder response | Hide callers. |

## Data Integrity Risks

| required_check | status | audit finding | required action |
|---|---|---|---|
| single_canonical_write_paths | Partial | Core canonical collections deny client writes, but import, shelves, social interactions, venues/events, and legacy services create multiple mutation paths. | Keep books/authors/editions/posts/projects server-owned; remove legacy client mutation paths from beta routes. |
| firestore_rules_alignment | Partial | Rules align well for core canonical data, but root feedback write appears denied and notification updates are too broad. | Add callable feedback path or matching rule; restrict notification update fields. |
| schema_drift | High risk | `edition_shelves`, `edition_reading_state`, `external_sources`, mock DTOs, and React Query type drift indicate stale schemas/services. | Remove or quarantine legacy services from reachable beta flows. |
| unsafe_client_mutations | High risk | Venues/events/reviews/RSVPs and notification owner updates are client-authoritative. | Hide venues/events; narrow notification rules. |
| counter_integrity | Partial | Architecture uses server-owned aggregation and post stats; direct like/repost subcollection writes still exist as allowed rules. | Ensure every counter is trigger/function-owned and idempotent. |
| duplicate_write_paths | High risk | Social likes/reposts can be represented by callable paths and direct user subcollection writes; shelves have direct follower writes. | Keep one canonical write path per beta action. |
| broken_indexes | Unknown | Search/feed depend on indexed queries; test failures and broad features imply index risk. | Validate Firestore index deployment before beta. |
| orphaned_documents | Unknown | Imports, attachments, offline records, published projects, and deleted users require lifecycle jobs. | Run read-only orphan report before beta; do not expose delete/backfill tools broadly. |
| legacy_collections | Present | Legacy service references collections not clearly aligned with rules/current schema. | Quarantine legacy collection access from beta. |
| mock_data_leakage | Critical | Mock chunk is in production build; reachable screens import `data/mocks.ts`. | Remove or feature-gate all mock-backed surfaces. |
| production_vs_dev_conflicts | Medium | App Check disabled in dev but required in prod; missing key throws only in production. | Add release checklist validating App Check token flow and env vars. |

## AI System Risks

| required_check | status | finding | beta decision |
|---|---|---|---|
| actual_working_agents | Partial | AI Librarian and discover agent callables exist and use Gemini/Vertex with auth/App Check/consent. | Include only AI Librarian with tight limits. |
| fake_or_stub_agents | Present | `/api/ai/chat` returns deterministic placeholder; summarize is 501/unmounted; speech returns null; mock agent metadata drives UI. | Hide all stub-backed controls. |
| Gemini_dependencies | Present | Vertex/Gemini dependency exists for Librarian and Discover Agent. | Require daily quota/cost review. |
| context_memory_integrity | Partial | Context snapshot is collected server-side; agent session mutation exists. | Keep memory non-authoritative and user-consented. |
| rate_limit_risks | High | Librarian has quota handling; Discover Agent rate/cost controls are less clear. | Disable broad Discover Agent beta exposure. |
| cost_risks | High | Multi-agent UI could invite unbounded usage. | One AI entrypoint only, with quotas and logs. |
| fallback_behavior | Unsafe | Stub fallback paths produce plausible but fake assistant output. | Fail visibly or hide. Do not show fake production responses. |
| hallucination_risks | Medium | Recommendations are AI-generated and could overstate availability/canonical facts. | Present as suggestions only; never as source of record. |
| production_safety | Partial | App Check and consent are strong on real AI routes; chat route lacks App Check. | Add App Check or remove route exposure. |
| recommendation_quality | Unknown | Search/recommendation tests failing; quick recs can fall back to mock IDs. | Do not launch AI/discovery rec surfaces beyond Librarian. |

## Performance Audit

| required_check | status | finding | required action |
|---|---|---|---|
| large_bundle_sizes | High risk | Production build warns: `index` ~817 kB, `pdf.worker` ~1.37 MB, `PdfViewer` ~391 kB, `App` ~382 kB, `mocks` ~77 kB. | Keep reader lazy-loaded, remove mock chunk, split admin/social/write from beta bundle where possible. |
| unbounded_queries | Partial | Search API clamps limit to 30; several UI/direct Firestore services need query-bound verification. | Audit beta routes for every Firestore query limit. |
| n_plus_one_patterns | Medium | Book details/profile/social likely hydrate related entities; not fully performance-tested. | Load-test core route hydration with 20, 50, 100 concurrent beta users. |
| feed_efficiency | Partial | Social feed uses callable/infinite patterns; not recommended for beta exposure. | Hide or seed small read-only feed. |
| reader_performance | Medium risk | PDF worker and viewer are large; mobile rendering can be heavy. | Test representative PDFs/EPUBs on low-end mobile. |
| render_performance | Medium | Broad SPA routes and heavy lazy chunks can degrade first-user experience. | Feature-gate non-beta surfaces. |
| react_query_usage | High risk | Typecheck shows React Query v5 drift: `isLoading`, missing `initialPageParam`, invalid invalidate calls. | Fix reachable beta hooks and restore typecheck gate. |
| cache_integrity | Medium | Offline uses Cache API/IndexedDB/localStorage with type mismatches. | Hide offline until lifecycle is tested. |
| firebase_read_amplification | Medium | Details/profile/recommendations can amplify reads. | Add structured client metrics for beta core loop. |
| storage_usage_risks | Medium | User uploads and offline cache can grow; direct uploads are size-bounded. | Enforce beta upload quotas and storage cleanup. |

Performance target for constrained beta:

- Search API p95 under 800 ms for cached/canonical results.
- Book details p95 under 1.5 s after route navigation.
- Reader manifest p95 under 1.5 s excluding file render.
- Initial app interactive under 3 s on mid-range mobile over 4G.

## Security Risks

| required_check | status | finding | required action |
|---|---|---|---|
| firestore_rules_coverage | Strong core, weak edges | Core canonical writes are denied client-side. Edges include notifications, venues/events, feedback mismatch. | Fix edge rules before beta. |
| unsafe_public_writes | Medium | Venues/events/reviews/RSVPs allow client writes by signed-in users. | Hide these product areas. |
| missing_auth_checks | Medium | Search click telemetry lacks clear auth/App Check enforcement; `/api/ai/chat` has auth but no App Check. | Add App Check or remove exposure. |
| storage_exposure | Medium | Public reads for covers/user media/venues; direct original uploads bounded by MIME/size and book ownership. | Keep uploads limited; add scanning/checksum plan before scale. |
| admin_route_exposure | Medium | Admin UI is SPA-gated by `isAdmin`; backend/rules also guard privileged data. | Keep admin route hidden from navigation and superadmin-only. |
| client_side_authority | High | Some domains still treat client writes as source of truth. | Server-own beta-critical business state. |
| callable_validation_integrity | Partial | AI/search use schema/quota patterns; not every callable was audited deeply. | Validate all exposed beta callables with zod/schema and auth. |
| app_check_usage | Partial | Strong for search and AI Librarian; missing on chat and telemetry. | Require App Check for all write/AI/search telemetry APIs. |
| secret_exposure | No direct evidence | No secrets were observed in audited files, but env validation is runtime-sensitive. | Run secret scan before release. |
| unsafe_logs | Unknown | AI/search telemetry exist; privacy hashing appears used for search click query. | Ensure logs do not include raw user text, book uploads, or private messages. |

Security launch decision: beta must be authenticated, invite-only, App Check-enabled, and feature-gated. Do not allow anonymous exploration or public write surfaces during closed beta.

## UX Risks

| required_check | status | finding | required action |
|---|---|---|---|
| onboarding_clarity | Partial | Auth/bootstrap exists, but beta value path can be diluted by too many tabs/routes. | Make first session land on Search/Read. |
| empty_state_quality | Mixed | Some screens have states; mock-backed screens hide real empty states. | Remove mock fallback and show honest empty states. |
| loading_state_quality | Mixed | Lazy loading exists; many async surfaces need smoke. | Verify route-level loading for beta routes. |
| error_visibility | Weak | Silent mock fallback hides failures; stub AI returns plausible text. | Fail visibly with actionable messages. |
| navigation_confusion | High | Five tabs plus many immersive screens exceed beta scope. | Hide non-beta tabs/routes. |
| feature_overload | High | Writing, social, AI agents, venues, events, imports, admin, reader all visible. | Narrow to reading core loop. |
| core_loop_strength | Medium | Search/read/library loop is compelling and real. | Stabilize it and make it dominant. |
| discoverability | Mixed | Search is discoverable; discovery flows are misleading. | Remove fake discovery and improve search prompts. |
| social_clarity | Weak for beta | Posting, comments, likes, DMs, follows need moderation context. | Hide broad social until Phase 2. |
| reader_quality | Medium | Reader architecture is real but performance/device risk remains. | Device QA and representative content testing. |
| writing_experience | Partial | Editor exists but publishing is too risky. | Keep internal or draft-only after QA. |

The beta emotional experience should be: "I can find a book, open it, read it, and keep track of it." The current broad app risks making first users feel that BookTown is ambitious but inconsistent.

## Go To Market Readiness

| required_output | recommendation |
|---|---|
| strongest_core_loop | Search for a book, acquire readable access, read in-app, save progress/shelf state. |
| recommended_beta_positioning | "A private reading beta for finding and reading books in one place." Avoid positioning around social network, AI agents, publishing, or events. |
| minimum_viable_beta | Auth, search, book details, acquire/read, reader, shelves, profile basics, feedback, and AI Librarian opt-in. |
| highest_risk_area | Mock/stub-backed visible surfaces creating false product expectations. |
| highest_retention_potential | Reader progress plus shelves/library continuity. |
| most_impressive_feature | Real canonical search/acquire/read architecture with backend-owned reader manifest and signed access. |
| most_fragile_feature | Discovery/AI surfaces outside AI Librarian, especially camera/chat/summarize/speech. |
| recommended_first_user_type | 20-50 trusted readers who are comfortable reporting bugs and primarily want to search/read, not social-publish. |
| recommended_beta_size | 25 users for week 1, expand to 50 only after search/read/feedback metrics are clean. |
| must_fix_before_beta | Search tests, mock leakage, route gating, notification rule, feedback write path, AI stub hiding, critical type drift on beta routes. |
| safe_to_fix_after_beta | Social posting, DMs, venues/events, public publishing, Goodreads import, offline reading, multi-agent discovery, admin intelligence UX. |

## Founder Priority Map

### Fix Immediately

1. Hide all mock-backed production surfaces: Discovery Flow, BookFlow, For You, venue/event/bookfair discovery, mock agent routes, and quick-rec fallback.
2. Fix search test failures for Arabic exact title, normalization, ranking, language filter behavior, external readable sources, and tokenization module resolution.
3. Hide or implement AI camera/chat/summarize/speech. The safe beta decision is to hide them.
4. Fix notification Firestore rule to restrict user updates to read-state fields.
5. Fix feedback submission so beta users can reliably report issues.
6. Restore type safety for the constrained beta route set.
7. Add explicit beta feature gates so non-beta routes cannot be reached by URL.

### Stabilize Next

- Reader mobile/device QA for PDF and EPUB.
- Shelf bootstrap and read-state consistency.
- Book details data contract and removal of stale search result assumptions.
- AI Librarian quotas, logs, and consent copy.
- Search telemetry App Check/auth enforcement or disablement.
- SSR/public page smoke tests.

### Hide For Now

- Social creation/comments/reposts.
- Direct messaging.
- Write publishing.
- Goodreads import.
- Venues/events/bookfairs.
- Offline reading controls.
- Admin/intelligence navigation for non-admins.
- Discover Agent variants beyond AI Librarian.

### Ignore Until After Beta

- Public social graph growth.
- Venue/event ecosystem.
- AI speech.
- AI camera recognition.
- Full publication marketplace behavior.
- Automated canonical conflict resolution.
- Large-scale recommendation personalization.

### High Leverage Improvements

- A beta mode config that centrally declares enabled route IDs and feature flags.
- A release gate that runs frontend build, functions build, targeted typecheck, and beta test suite.
- Structured beta telemetry for search success, acquire success, reader open success, reader error, and feedback submitted.
- A server-owned feedback callable with severity, route, user agent, and sanitized client diagnostics.
- A deterministic seed/fixture set for beta-readable books.

### Wasted Effort Risk

- Polishing social/venues/events before the read loop is stable.
- Expanding AI agents while stubs remain visible.
- Building more discovery UI before real data ranking is fixed.
- Investing in admin dashboards before backend tests are green.
- Optimizing broad route performance before feature-gating the launch surface.

## Recommended Closed Beta Strategy

Launch a constrained reading beta only after the must-fix items are complete.

### Beta Configuration

| Area | Required launch setting |
|---|---|
| Access | Invite-only authenticated accounts. |
| App Check | Required in production for search, AI, telemetry, and all callable/write-sensitive surfaces. |
| Feature gates | Server/config-driven beta allowlist. |
| Routes | Expose Home, Read, Book Details, Reader, Shelf, Profile, Settings, Feedback, AI Librarian. |
| Hidden routes | Social creation, DMs, publishing, discovery flow, venues/events, imports, admin, intelligence, camera AI. |
| Monitoring | Daily review of search errors, reader failures, AI costs, feedback, and Firestore denied writes. |
| Support | Manual founder/operator triage for every feedback item during week 1. |
| Content | Use a verified set of readable books with known PDF/EPUB access. |

### Release Gate

The beta release branch must pass:

1. `npm run build`
2. `npm --prefix functions run build`
3. Targeted frontend typecheck for beta route files, or full `npx tsc --noEmit` if feasible.
4. Targeted search/acquire/reader tests.
5. Targeted Firestore rules tests for profile, notifications, feedback, shelves, reader, social-hidden paths.
6. Manual browser smoke on desktop and mobile viewport:
   - Sign in.
   - Search.
   - Open book details.
   - Acquire/read.
   - Turn pages.
   - Save progress.
   - Return to shelf/read tab.
   - Submit feedback.
   - Ask AI Librarian once.

### Beta Metrics

Minimum metrics for week 1:

- Search success rate: 90% of valid title/author searches return at least one relevant result.
- Acquire-to-reader success: 95% for verified readable books.
- Reader open failure rate: under 3%.
- Feedback submit success: 99%.
- AI Librarian hard-error rate: under 5%.
- Firestore permission-denied errors on beta routes: zero after day 1.

## Final Readiness Verdict

BookTown should not launch the current full application as Phase 1 closed beta.

The production architecture is stronger than the visible product suggests, but the exposed surface is not disciplined enough for first users. The codebase contains a real backend, real Firebase security boundaries for core data, and a credible reading loop. It also contains mock-backed discovery, stubbed AI, failing search tests, failing typecheck, failing test suites, and broad routes that invite users into unfinished systems.

The correct launch decision is:

1. Do not expose the full app.
2. Ship a constrained invite-only reading beta after the must-fix items are completed.
3. Position the beta around finding and reading books, not AI agents, social, publishing, or events.
4. Treat every mock/stub visible to beta users as a launch blocker.

Closed beta readiness verdict: **not ready as exposed; conditionally viable as a constrained reading beta after critical fixes.**
