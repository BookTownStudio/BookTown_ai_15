import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiContracts } from "../contracts/shared/apiContracts";

const repoRoot = path.resolve(process.cwd(), "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("social feed projection regression", () => {
  it("writes server-owned render projections during canonical post publish and edit", () => {
    const createSource = readRepoFile("functions/src/createSocialPost.ts");
    const editSource = readRepoFile("functions/src/social/editPost.ts");
    const projectionSource = readRepoFile("functions/src/social/postRenderProjection.ts");

    expect(createSource).toContain("renderProjection: buildPostRenderProjection");
    expect(createSource).toContain("buildRenderProjectionEntity");
    expect(editSource).toContain("updates['renderProjection.contentText']");
    expect(editSource).toContain("updates['renderProjection.visibility']");
    expect(projectionSource).toContain("export function buildPostRenderProjection");
  });

  it("uses projected post render data before fallback entity hydration", () => {
    const readSource = readRepoFile("functions/src/social/read.ts");

    expect(readSource).toContain("readPostRenderProjection");
    expect(readSource).toContain("normalizeProjectedHydratedEntity");
    expect(readSource).toContain("fallbackHydrationInputs");
    expect(readSource).toContain("fallbackEntityHydrationReads");
    expect(readSource).not.toContain('collectionGroup("quotes")');
  });

  it("collapses viewer interaction hydration through projected viewer state", () => {
    const readSource = readRepoFile("functions/src/social/read.ts");
    const interactionsSource = readRepoFile("functions/src/social/interactions.ts");
    const bookmarksSource = readRepoFile("functions/src/social/bookmarks.ts");

    expect(readSource).toContain("collection(\"post_interaction_state\")");
    expect(readSource).toContain("missingProjectionIds");
    expect(interactionsSource).toContain("collection('post_interaction_state')");
    expect(bookmarksSource).toContain("collection(\"post_interaction_state\")");
  });

  it("keeps client feed delivery delegated to the callable without legacy reconstruction", () => {
    const serviceSource = readRepoFile("services/firebaseDbService.ts");

    expect(serviceSource).toContain(">(\"listSocialFeed\"");
    expect(serviceSource).not.toContain("hydrateFeedPrimaryEntities");
    expect(serviceSource).not.toContain("getFollowingFeedPage");
    expect(serviceSource).not.toContain("collectionGroup(db, \"quotes\")");
  });

  it("exposes feed assembly diagnostics in the callable contract", () => {
    const responseSchema = apiContracts.callable.listSocialFeed.responseSchema;
    const parsed = responseSchema.parse({
      success: true,
      data: {
        posts: [],
        meta: {
          assemblyMs: 0,
          fallbackEntityHydrationRequests: 0,
          fallbackEntityHydrationReads: 0,
          filteredPostCount: 0,
          followingAuthorReads: 0,
          hydrationMs: 0,
          legacyViewerStateFallbackReads: 0,
          legacyViewerStateFallbackRequestedCount: 0,
          maxFetchAttempts: 3,
          postDocumentsRead: 0,
          primaryEntityPostCount: 0,
          projectedEntityHydrationHits: 0,
          projectedEntityHydrationRate: 0,
          projectedViewerStateReads: 0,
          projectionAvailableCount: 0,
          projectionMissingCount: 0,
          projectionUsageRate: 0,
          queryBatches: 0,
          queryMs: 0,
          returnedPostCount: 0,
          statsRequestedCount: 0,
          statsReads: 0,
          unresolvedHydrationCount: 0,
          viewerStateProjectedHitCount: 0,
          viewerStateProjectionHitRate: 0,
          viewerStateRequestedCount: 0,
        },
      },
    });

    expect(parsed.data.meta?.fallbackEntityHydrationReads).toBe(0);
  });
});
