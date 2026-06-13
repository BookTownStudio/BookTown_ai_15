---
id: BT-AUDIT-MOCK-CONTAMINATION-PRODUCTION-TRUTH-AUDIT
title: "BookTown Mock Contamination And Production Truth Audit"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/mock_contamination_production_truth_audit.md
---

# BookTown Mock Contamination And Production Truth Audit

Audit date: 2026-05-06  
Mode: read-only source and build audit  
Report target: `/audit/mock_contamination_production_truth_audit.md`

## Executive Summary

BookTown currently has material production truth contamination. The strongest evidence is the production build itself: `npm run build` succeeds, but emits `dist/assets/mocks-5b857931.js` at 76.58 kB, 22.80 kB gzip. The generated route preload graph references this mock chunk from production user routes including `home`, `discover`, `bookDetails`, `discoveryFlow`, `agentChat`, an editor/project route chunk, and the main `App` route registry.

The root architectural problem is not the existence of mocks. The problem is that `data/mocks.ts` is a production-importable, typed, canonical-looking domain module. It exports books, users, authors, shelves, quotes, social posts, projects, agents, venues, events, fairs, notifications, and conversations using production entity types. This collapses the boundary between fixture data and production truth.

Highest-risk user-visible contamination:

- Home recommendations silently fall back to `mockFallbackBookIds` when recommendation fetch fails or returns no data.
- Discovery Flow renders `mockBookFlowData` and `mockForYouFlowData` as real immersive feed content.
- Book Details supports `bookId === "surprise"` by selecting a random book from `mockBooks`.
- Discover and Agent Chat use `mockAgents` as the production agent roster and persona UI source.
- `/api/ai/chat` is explicitly a deterministic stub that returns "getting ready" text while production UI routes expose agent chat.
- User Feedback attaches a mock image instead of real uploaded evidence.
- Admin Feedback exposes `getFeedbackPipelineStub()` through the admin dashboard.

Verdict: BookTown build truth is currently unreliable. The app can ship a successful production bundle while exposing fake data paths, stubbed AI behavior, and silent fallback content to real users.

## Global Mock Inventory

Executed detection commands:

| Command | Result |
|---|---:|
| `npm run build` | Pass; emitted `dist/assets/mocks-5b857931.js` |
| `npx vite-bundle-visualizer` | Pass; emitted same mock chunk and stats HTML |
| `grep -R "mock" .` | 1095 matches in audited logs |
| `grep -R "stub" .` | 153 matches |
| `grep -R "fallback" .` | 1165 matches |
| `grep -R "placeholder" .` | 128 matches |
| `grep -R "dummy" .` | 0 matches |
| `grep -R "fixture" .` | 108 matches |

Dependency and generated-noise directories were excluded from grep expansion, while production `dist` was included for bundle contamination checks.

