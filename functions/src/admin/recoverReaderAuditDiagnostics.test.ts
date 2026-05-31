import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("reader audit diagnostics certification wiring", () => {
  it("registers reader_audit_diagnostics as production-ready and certified", () => {
    const definition = getProjectionDefinition("reader_audit_diagnostics");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual([
      "reader runtime events",
      "reader diagnostic records",
      "reader operational logs",
    ]);
    expect(definition?.projectionCollections).toEqual(["reader_audit"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("rebuilds reader audit diagnostics from persisted reader events only", () => {
    const source = readFunctionsFile("src/admin/recoverReaderAuditDiagnostics.ts");

    expect(source).toContain('.collection("reader_events")');
    expect(source).toContain('.collection("reader_audit")');
    expect(source).toContain("buildExpectedDiagnostic");
    expect(source).toContain("writeDiagnosticProjection");
    expect(source).toContain("sourceEventId");
  });

  it("defaults to dry-run, requires repair for writes, and avoids increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverReaderAuditDiagnostics.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("uses Phase 8A recovery, checkpoint, verification, failure ledger, and health integrations", () => {
    const source = readFunctionsFile("src/admin/recoverReaderAuditDiagnostics.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
  });

  it("documents authority, dry-run, write repair, verification, and checkpointed recovery", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/ReaderAuditDiagnosticsRecoveryRunbook.md");

    expect(runbook).toContain("reader_events");
    expect(runbook).toContain("reader_audit/{readerEventId}");
    expect(runbook).toContain('"mode": "dry_run"');
    expect(runbook).toContain('"reconciliationMode": "repair"');
    expect(runbook).toContain('"scope": "checkpointed_full"');
  });
});
