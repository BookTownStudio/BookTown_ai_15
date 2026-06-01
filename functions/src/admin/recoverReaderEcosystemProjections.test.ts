import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("reader ecosystem projection certification", () => {
  it("certifies active reader ecosystem projections as production-ready", () => {
    for (const projectionName of ["reader_events", "reader_highlights_bookmarks", "reader_insights_dto"]) {
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

  it("deprecates compatibility readability fields behind reader authority", () => {
    const definition = getProjectionDefinition("compatibility_readability_fields");

    expect(definition?.currentCertificationStatus).toBe("deprecated");
    expect(definition?.requiredCertificationStatus).toBe("deprecated");
    expect(definition?.runbookPath).toContain("CompatibilityReadabilityFieldsDeprecationRunbook.md");
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("wires reader ecosystem projections through the existing recovery callable", () => {
    const source = readFunctionsFile("src/admin/recoverTier1PublicBetaProjections.ts");

    expect(source).toContain("reader_events");
    expect(source).toContain("reader_highlights_bookmarks");
    expect(source).toContain("reader_insights_dto");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).not.toContain("FieldValue.increment");
  });
});
