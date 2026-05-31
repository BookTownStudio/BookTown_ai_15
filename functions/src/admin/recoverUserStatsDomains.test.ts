import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";
import { USER_STATS_DOMAIN_PROJECTIONS } from "./recoverUserStatsDomains";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("user stats domain certification wiring", () => {
  it("registers all user stats domains as production-ready certified projections", () => {
    for (const projectionName of USER_STATS_DOMAIN_PROJECTIONS) {
      const definition = getProjectionDefinition(projectionName);
      expect(definition).toBeTruthy();
      expect(definition?.currentCertificationStatus).toBe("production_ready");
      expect(definition?.projectionCollections.join(",")).toContain("user_stats");
      expect(evaluateProjectionCertification(definition!).passed).toBe(true);
    }
  });

  it("keeps user_stats as a compatibility envelope rather than an aggregate", () => {
    const definition = getProjectionDefinition("user_stats");

    expect(definition).toBeTruthy();
    expect(definition?.classification).toBe("compatibility_projection");
    expect(definition?.currentCertificationStatus).toBe("deprecated");
    expect(definition?.requiredCertificationStatus).toBe("deprecated");
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("uses Phase 8A control-plane integrations", () => {
    const source = readFunctionsFile("src/admin/recoverUserStatsDomains.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("documents domain recovery and compatibility behavior", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/UserStatsDomainRecoveryRunbook.md");

    expect(runbook).toContain("library_user_stats");
    expect(runbook).toContain("shelf_user_stats");
    expect(runbook).toContain("content_user_stats");
    expect(runbook).toContain("writing_user_stats");
    expect(runbook).toContain("profile_quality_stats");
    expect(runbook).toContain("storage_user_stats");
    expect(runbook).toContain("compatibility envelope");
    expect(runbook).toContain('"scope": "checkpointed_full"');
  });
});
