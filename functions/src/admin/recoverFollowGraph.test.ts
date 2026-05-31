import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  evaluateProjectionCertification,
} from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("follow graph certification wiring", () => {
  it("registers social_user_stats and public_profile_counters as production-ready certified projections", () => {
    const social = getProjectionDefinition("social_user_stats");
    const publicCounters = getProjectionDefinition("public_profile_counters");

    expect(social).toBeTruthy();
    expect(publicCounters).toBeTruthy();
    expect(social?.currentCertificationStatus).toBe("production_ready");
    expect(publicCounters?.currentCertificationStatus).toBe("production_ready");
    expect(evaluateProjectionCertification(social!).passed).toBe(true);
    expect(evaluateProjectionCertification(publicCounters!).passed).toBe(true);
  });

  it("keeps the normal follow create path compatible while writing canonical identities", () => {
    const source = readRepoFile("src/profile/index.ts");

    expect(source).toContain("tx.set(followerRef");
    expect(source).toContain("followerUid,");
    expect(source).toContain("uid: followerUid");
    expect(source).toContain("tx.set(followingRef");
    expect(source).toContain("uid: targetUid");
    expect(source).toContain("targetUid,");
  });

  it("uses the Phase 8A control-plane assets in follow graph recovery", () => {
    const source = readRepoFile("src/admin/recoverFollowGraph.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("mode: input.mode");
    expect(source).toContain("readString(input.mode, 20) === \"write\" ? \"write\" : \"dry_run\"");
  });

  it("documents the certified runbook and canonical authority schema", () => {
    const runbook = readRepoFile("../docs/operations/projections/FollowGraphRecoveryRunbook.md");

    expect(runbook).toContain("users/{targetUid}/followers/{followerUid}");
    expect(runbook).toContain("users/{followerUid}/following/{targetUid}");
    expect(runbook).toContain("\"followerUid\": \"string\"");
    expect(runbook).toContain("\"targetUid\": \"string\"");
    expect(runbook).toContain("\"mode\": \"dry_run\"");
    expect(runbook).toContain("\"reconciliationMode\": \"repair\"");
  });
});
