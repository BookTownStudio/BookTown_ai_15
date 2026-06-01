import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

const TARGETS = [
  "attachment_metadata",
  "attachment_image_derivatives",
  "cover_derivatives",
] as const;

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("media asset projection certification", () => {
  it("certifies media asset targets as production-ready", () => {
    for (const projectionName of TARGETS) {
      const definition = getProjectionDefinition(projectionName);
      expect(definition?.currentCertificationStatus, projectionName).toBe("production_ready");
      expect(definition?.rebuildSupported, projectionName).toBe(true);
      expect(definition?.verificationSupported, projectionName).toBe(true);
      expect(definition?.reconciliationSupported, projectionName).toBe(true);
      expect(definition?.failureLedgerSupported, projectionName).toBe(true);
      expect(definition?.checkpointSupported, projectionName).toBe(true);
      expect(definition?.runbookPath, projectionName).toContain("docs/operations/projections/");
      expect(evaluateProjectionCertification(definition!).passed, projectionName).toBe(true);
    }
  });

  it("routes media asset recovery through existing bounded control plane", () => {
    const source = readFunctionsFile("src/admin/recoverTier1PublicBetaProjections.ts");

    expect(source).toContain("attachment_metadata");
    expect(source).toContain("attachment_image_derivatives");
    expect(source).toContain("cover_derivatives");
    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).not.toContain("FieldValue.increment");
  });

  it("documents media runbooks with dry-run and repair commands", () => {
    for (const runbookPath of [
      "AttachmentMetadataRecoveryRunbook.md",
      "AttachmentImageDerivativesRecoveryRunbook.md",
      "CoverDerivativesRecoveryRunbook.md",
    ]) {
      const runbook = readFunctionsFile(`../docs/operations/projections/${runbookPath}`);
      expect(runbook).toContain('"mode": "dry_run"');
      expect(runbook).toContain('"reconciliationMode": "repair"');
      expect(runbook).toContain("Escalation Criteria");
    }
  });
});
