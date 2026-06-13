---
id: BT-DOCS-ENGINEERING-FIRESTORE-AUDIT-REPORT
title: "Firestore Audit Report"
status: active
authority_level: governance
owner: engineering-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Firestore Audit Report

Status: P0 governance baseline  
Incident date: 2026-05-01  
Budget target: approximately $5/month during beta

## Audit Findings

The May 1 billing spike is consistent with manual Admin SDK maintenance work, especially canonical repair, audit, normalization, and backfill scripts that call `db.collection("books").get()` without pagination or a read ceiling.

The highest-risk code is concentrated in maintenance and admin paths, not normal user-facing read paths. Most runtime callables use direct document reads or bounded queries. Most Phase 8A recovery functions are already batch-limited. Legacy scripts and global backfills bypass those controls.

## Critical Risks Found

Critical unbounded `books` scans:

- `functions/scripts/fillCanonicalTier.js`
- `functions/scripts/detectCanonicalDuplicates.js`
- `functions/scripts/auditCanonicalAuthorityDepth.js`
- `functions/scripts/normalizeCanonicalBooks.js`
- `functions/scripts/addCanonicalFingerprints.js`
- `functions/scripts/repairCanonicalFingerprints.js`
- `functions/scripts/normalizeAuthorKeys.js`
- `functions/scripts/inferPublicationYears.js`
- `functions/scripts/lockCanonicalCorpus.js`
- `functions/scripts/buildCanonicalTraditionMappings.ts`
- `functions/scripts/applyBookFormAuthority.ts`
- `functions/scripts/exportBooksForEditorial.ts`
- `functions/scripts/seedIntelligencePersonas.cjs`

Critical global backfill:

- `functions/src/admin/backfillStats.ts` reads `posts`, `users`, `shelves`, `books`, `venues`, and `events` without top-level pagination and then performs per-document count/read work.

Critical destructive admin paths:

- `functions/src/admin/literaryAuthority.ts` includes full `books` reads for delete-all and unbounded dependent collection reads for cascade planning.

High scheduled risks:

- `functions/src/admin/reconcileReviewAggregates.ts` is bounded to 25 books per run, but can read up to 10,001 reviews and 10,001 ratings per book.
- `functions/src/intelligence/aggregationWorker.ts` can read up to 5,000 queue docs and 5,000 suggestion docs per window.

Medium risks:

- Phase 8A `recover*.ts` functions are generally bounded by `HARD_MAX_BATCH_SIZE` or `MAX_RECOVERY_BATCH_SIZE`. They remain acceptable for beta if invoked with explicit `maxDocs` and monitored read budgets.

Low risks:

- `functions/src/analytics/dailyExport.ts` reads fixed metric documents plus count aggregations.
- Direct document reads in callable request paths are low risk when guarded by auth and bounded input validation.

## Estimated Monthly Read Consumption

At the incident rate, approximately 13 million reads cost $8.10. A $5/month beta target supports roughly 8 million reads/month.

Operational ceilings:

- Warning: 50,000 reads/day
- High: 100,000 reads/day
- Critical: 200,000 reads/day
- Emergency: 500,000 reads/day

Any single maintenance run that can exceed 50,000 reads must be treated as a production change requiring explicit approval, dry run, and logging.

## Files Modified

This governance pass adds a safety layer, CI scanner, documentation, monitoring guidance, and a quarantine manifest. Product behavior is not intentionally changed.

## Files Created

- `functions/src/core/firestoreSafety/FirestoreSafety.ts`
- `functions/src/core/firestoreSafety/FirestoreBudget.ts`
- `functions/src/core/firestoreSafety/FirestoreLimits.ts`
- `functions/src/core/firestoreSafety/FirestoreScan.ts`
- `functions/src/core/firestoreSafety/FirestoreTypes.ts`
- `docs/engineering/FIRESTORE_AUDIT_REPORT.md`
- `docs/engineering/FIRESTORE_SAFETY.md`
- `docs/engineering/CODEX_RULES.md`
- `docs/engineering/FIRESTORE_MONITORING.md`
- `docs/engineering/FIRESTORE_SCRIPT_QUARANTINE.md`
- `scripts/firestoreSafetyCheck.mjs`
- `.github/workflows/firestore-safety.yml`

## Remaining Risks

Existing unsafe paths are documented and baselined so CI can block new incidents without forcing a broad product refactor in this pass. The baselined paths must not be executed against production until migrated to `FirestoreSafety`.

## Migration Notes

All collection-scale work must migrate to `readFirestoreCollectionPage()` or a domain wrapper that enforces the same fields:

- `operationName`
- `riskClass`
- `environment`
- `maxReads`
- `pageSize`
- `mode`
- `requestedBy`
- `reason`

Critical scans are prohibited in production code. If a maintenance task is genuinely required, it must be split into bounded, checkpointed, idempotent pages.

## Recommended Next Steps

1. Disable production credentials for all quarantined scripts.
2. Replace `backfillDerivedStats` with bounded Phase 8A recovery functions.
3. Migrate canonical repair scripts into one approved runner that uses `FirestoreSafety`.
4. Add budget alerts and Firestore read alerts using the thresholds in `FIRESTORE_MONITORING.md`.
5. Remove entries from the CI baseline only after each path is migrated.

