# Firestore Legacy Classification Report

Status: Phase 3A analysis only  
Baseline reviewed: 100 remaining findings  
Behavior changes: none in this phase

## Executive Summary

The remaining Firestore safety baseline is mostly script-only maintenance debt. The primary production risk is concentrated in two runtime areas:

- `functions/src/deleteWriteProject.ts`: production-reachable authenticated user flow.
- `functions/src/admin/literaryAuthority.ts`: superadmin-reachable destructive catalog operations.

No remaining finding is scheduled or automatically recurring. The scheduled/worker class is currently zero for this baseline.

`functions/src/admin/backfillStats.ts` still contains unsafe read patterns, but it is now runtime-quarantined and refuses before reading unless running in local/emulator mode with an explicit override. Those findings are classified as false positives for current production risk, not because the code is clean, but because the execution path is blocked.

## Classification Totals

| Category | Count | Estimated Risk | Recommended Action |
|---|---:|---|---|
| A - Production Reachable | 5 | High | Fix first with explicit limits and bounded project-size contracts. |
| B - Scheduled / Automated | 0 | Low | No Phase 3A action. |
| C - Admin Only | 19 | Critical | Replace destructive broad scans with bounded, paginated admin flows. |
| D - Recovery / Maintenance | 62 | High when manually executed | Keep quarantined; migrate only active scripts to guarded runners. |
| E - Dead / Obsolete | 2 | Low runtime risk | Remove or archive after owner review. |
| F - False Positive | 12 | Low current production risk | Keep documented; improve scanner baseline later. |

## Category A Findings

Production-reachable by authenticated user or publishing flows.

| File | Lines | Execution Path | Production Credentials | FirestoreSafety Mitigated | Estimated Max Reads | Action |
|---|---:|---|---|---|---:|---|
| `functions/src/deleteWriteProject.ts` | 88, 89, 90 | Exported callable `deleteWriteProject`; authenticated project owner deletes a write project. | Yes, deployed function service account. | No. Has `MAX_CASCADE_DELETE_DOCS = 450`, but reads are not limited. | Up to matching project publish/duplicate rows before cap check. | Fix in Phase 3B with `.limit(MAX_CASCADE_DELETE_DOCS + 1)` per query and fail if exceeded. |
| `functions/src/publishing/loadChunkedProjectManuscript.ts` | 33, 41 | Used by publishing/export flows to load project sections and chunks. | Yes, through server publishing callables. | No. | Sections plus chunks for one project; unbounded per project. | Fix in Phase 3B with section/chunk hard caps and explicit failure. |

## Category B Findings

No remaining baseline finding is scheduled or automatically recurring.

## Category C Findings

Production-reachable only by authenticated superadmin/admin callable paths.

| File | Lines | Execution Path | Production Credentials | FirestoreSafety Mitigated | Estimated Max Reads | Action |
|---|---:|---|---|---|---:|---|
| `functions/src/admin/literaryAuthority.ts` | 2271 | Internal helper `getDocsForCollectionPath`; used by catalog delete/cascade planning. | Yes. | No. | Full dynamic collection path. | Replace with bounded helper or remove if unused. |
| `functions/src/admin/literaryAuthority.ts` | 3617, 3618, 3619 | `deleteCanonicalBookCascade` resolves editions by book/work/canonical ids. | Yes. | No. | All matching editions for one book. | Add per-query limits and fail on overflow. |
| `functions/src/admin/literaryAuthority.ts` | 3639 | Attachment lookups for each edition during delete cascade. | Yes. | No. | Attachments per edition, multiplied by edition count. | Bound editions first, then bound attachments per edition. |
| `functions/src/admin/literaryAuthority.ts` | 3657-3669 | Delete cascade scans dependent collections by `bookId`. | Yes. | No. | All identity, ingestion, progress, library, quote, review, reader, sync, and attachment docs for one book. | Replace with paged delete planning and max cascade budget. |
| `functions/src/admin/literaryAuthority.ts` | 5100 | `adminDeleteAllBooks` scans all `books`. | Yes. | No. | Entire catalog plus cascade per book. | Disable or replace with checkpointed destructive batch job requiring explicit approval. |

