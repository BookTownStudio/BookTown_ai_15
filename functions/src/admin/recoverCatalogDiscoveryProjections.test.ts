import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("catalog and discovery projection certification", () => {
  it("certifies active catalog/discovery projections as production-ready", () => {
    for (const projectionName of ["catalog_identity_projection", "authored_author_link_projection", "shelf_display_projection"]) {
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

  it("deprecates legacy user reviews because canonical reviews supersede it", () => {
    const definition = getProjectionDefinition("legacy_user_reviews_projection");

    expect(definition?.currentCertificationStatus).toBe("deprecated");
    expect(definition?.requiredCertificationStatus).toBe("deprecated");
    expect(definition?.authoritySources).toEqual(["books/{bookId}/reviews/{reviewId}"]);
    expect(definition?.runbookPath).toContain("LegacyUserReviewsProjectionDeprecationRunbook.md");
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("wires catalog/discovery projections through the existing bounded recovery callable", () => {
    const source = readFunctionsFile("src/admin/recoverTier1PublicBetaProjections.ts");

    expect(source).toContain("catalog_identity_projection");
    expect(source).toContain("authored_author_link_projection");
    expect(source).toContain("shelf_display_projection");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).not.toContain("FieldValue.increment");
  });
});
