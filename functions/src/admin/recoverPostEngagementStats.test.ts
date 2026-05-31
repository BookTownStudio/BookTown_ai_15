import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("post engagement stats certification wiring", () => {
  it("registers post_engagement_stats as production-ready and certified", () => {
    const definition = getProjectionDefinition("post_engagement_stats");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.projectionCollections).toEqual(["post_stats", "posts.counters"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("excludes legacy post subcollections from recovery authority", () => {
    const source = readFunctionsFile("src/admin/recoverPostEngagementStats.ts");

    expect(source).toContain('collectionGroup("likes").where("postId", "==", postId)');
    expect(source).toContain('collectionGroup("reposts").where("originalPostId", "==", postId)');
    expect(source).toContain('collectionGroup("bookmarks")');
    expect(source).toContain('.where("entityId", "==", postId)');
    expect(source).toContain('.where("type", "==", "post")');
    expect(source).not.toContain("posts/${postDoc.id}/likes");
    expect(source).not.toContain("posts/${postDoc.id}/bookmarks");
    expect(source).not.toContain("posts/${postDoc.id}/reposts");
  });

  it("defaults to dry-run and requires repair mode for writes", () => {
    const source = readFunctionsFile("src/admin/recoverPostEngagementStats.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).toContain("await writeExactCounters(candidate.postId, expected)");
    expect(source).not.toContain("FieldValue.increment");
  });

  it("documents authority, non-authority, dry-run, write, and checkpointed recovery", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/PostEngagementRecoveryRunbook.md");

    expect(runbook).toContain("users/{uid}/likes/{postId}");
    expect(runbook).toContain("users/{uid}/reposts/{postId}");
    expect(runbook).toContain('where type == "post"');
    expect(runbook).toContain("posts/{postId}/comments/{commentId}");
    expect(runbook).toContain("posts/{postId}/likes");
    expect(runbook).toContain('"mode": "dry_run"');
    expect(runbook).toContain('"reconciliationMode": "repair"');
    expect(runbook).toContain('"scope": "checkpointed_full"');
  });
});