| File / Symbol | Type | Reachable from production | Bundled in production | User visible | Severity | Notes |
|---|---|---:|---:|---:|---|---|
| `data/mocks.ts` | Fixture module using production entity types | Yes | Yes | Yes | Critical | Central contamination source. Imports icons and exports fixture domain records as typed production entities. |
| `mockUsers` | Fake users | Indirect | Yes | Yes through feed/profile-like data | High | Contains fake identities, emails, roles, counters, interests, and activity timestamps. |
| `mockAuthors` | Fake/canned author records | Indirect | Yes | Yes through feeds/attachments | High | Coexists with canonical author service, widening schema ownership. |
| `mockBooks` | Fake/canned book catalog | Yes | Yes | Yes | Critical | Used by Book Details surprise route and fixture feeds; mutates `isEbookAvailable` after declaration. |
| `mockFallbackBookIds` | Silent fallback recommendations | Yes | Yes | Yes | Critical | Used by `useQuickRecs` when recommendation data is absent or failed. |
| `mockBookFlowData` | Fake immersive book feed | Yes | Yes | Yes | Critical | Directly rendered in Discovery Flow and Book Flow. |
| `mockForYouFlowData` | Fake mixed feed | Yes | Yes | Yes | Critical | Renders mixed book/user/quote/venue/event/fair content as real For You feed. |
| `mockSocialFeedPosts` | Fake social activity | Not currently directly imported in audited production source | Yes if mock chunk loaded | Potential | Medium | High trust risk if reconnected because it mimics real public social activity. |
| `mockAgents` | Agent roster/persona fixture | Yes | Yes | Yes | Critical | Powers Discover agent cards, Agent Chat header, and Editor mentor CTA. |
| `data/analyticsMocks.ts` | Mock analytics data | No import found | No direct evidence | No | Low | Safe only if kept isolated from production imports. |
| `lib/hooks/useDiscoverySignals.ts` | Pure stub hook | No import found | No evidence | No current path | Low | Dormant stub. Should not be production-importable without a gate. |
| `edge/discovery/getDiscoveryDirections.ts` fallback directions | Static fallback behavior | Potential if edge deployed | Not Vite bundle | Yes if endpoint used | Medium | Deterministic fallback is transparent only if UI labels it as generic. |
| `functions/src/api.ts` `/api/ai/chat` | Deterministic AI stub | Yes | Backend deployed route | Yes | Critical | Exposed behind auth as production API. |
| `services/realAgentService.generateSpeech` | No-op stub | Potential | Yes | Yes if invoked | High | Returns `null` with warning; can make UI believe a feature exists. |
| `app/drawer/feedback.tsx` `MOCK_IMAGE` | Fake attachment | Yes | Yes | Yes | High | User attachment action inserts Unsplash mock image. |
| `lib/services/adminService.getFeedbackPipelineStub` | Admin service stub | Yes for admins | Yes | Admin visible | High | Production admin dashboard displays stubbed pipeline state. |
| `app/admin/partner-dashboard.tsx` | Placeholder screen | No route found | No route evidence | No current path | Low | Acceptable only if kept unroutable or explicitly gated. |
| `scripts/*fixture*` and function test mocks | Test/dev fixtures | No | No | No | Low | Acceptable fixture/test infrastructure. |

## Production Mock Contamination Matrix

| Mock/Stub | File | Production Reachable | Bundled In Production | User Visible | Severity | Recommended Action |
|---|---|---:|---:|---:|---|---|
| `data/mocks.ts` chunk | `dist/assets/mocks-5b857931.js` | Yes | Yes, 76.58 kB | Yes | Critical | Move fixtures under test/dev-only boundary and forbid production imports. |
| `mockFallbackBookIds` | `lib/hooks/useQuickRecs.ts:5`, `:18` | Yes via Home | Yes | Yes | Critical | Replace with explicit empty/error state or server-owned fallback response with provenance. |
| `mockBookFlowData` | `app/discovery/flow.tsx:8`, `:23`; `app/bookflow/feed.tsx:4`, `:33` | Yes | Yes | Yes | Critical | Gate route or back it with production feed API. |
| `mockForYouFlowData` | `app/discovery/flow.tsx:8`, `:174` | Yes | Yes | Yes | Critical | Remove from production feed path; require real feed service. |
| `mockBooks` surprise route | `app/book-details.tsx:41`, `:154-163` | Yes | Yes | Yes | Critical | Replace with backend random/recommendation endpoint or disable route. |
| `mockAgents` | `app/tabs/discover.tsx:6`, `app/agent.tsx:11`, `app/editor/[id].tsx:372` | Yes | Yes | Yes | Critical | Move agent definitions to canonical config/service, not fixture module. |
| `/api/ai/chat` deterministic stub | `functions/src/api.ts:1015-1053` | Yes | Backend | Yes | Critical | Do not expose as production AI; either implement real engine or return explicit unavailable error. |
| Feedback mock image | `app/drawer/feedback.tsx:22`, `:39-43` | Yes | Yes | Yes | High | Replace with real upload flow or disable attachment action. |
| Feedback pipeline stub | `lib/services/adminService.ts:1891-1896`, `app/drawer/admin.tsx:816-847` | Admin reachable | Yes | Admin visible | High | Hide behind internal flag or implement real backend pipeline status. |
| Discovery fallback directions | `edge/discovery/getDiscoveryDirections.ts:25-27`, `:81-134` | Potential | Edge/backend | Potential | Medium | Keep only as labeled generic fallback with telemetry. |

