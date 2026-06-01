import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

const TARGETS = [
  "system_metrics",
  "system_events",
  "intelligence_signal_queue",
  "intelligence_aggregates",
] as const;

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("operational and intelligence projection certification", () => {
  it("certifies all remaining operational and intelligence projections as production-ready", () => {
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
      expect(definition?.recoveryGaps, projectionName).toEqual([]);
      expect(evaluateProjectionCertification(definition!).passed, projectionName).toBe(true);
    }
  });

  it("routes operational and intelligence targets through the existing bounded recovery callable", () => {
    const source = readFunctionsFile("src/admin/recoverTier1PublicBetaProjections.ts");

    for (const projectionName of TARGETS) {
      expect(source).toContain(projectionName);
    }
    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("documents dry-run, repair, verification, health, ledger, and event replay procedures", () => {
    const runbooks = [
      "SystemMetricsRecoveryRunbook.md",
      "SystemEventsRecoveryRunbook.md",
      "IntelligenceSignalQueueRecoveryRunbook.md",
      "IntelligenceAggregatesRecoveryRunbook.md",
    ];

    for (const runbookPath of runbooks) {
      const runbook = readFunctionsFile(`../docs/operations/projections/${runbookPath}`);
      expect(runbook, runbookPath).toContain('"mode": "dry_run"');
      expect(runbook, runbookPath).toContain('"reconciliationMode": "repair"');
      expect(runbook, runbookPath).toContain('"scope": "checkpointed_full"');
      expect(runbook, runbookPath).toContain("Verification Query");
      expect(runbook, runbookPath).toContain("Failure Modes");
      expect(runbook, runbookPath).toContain("Escalation Criteria");
      expect(runbook, runbookPath).toContain("Event Replay Procedures");
    }
  });
});