## Category D Findings

Recovery, maintenance, repair, normalization, backfill, or one-off scripts. These are not exported Cloud Functions. They can access production only if an operator runs them with production credentials.

| File | Lines | Execution Path | Production Credentials | FirestoreSafety Mitigated | Estimated Max Reads | Action |
|---|---:|---|---|---|---:|---|
| `functions/promoteSuperadmin.cjs` | 1 | Manual role-promotion script. | Yes, if operator provides credentials. | No. | Minimal Auth/Admin use; not a collection scan finding. | Keep quarantined; require explicit project id and production confirmation. |
| `functions/scripts/addCanonicalType.js` | 13, 36 | Manual canonical repair script. | Yes, if operator provides credentials. | No. | Full `books` scan. | Migrate or archive. |
| `functions/scripts/addPhilosophicalCanonicalType.js` | 14, 56 | Manual canonical repair script. | Yes. | No. | Full `books` scan. | Migrate or archive. |
| `functions/scripts/applyBookFormAuthority.ts` | 1, 50 | Manual authority application script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/applyFormAuthority.ts` | 1, 137 | Manual authority application script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/applyLiteraryRelationshipsAuthority.ts` | 1 | Manual authority script; direct Admin SDK init finding. | Yes. | No. | Script-specific; scanner flags credentials risk. | Add shared script guard if retained. |
| `functions/scripts/applySubFormAuthority.ts` | 1 | Manual authority script; direct Admin SDK init finding. | Yes. | No. | Script-specific. | Add shared script guard if retained. |
| `functions/scripts/buildCanonicalTraditionMappings.ts` | 1, 165 | Manual mapping/audit script. | Yes. | No. | Full `books` scan. | Migrate to bounded page reads. |
| `functions/scripts/checkBatch120.cjs` | 1 | Manual spot-check script. | Yes. | No. | Low; direct-init risk only. | Add shared script guard or archive. |
| `functions/scripts/checkCitiesOfSalt.cjs` | 1 | Manual spot-check script. | Yes. | No. | Low; direct-init risk only. | Add shared script guard or archive. |
| `functions/scripts/checkSnowCountry.cjs` | 1 | Manual spot-check script. | Yes. | No. | Low; direct-init risk only. | Add shared script guard or archive. |
| `functions/scripts/cleanupIntelligencePersonas.cjs` | 91 | Manual cleanup script. | Yes. | No. | Full `books` scan. | Migrate or archive. |
| `functions/scripts/detectAliasRisks.js` | 1, 30 | Manual audit script. | Yes. | No. | Full `books` scan. | Migrate to bounded read-only runner. |
| `functions/scripts/enrichCanonicalCorpus.js` | 13, 139 | Manual enrichment script. | Yes. | No. | Full `books` scan plus writes. | Migrate to dry-run bounded runner. |
| `functions/scripts/exportBooksAudit.cjs` | 1 | Manual export script; direct-init risk only in current scanner output. | Yes. | No. | Existing script limits to 50 docs, but lacks production guard. | Add shared script guard. |
| `functions/scripts/exportBooksForEditorial.ts` | 1, 19 | Manual editorial export. | Yes. | No. | Full `books` scan. | Migrate to paged export. |
| `functions/scripts/finalCanonicalCleanup.cjs` | 1 | Manual cleanup script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/finalNormalize115.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/fixLastTwoCanonicalFields.cjs` | 1 | Manual repair script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/fixRemainingCanonicalRows.cjs` | 1, 80 | Manual repair script. | Yes. | No. | Unbounded title-match query per fix. | Add query limits and guard. |
| `functions/scripts/fixTier1Canonical.js` | 14, 63 | Manual repair script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/generateCanonicalTraditionProposals.ts` | 1, 118 | Manual proposal generation. | Yes. | No. | Full `books` scan. | Migrate to paged read-only runner. |
| `functions/scripts/inferPublicationYears.js` | 1, 30 | Manual inference script. | Yes. | No. | Full `books` scan. | Migrate or archive. |
| `functions/scripts/lockCanonicalCorpus.js` | 1, 7 | Manual corpus lock script. | Yes. | No. | Full `books` scan plus writes. | Require explicit dry-run and bounded pages. |
| `functions/scripts/manualCanonicalFixes.js` | 1 | Manual repair script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/mergeCitiesOfSalt.js` | 1 | Manual repair script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/normalizeAuthorKeys.js` | 1, 21 | Manual normalization script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/normalizeBatch120.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/normalizeCanonicalBooks.js` | 1, 57 | Manual normalization script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/normalizeDeadSouls.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/normalizePublicationYears.js` | 1, 53 | Manual normalization script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/normalizeSnowCountry.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/normalizeTanners.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/normalizeTitles.cjs` | 1 | Manual normalization script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/rebalanceCanonicalTier.js` | 14, 130 | Manual repair script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/reconcileCatalogAttachments.ts` | 396 | Manual reconciliation script. | Yes. | No. | All ebook attachments. | Add limit/page cursor and dry-run default. |
| `functions/scripts/refineBatch109.cjs` | 1 | Manual refinement script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/refineCivilizationalBatch.cjs` | 1 | Manual refinement script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/refineLatinArabBatch.cjs` | 1 | Manual refinement script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/repairAuthorVariants.js` | 1, 33 | Manual repair script. | Yes. | No. | Full `books` scan. | Migrate to bounded runner. |
| `functions/scripts/seedIntelligencePersonas.cjs` | 218 | Manual seed script. | Yes. | No. | Full `books` scan. | Add guard and bounded page reads. |
| `functions/scripts/seedReligiousCanon.js` | 1 | Manual seed script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `functions/scripts/setCanonicalEra.js` | 1 | Manual repair script. | Yes. | No. | Script-specific; direct-init risk. | Add guard or archive. |
| `scripts/exportBooksAudit.js` | 1 | Root manual export script. | Yes. | No. | Existing script limits to 50 docs, but lacks production guard. | Add guard or move under quarantined runner. |

## Category E Findings

Dead, obsolete, or currently unreferenced implementation candidates.

| File | Lines | Execution Path | Production Credentials | FirestoreSafety Mitigated | Estimated Max Reads | Action |
|---|---:|---|---|---|---:|---|
| `functions/src/library/admin/backfillCanonicalKeys.ts` | 9, 10 | Exported helper function, but no production import/export path found. | Not currently reachable. | No. | All books and editions missing canonical keys if called. | Candidate for removal or archive after owner confirmation. |

## Category F Findings

Scanner findings that are currently safe due to guards, wrappers, or being the central Admin SDK initialization path.

| File | Lines | Reason | Action |
|---|---:|---|---|
| `functions/src/admin/backfillStats.ts` | 60, 98, 137, 164, 206, 222 | Runtime-quarantined; callable refuses before reads unless local/emulator plus explicit override. | Keep documented until removed or rewritten. |
| `functions/src/firebaseAdmin.ts` | 1 | Central backend Admin SDK initialization, not a maintenance script. | Keep; scanner baseline should eventually special-case it. |
| `functions/scripts/addCanonicalFingerprints.js` | 1 | Phase 2 guard runs before `admin.initializeApp()` and refuses unsafe production execution. | Remove from baseline after scanner recognizes script guard. |
| `functions/scripts/auditCanonicalAuthorityDepth.js` | 1 | Phase 2 guard runs before `admin.initializeApp()` and bounded page read is in place. | Remove from baseline after scanner recognizes script guard. |
| `functions/scripts/detectCanonicalDuplicates.js` | 1 | Phase 2 guard runs before `admin.initializeApp()` and bounded page read is in place. | Remove from baseline after scanner recognizes script guard. |
| `functions/scripts/fillCanonicalTier.js` | 1 | Phase 2 guard runs before `admin.initializeApp()` and bounded dry-run default is in place. | Remove from baseline after scanner recognizes script guard. |
| `functions/scripts/repairCanonicalFingerprints.js` | 1 | Phase 2 guard runs before `admin.initializeApp()` and bounded dry-run default is in place. | Remove from baseline after scanner recognizes script guard. |

## Top 10 Highest-Risk Remaining Findings

| File | Line | Category | Production Reachable | Estimated Max Reads | Priority |
|---|---:|---|---|---:|---|
| `functions/src/admin/literaryAuthority.ts` | 5100 | C | Superadmin only | Entire `books` collection plus cascade per book | P0 |
| `functions/src/admin/literaryAuthority.ts` | 3659 | C | Superadmin only | All `reading_progress` for one book | P0 |
| `functions/src/admin/literaryAuthority.ts` | 3660 | C | Superadmin only | All `user_library_books` for one book | P0 |
| `functions/src/admin/literaryAuthority.ts` | 3666 | C | Superadmin only | All `reader_events` for one book | P0 |
| `functions/src/admin/literaryAuthority.ts` | 3667 | C | Superadmin only | All `reader_audit` for one book | P0 |
| `functions/src/deleteWriteProject.ts` | 88 | A | Yes | All published books for one project | P1 |
| `functions/src/deleteWriteProject.ts` | 89 | A | Yes | All publish ops for one project | P1 |
| `functions/src/publishing/loadChunkedProjectManuscript.ts` | 41 | A | Yes | All chunks per section | P1 |
| `functions/scripts/reconcileCatalogAttachments.ts` | 396 | D | Manual only | All ebook attachments | P1 |
| `functions/scripts/seedIntelligencePersonas.cjs` | 218 | D | Manual only | Full `books` collection | P1 |

## Recommended Remediation Order

1. Disable or rewrite `adminDeleteAllBooks` in `literaryAuthority`; replace with explicit paged destructive job if still required.
2. Add hard limits to `deleteCanonicalBookCascade` dependent collection queries.
3. Add per-query limits to `deleteWriteProject` and fail if any query returns `MAX_CASCADE_DELETE_DOCS + 1`.
4. Add project manuscript section/chunk caps in `loadChunkedProjectManuscript`.
5. Guard/migrate `reconcileCatalogAttachments.ts` and `seedIntelligencePersonas.cjs`.
6. Migrate active canonical scripts with full `books` scans to `firestoreScriptSafety.cjs`.
7. Archive or remove obsolete one-off normalization scripts after owner review.
8. Teach `firestoreSafetyCheck.mjs` to recognize guarded scripts and remove false-positive baseline entries.

## Dead Code Removal Candidates

- `functions/src/library/admin/backfillCanonicalKeys.ts`: unreferenced helper, and current implementation reads broad missing-key sets before logging a blocked status.
- Old one-off normalization scripts under `functions/scripts/normalize*.cjs` and `functions/scripts/refine*.cjs`: likely historical repair artifacts. Confirm with owner before removal.
- Spot-check scripts such as `checkBatch120.cjs`, `checkCitiesOfSalt.cjs`, and `checkSnowCountry.cjs`: likely obsolete after canonical corpus stabilization.

## False Positive Candidates

- `functions/src/firebaseAdmin.ts`: legitimate shared Admin SDK module.
- `functions/src/admin/backfillStats.ts`: production execution currently refused before any read.
- Phase 2 guarded scripts: `addCanonicalFingerprints.js`, `auditCanonicalAuthorityDepth.js`, `detectCanonicalDuplicates.js`, `fillCanonicalTier.js`, `repairCanonicalFingerprints.js`.

## Estimated Remaining Firestore Risk

Runtime production risk is now concentrated in 24 findings:

- 5 normal production-reachable findings.
- 19 superadmin-only destructive catalog findings.

Manual production risk remains high because 62 maintenance findings can still run with production credentials if an operator bypasses quarantine. The highest manual-risk scripts are full `books` scans and attachment/corpus reconciliation scripts.

Scheduled automated risk from the remaining baseline is currently zero.

