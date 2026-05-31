import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("analytics projection certification wiring", () => {
  it("registers post_analytics as production-ready and certified", () => {
    const definition = getProjectionDefinition("post_analytics");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["activity_log", "post_analytics/{postId}/viewers"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("registers analytics_daily_exports as production-ready and certified", () => {
    const definition = getProjectionDefinition("analytics_daily_exports");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["system_metrics", "system_metrics_daily", "system_events"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("recomputes post analytics from activity_log and viewers without increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverAnalyticsProjections.ts");

    expect(source).toContain('.collection("activity_log")');
    expect(source).toContain('.where("object.entity_id", "==", postId)');
    expect(source).toContain('.where("verb", "==", verb)');
    expect(source).toContain('analyticsRef.collection("viewers").count().get()');
    expect(source).toContain("await writePostAnalytics(candidate.postId, expected)");
    expect(source).not.toContain("FieldValue.increment");
  });

  it("supports date-targeted analytics export rerun from locked authorities", () => {
    const source = readFunctionsFile("src/admin/recoverAnalyticsProjections.ts");

    expect(source).toContain('scope: AnalyticsExportScope');
    expect(source).toContain('db.collection("system_metrics").doc("global").get()');
    expect(source).toContain('db.collection("system_metrics_daily").doc(dateKey).get()');
    expect(source).toContain('db.collection("system_events").count().get()');
    expect(source).toContain("await writeDailyExport(expected)");
  });

  it("uses Phase 8A run, checkpoint, verification, failure ledger, and health integrations", () => {
    const source = readFunctionsFile("src/admin/recoverAnalyticsProjections.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
  });

  it("documents dry-run, write repair, checkpointed recovery, and date rerun", () => {
    const postRunbook = readFunctionsFile("../docs/operations/projections/PostAnalyticsRecoveryRunbook.md");
    const exportRunbook = readFunctionsFile("../docs/operations/projections/AnalyticsDailyExportsRecoveryRunbook.md");

    expect(postRunbook).toContain('"mode": "dry_run"');
    expect(postRunbook).toContain('"reconciliationMode": "repair"');
    expect(postRunbook).toContain('"scope": "checkpointed_full"');
    expect(exportRunbook).toContain("Date Rerun Procedure");
    expect(exportRunbook).toContain('"scope": "single_day"');
    expect(exportRunbook).toContain('"reconciliationMode": "repair"');
  });
});
