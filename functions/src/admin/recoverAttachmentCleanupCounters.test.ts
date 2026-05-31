import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("attachment cleanup counters certification wiring", () => {
  it("registers attachment_cleanup_counters as production-ready and certified", () => {
    const definition = getProjectionDefinition("attachment_cleanup_counters");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["attachments", "attachment_metadata"]);
    expect(definition?.projectionCollections).toEqual([
      "user_stats.storageUsageBytes",
      "user_stats.attachmentStorageFiles",
    ]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("recomputes from attachments with aggregate count and sum", () => {
    const source = readFunctionsFile("src/admin/recoverAttachmentCleanupCounters.ts");

    expect(source).toContain('.collection("attachments")');
    expect(source).toContain('.where("uploader.uid", "==", uid)');
    expect(source).toContain("AggregateField.count()");
    expect(source).toContain('AggregateField.sum("size")');
    expect(source).toContain("await writeExactCounters(candidate.uid, expected)");
  });

  it("defaults to dry-run, requires repair for writes, and avoids increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverAttachmentCleanupCounters.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("uses Phase 8A recovery, checkpoint, verification, failure ledger, and health integrations", () => {
    const source = readFunctionsFile("src/admin/recoverAttachmentCleanupCounters.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
  });

  it("documents authority, dry-run, write repair, verification, and checkpointed recovery", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/AttachmentCleanupCountersRecoveryRunbook.md");

    expect(runbook).toContain("attachments");
    expect(runbook).toContain("user_stats.storageUsageBytes");
    expect(runbook).toContain('"mode": "dry_run"');
    expect(runbook).toContain('"reconciliationMode": "repair"');
    expect(runbook).toContain('"scope": "checkpointed_full"');
  });
});
