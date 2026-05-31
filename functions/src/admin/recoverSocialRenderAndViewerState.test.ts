import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("social render and viewer state certification wiring", () => {
  it("registers social_post_render_projection as production-ready and certified", () => {
    const definition = getProjectionDefinition("social_post_render_projection");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["posts", "books", "authors", "quotes", "shelves"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("registers projected_viewer_state as production-ready and certified", () => {
    const definition = getProjectionDefinition("projected_viewer_state");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual([
      "users/{uid}/likes",
      "users/{uid}/bookmarks",
      "users/{uid}/reposts",
    ]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("rebuilds render projection from post and attached entity authority", () => {
    const source = readFunctionsFile("src/admin/recoverSocialRenderAndViewerState.ts");

    expect(source).toContain("buildPostRenderProjection");
    expect(source).toContain("buildRenderProjectionEntity");
    expect(source).toContain('db.collection("posts")');
    expect(source).toContain('"books"');
    expect(source).toContain('"authors"');
    expect(source).toContain("SOCIAL_QUOTE_PROJECTION_COLLECTION");
    expect(source).toContain("await writeRenderProjection(candidate.postId, expected)");
  });

  it("rebuilds projected viewer state from likes, bookmarks, and reposts", () => {
    const source = readFunctionsFile("src/admin/recoverSocialRenderAndViewerState.ts");

    expect(source).toContain('.collection("likes")');
    expect(source).toContain('.collection("bookmarks")');
    expect(source).toContain('.collection("reposts")');
    expect(source).toContain('.collection("post_interaction_state")');
    expect(source).toContain("await writeViewerState(candidate.uid, candidate.postId, expected)");
  });

  it("defaults to dry-run, requires repair for writes, and avoids increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverSocialRenderAndViewerState.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("uses Phase 8A recovery, checkpoint, verification, failure ledger, and health integrations", () => {
    const source = readFunctionsFile("src/admin/recoverSocialRenderAndViewerState.ts");

    expect(source).toContain("startRecoveryRun");
    expect(source).toContain("updateRecoveryCheckpointProgress");
    expect(source).toContain("recordProjectionFailure");
    expect(source).toContain("writeVerificationResult");
    expect(source).toContain("updateProjectionHealthFromVerification");
    expect(source).toContain("updateProjectionHealthFromRecoverySummary");
  });

  it("documents authority, dry-run, write repair, and verification", () => {
    const renderRunbook = readFunctionsFile("../docs/operations/projections/SocialPostRenderProjectionRecoveryRunbook.md");
    const viewerRunbook = readFunctionsFile("../docs/operations/projections/ProjectedViewerStateRecoveryRunbook.md");

    expect(renderRunbook).toContain("posts.renderProjection");
    expect(renderRunbook).toContain('"mode": "dry_run"');
    expect(renderRunbook).toContain('"reconciliationMode": "repair"');
    expect(viewerRunbook).toContain("post_interaction_state");
    expect(viewerRunbook).toContain('"mode": "dry_run"');
    expect(viewerRunbook).toContain('"reconciliationMode": "repair"');
  });
});