## Production Bundle Contamination

`npm run build` passes and produces a production mock chunk:

- `dist/assets/mocks-5b857931.js`, 76.58 kB, 22.80 kB gzip.
- `npx vite-bundle-visualizer` also succeeds and reports the same mock chunk.
- Route preload references found for `book-details-62eb671a.js`, `home-f7a36588.js`, `flow-6549ea54.js`, `App-2c734ba2.js`, `agent-48acf6bd.js`, `_id_-50ae756f.js`, and `discover-e048f3ba.js`.

The contamination is not only unused dead code. The emitted chunk is required by reachable lazy-loaded routes, so tree-shaking cannot remove it. The root cause is direct production imports from `data/mocks.ts`.

## Route Contamination Audit

| Route / Surface | Imports mock data | Imports stub service | Fake fallback behavior | User visible | Production reachable | Severity | Recommended action |
|---|---:|---:|---:|---:|---:|---|---|
| Home tab | Through `useQuickRecs` | No | Failed or absent recommendations become mock book IDs | Yes | Yes, default tab | Critical | Server-authoritative recommendations or explicit unavailable state. |
| Discover tab | `mockAgents` | AI chat backend stub path | Agent roster and session UI are fixture-owned | Yes | Yes | Critical | Canonical agent registry plus real capability state. |
| Agent Chat immersive | `mockAgents` | `/api/ai/chat` through agent service | Stub chat response for non-librarian AI path | Yes | Yes | Critical | Block unavailable agents or use production AI contract. |
| Book Details | `mockBooks` | No | `bookId=surprise` resolves random fixture book | Yes | Yes | Critical | Backend-owned surprise endpoint with catalog provenance. |
| Discovery Flow | `mockBookFlowData`, `mockForYouFlowData` | No | Entire feed uses fixture content | Yes | Yes | Critical | Disable/gate until real feed source exists. |
| Book Flow Feed | `mockBookFlowData` | No | Entire feed uses fixture content | Yes if routable | Not registered in `App.tsx`, but source exists | High | Remove from production source or keep dev-only. |
| Editor | `mockAgents` mentor | Agent chat stub path | Mentor persona sourced from mocks | Yes | Yes | High | Use canonical agent registry and capability flags. |
| Feedback drawer | `MOCK_IMAGE` | No | Attachment action creates fake image | Yes | Yes | High | Real media upload only; otherwise no attachment button. |
| Admin Dashboard feedback tab | No mock import | `getFeedbackPipelineStub` | Admin sees static pipeline message | Admin only | Yes for admins | High | Real backend status or explicit "not implemented" feature gate. |
| Partner Dashboard | No mock import | Placeholder component | Under-construction screen | No route found | No current route | Low | Keep unroutable or internal-only. |

## Fake Behavior Audit

### Fake Behavior Matrix

