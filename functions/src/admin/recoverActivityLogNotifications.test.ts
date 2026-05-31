import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("activity log notifications certification wiring", () => {
  it("registers activity_log_notifications as production-ready and certified", () => {
    const definition = getProjectionDefinition("activity_log_notifications");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["activity_log"]);
    expect(definition?.projectionCollections).toEqual(["notifications"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("rebuilds notifications from activity_log only", () => {
    const source = readFunctionsFile("src/admin/recoverActivityLogNotifications.ts");

    expect(source).toContain('db.collection("activity_log")');
    expect(source).toContain('db.collection("notifications")');
    expect(source).toContain("buildExpected(candidate)");
    expect(source).not.toContain('collection("posts").doc');
    expect(source).not.toContain('collection("users").doc(uid).collection("likes")');
  });

  it("defaults to dry-run, requires repair for writes, and avoids increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverActivityLogNotifications.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).toContain("await writeExpectedNotification(expected)");
    expect(source).not.toContain("FieldValue.increment");
  });

  it("uses Phase 8A recovery, checkpoint, verification, failure ledger, and health integrations", () => {
    const source = readFunctionsFile("src/admin/recoverActivityLogNotifications.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
  });

  it("documents authority, dry-run, write, verification, and checkpointed recovery", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/ActivityLogNotificationsRecoveryRunbook.md");

    expect(runbook).toContain("activity_log");
    expect(runbook).toContain("notifications");
    expect(runbook).toContain('"mode": "dry_run"');
    expect(runbook).toContain('"reconciliationMode": "repair"');
    expect(runbook).toContain('"scope": "checkpointed_full"');
    expect(runbook).toContain("duplicate notification");
  });
});
