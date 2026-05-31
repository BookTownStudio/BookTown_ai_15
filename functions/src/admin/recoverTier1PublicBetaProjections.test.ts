import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

const TARGETS = [
  "reader_authority_projection",
  "reader_manifests",
  "reader_epub_indexes",
  "reader_sync_idempotency",
  "reading_progress_compatibility_fields",
  "runtime_health_projection",
  "runtime_anomaly_projection",
  "book_search_fields",
  "deletion_cascade_cleanup_projection",
] as const;

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("Tier 1 public beta projection certification wiring", () => {
  it("registers all Tier 1 targets as production-ready and certified", () => {
    for (const projectionName of TARGETS) {
      const definition = getProjectionDefinition(projectionName);
      expect(definition, projectionName).toBeTruthy();
      expect(definition?.currentCertificationStatus, projectionName).toBe("production_ready");
      expect(definition?.rebuildSupported, projectionName).toBe(true);
      expect(definition?.verificationSupported, projectionName).toBe(true);
      expect(definition?.reconciliationSupported, projectionName).toBe(true);
      expect(definition?.failureLedgerSupported, projectionName).toBe(true);
      expect(definition?.dryRunSupported, projectionName).toBe(true);
      expect(definition?.checkpointSupported, projectionName).toBe(true);
      expect(definition?.structuredReportingSupported, projectionName).toBe(true);
      expect(definition?.idempotent, projectionName).toBe(true);
      expect(definition?.restartable, projectionName).toBe(true);
      expect(definition?.runbookPath, projectionName).toContain("docs/operations/projections/");
      expect(evaluateProjectionCertification(definition!).passed, projectionName).toBe(true);
    }
  });

  it("uses the Phase 8A control plane, dry-run default, checkpoints, ledger, reports, and health", () => {
    const source = readFunctionsFile("src/admin/recoverTier1PublicBetaProjections.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("documents every Tier 1 runbook with dry-run, write repair, and checkpointed scope", () => {
    const runbooks = [
      "ReaderAuthorityProjectionRecoveryRunbook.md",
      "ReaderManifestsRecoveryRunbook.md",
      "ReaderEpubIndexesRecoveryRunbook.md",
      "ReaderSyncIdempotencyRecoveryRunbook.md",
      "ReadingProgressCompatibilityRecoveryRunbook.md",
      "RuntimeHealthProjectionRecoveryRunbook.md",
      "RuntimeAnomalyProjectionRecoveryRunbook.md",
      "BookSearchFieldsRecoveryRunbook.md",
      "DeletionCascadeCleanupRecoveryRunbook.md",
    ];

    for (const runbookPath of runbooks) {
      const runbook = readFunctionsFile(`../docs/operations/projections/${runbookPath}`);
      expect(runbook, runbookPath).toContain('"mode": "dry_run"');
      expect(runbook, runbookPath).toContain('"reconciliationMode": "repair"');
      expect(runbook, runbookPath).toContain('"scope": "collection_page"');
      expect(runbook, runbookPath).toContain("Escalation Criteria");
    }
  });
});