| System | Fake Behavior | How Users Experience It | Severity | Trust Risk | Recommended Resolution |
|---|---|---|---|---|---|
| Home Recommendations | Mock fallback book IDs replace failed/empty recommendations | User sees normal-looking recommendations after backend failure | Critical | User cannot distinguish real personalization from fake data | Remove silent fallback; show error/empty or server-authored fallback with provenance. |
| Discovery Flow Books | Hardcoded quote/book feed | User scrolls a feed that appears live and personalized | Critical | Product appears more complete than backend reality | Require real feed API before exposure. |
| Discovery Flow For You | Hardcoded mixed content including users, venues, events, fairs | User sees synthetic discovery graph | Critical | Social and local marketplace trust damage | Gate route or label as preview with non-production data source. |
| AI Agent Chat | `/api/ai/chat` deterministic "getting ready" response | User expects AI but receives canned text | Critical | Deceptive AI capability signal | Return explicit unavailable state or implement actual AI endpoint. |
| Agent Roster | `mockAgents` defines production agents and premium states | User sees agent capabilities as product truth | Critical | Capability merchandising can be false | Canonical server/config registry with enabled/disabled state. |
| Book Surprise | Random fixture book selected client-side | User gets fake catalog randomness | High | Catalog authority is bypassed | Backend random/recommendation endpoint. |
| Feedback Attachments | Mock Unsplash image inserted | User thinks attached evidence was uploaded | High | Direct evidence deception | Use real upload or disable attachments. |
| Admin Feedback Pipeline | Static disconnected message from service stub | Admin sees non-operational pipeline as dashboard panel | High | Ops dashboard credibility risk | Real operational status contract. |
| Discovery Directions | Static generic fallback directions | User may see generic discovery prompts | Medium | Lower risk if clearly generic; higher if presented as personalized | Add provenance and telemetry. |

## Silent Fallback Audit

### Silent Fallback Matrix

| Fallback Path | Trigger | What User Sees | Detectable By User | Severity | Recommended Action |
|---|---|---|---:|---|---|
| `useQuickRecs` -> `mockFallbackBookIds` | Recommendation query error or missing data | Book recommendations | No | Critical | Replace with explicit error/empty state or server-owned fallback. |
| `LibrarianResponse` fallback IDs | `bookId` starts with `fallback_` or `topic_seed_` | Text-only recommendation explanation | Partially | Medium | Label as generic fallback and log fallback provenance. |
| `LibrarySearchService.search` | Search service throws | Empty result list | No | High | Propagate typed search error; UI must distinguish failure from no matches. |
| `RealAgentService.identifyBook` | Backend AI failure | Null result, likely no identification | No | High | Surface explicit capture/AI failure state. |
| `RealAgentService.analyzeShelfVibe` | JSON parse failure | Null vibe result | No | Medium | Return typed error and preserve failed payload diagnostics. |
| `RealAgentService.generateSpeech` | Any call | Null audio | No unless UI handles it | High | Remove feature surface or implement dedicated audio endpoint. |
| `edge/discovery` fallback directions | Missing/insufficient discovery input | Generic discovery directions | No unless labeled | Medium | Mark as generic fallback; do not imply personalization. |
| Book Search error handling | Failed HTTP payload parse | Generic fallback error message | Yes | Low | Acceptable as message fallback, not fake data. |

## Schema/Type Contamination Audit

The fixture module imports and populates production entity types directly:

`User`, `Book`, `Shelf`, `Quote`, `Project`, `Post`, `Agent`, `Review`, `RecommendedShelf`, `Template`, `BookFlowItem`, `Author`, `ForYouFlowItem`, `Venue`, `Event`, `BookFair`, `VenueReview`, `Bookmark`, `Conversation`, `DirectMessage`, `Notification`, `AdminFeedback`, and `PostComment`.

This is the main schema contamination vector. Production model changes must now accommodate fixture data, and fixture fields can normalize unsafe assumptions into canonical DTOs. Examples:

- `mockBooks` uses production `Book` and then mutates `isEbookAvailable` after declaration, creating non-source-of-truth behavior.
- `mockUsers` includes roles, AI consent, moderation fields, counters, and timestamps, making fixtures look like real auth/profile authority.
- `mockSocialFeedPosts` encodes real-looking public social activity, counters, attachments, comments, and timestamps.
- `mockAgents` acts as both fixture and production agent configuration.
- `mockForYouFlowData` mixes several entity types into a feed DTO without a production service boundary.

Required rule: production entities may be used by fixtures only inside test/dev-only packages that cannot be imported from `app`, `components`, `lib`, or `services` production graphs.

## AI Truth Integrity Audit

The AI surface is materially unstable:

- `functions/src/api.ts:1015-1053` exposes `/api/ai/chat` and documents it as a deterministic stub.
- `services/realAgentService.ts:251-263` maps `chat()` to `/api/ai/chat` and returns `response.text`.
- `app/agent.tsx` and `app/tabs/discover.tsx` expose agent chat UI to users using `mockAgents`.
- `services/realAgentService.ts:467-492` returns `null` on book identification failure.
- `services/realAgentService.ts:515-517` returns `null` for speech generation while logging that the endpoint is coming later.

The librarian endpoint is more production-shaped: `/api/ai/librarian` enforces auth, App Check, AI consent, request schema parsing, and server-owned recommendations. The architectural split is therefore inconsistent: one AI path is contract-governed, while the generic chat path is a live deterministic stub.

Production rule: no AI surface may return fake success. If an AI capability is unavailable, return a typed unavailable/error response and make the UI display unavailable state.

## Environment Boundary Audit

Current boundary weaknesses:

- `data/mocks.ts` is located in a top-level production import path, not under `test`, `fixtures`, `dev`, or `storybook`.
- No `NODE_ENV`, feature flag, or preview label gates protect production imports of mocks.
- Vite includes the mock chunk in production because route code imports it directly.
- `getFeedbackPipelineStub()` is in the production admin service, not a dev-only adapter.
- `app/drawer/feedback.tsx` mock attachment behavior is not environment-gated.
- `functions/src/api.ts` exposes `/api/ai/chat` as a real backend route rather than a development stub route.

Acceptable dev/test boundaries:

- Vitest `vi.mock(...)` usage in `*.test.ts` files.
- Script-local benchmark/fixture generation that is not bundled or routed.
- Dormant placeholder screens only if not reachable and excluded from production routing.

## Trust Risk Assessment

Systems most likely to damage user trust:

- Personalized recommendations on Home, because users cannot tell that backend failure produced fixed mock books.
- AI agents, because the UI sells chat capability while one backend route is a deterministic stub.
- Discovery Flow, because immersive feed content appears live, personalized, and social.
- Feedback attachments, because user-supplied evidence is replaced with fake imagery.
- Admin feedback operations, because operational dashboard panels appear connected to a pipeline that is not implemented.

Systems that appear more complete than they are:

- Agent roster and premium agent merchandising.
- For You discovery feed.
- Book Flow feed.
- Feedback attachment upload.
- Speech generation.
- Admin feedback pipeline.

Areas where users cannot distinguish real vs fake:

- Home recommendation fallback.
- Discovery feed content.
- AI "getting ready" response unless users infer it is a placeholder.
- Search failure mapped to empty results.
- Generic discovery fallback directions if presented as personalized.

## Production Truth Governance Matrix

| System | Allowed In Dev | Allowed In QA | Allowed In Production | Requires Feature Flag | Requires Explicit Preview Label |
|---|---:|---:|---:|---:|---:|
| Test mocks and `vi.mock` | Yes | Yes | No | No | No |
| Fixture data for demos | Yes | Yes, seeded isolated project only | No | Yes | Yes |
| Storybook/demo components | Yes | Yes | No | Yes | Yes |
| `data/mocks.ts` as production import | No | No | No | Not sufficient | Not sufficient |
| Agent roster config | Yes | Yes | Yes only if canonical config/service | Yes for unavailable agents | Yes for preview agents |
| AI deterministic stubs | Yes | QA only with fake-data banner | No | Yes | Yes |
| Server-authored generic fallback recommendations | Yes | Yes | Yes if provenance logged | Yes | Yes if user-facing |
| Client-side mock fallback recommendations | No | No | No | Not sufficient | Not sufficient |
| Feedback mock attachments | Yes for visual tests | QA only | No | Yes | Yes |
| Admin operational stubs | Yes | QA only | No | Yes | Yes |
| Static visual placeholders | Yes | Yes | Yes only as UI skeleton/empty state | No | No |

## Trust Instability Matrix

| Surface | Source Of Instability | User Confusion Risk | Perceived Product Risk | Priority |
|---|---|---|---|---|
| Home recommendations | Silent mock fallback | Very high | Personalization appears false | P0 |
| Discovery Flow | Hardcoded mixed feed | Very high | Social/discovery graph appears fake | P0 |
| AI agents | Stub endpoint plus mock agent config | Very high | AI capability appears deceptive | P0 |
| Book Details surprise | Client random fixture book | High | Catalog authority bypass | P1 |
| Feedback attachments | Mock image insertion | High | User evidence handling not real | P1 |
| Admin Feedback | Stub service in admin dashboard | Medium | Ops maturity appears inflated | P1 |
| Search orchestration | Errors converted to empty lists | Medium | Search quality appears poor instead of unavailable | P1 |
| Edge discovery directions | Generic fallback | Medium | Personalization ambiguity | P2 |
| Analytics mocks | Unused fixture module | Low | Low unless imported | P3 |

## Governance Strategy

What should remain as dev fixture:

- Test-local mocks and `vi.mock(...)`.
- Script-generated benchmark artifacts that never route into production.
- Fixture datasets for Storybook or isolated QA, kept outside production import paths.

What should be removed from production:

- Direct imports from `data/mocks.ts` in `app`, `components`, `lib`, and `services`.
- `mockFallbackBookIds` as a Home recommendation fallback.
- Mock image attachment behavior in Feedback.
- `/api/ai/chat` deterministic success response.
- `getFeedbackPipelineStub()` from the production admin service path.

What should be gated:

- Discovery Flow until it has a real feed backend.
- Preview/demo feeds, if needed for QA.
- AI agents whose backend capability is not live.
- Admin panels for unfinished operational pipelines.

What should be internal only:

- Partner Dashboard placeholder.
- Analytics mock datasets.
- Any synthetic social feed or fake users.

What requires real backend before exposure:

- Personalized recommendations.
- For You feed.
- Agent chat beyond the production librarian endpoint.
- Feedback attachments.
- Admin feedback pipeline.
- Speech generation.

Recommended mock architecture:

- Move mock data to `test/fixtures`, `storybook/fixtures`, or `dev/fixtures`.
- Add a production import ban so `app`, `components`, `lib`, `services`, and `functions/src` cannot import fixture modules.
- Use environment-specific adapters at the app boundary, not inside hooks or services.
- Use explicit fixture brands, for example `FixtureBook`, so fixtures cannot silently widen canonical production models.

Recommended fixture architecture:

- Keep seed data in backend-owned seed scripts when it represents catalog truth.
- Keep UI fixture data in isolated demo bundles only.
- Require fixtures to be clearly labeled in QA/demo environments.
- Do not use production Firestore DTOs as fixture authority unless the fixture is generated from the canonical schema and excluded from runtime imports.

Recommended production truth rules:

- Production UI may render only backend-authored data, explicit empty states, or explicit unavailable states.
- No client-side fake data fallback after API failure.
- No fake success for AI, uploads, search, recommendations, or admin operations.
- Every fallback must have provenance, telemetry, and user-visible semantics when it changes user interpretation.
- Production build must fail if mock/fixture modules are imported by runtime code.

## Final Production Truth Verdict

BookTown does not currently maintain a hard architectural boundary between production truth and development/demo infrastructure. The production bundle contains a dedicated mock chunk and multiple reachable routes render or depend on fixture data. The most urgent stabilization work is to remove direct production imports from `data/mocks.ts`, replace silent recommendation and search fallbacks with explicit states or server-owned fallback contracts, and either implement or gate AI and feedback capabilities that are currently stubbed.

The product should not ship to real users with the current mock exposure unchanged.
