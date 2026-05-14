import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiContracts } from "../contracts/shared/apiContracts";

const repoRoot = path.resolve(process.cwd(), "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const feedMeta = {
  assemblyMs: 12,
  fallbackEntityHydrationReads: 0,
  fallbackEntityHydrationRequests: 0,
  fetchedDocs: 20,
  fetchAttempts: 1,
  filteredPostCount: 0,
  followingAuthorReads: 0,
  hydrationMs: 0,
  legacyViewerStateFallbackReads: 0,
  legacyViewerStateFallbackRequestedCount: 0,
  maxFetchAttempts: 3,
  postDocumentsRead: 20,
  primaryEntityPostCount: 0,
  projectedEntityHydrationHits: 0,
  projectedEntityHydrationRate: 0,
  projectedViewerStateReads: 0,
  projectionAvailableCount: 20,
  projectionMissingCount: 0,
  projectionUsageRate: 1,
  queryBatches: 1,
  queryMs: 8,
  returnedPostCount: 20,
  statsReads: 20,
  statsRequestedCount: 20,
  unresolvedHydrationCount: 0,
  viewerStateProjectedHitCount: 0,
  viewerStateProjectionHitRate: 0,
  viewerStateRequestedCount: 0,
};

describe("social observability regression", () => {
  it("keeps feed diagnostics typed and bounded in the callable contract", () => {
    const responseSchema = apiContracts.callable.listSocialFeed.responseSchema;
    const parsed = responseSchema.parse({
      success: true,
      data: {
        posts: [],
        meta: feedMeta,
      },
    });

    expect(parsed.data.meta?.projectionUsageRate).toBe(1);
    expect(parsed.data.meta?.queryBatches).toBe(1);
  });

  it("records feed efficiency metrics without client-owned feed reconstruction", () => {
    const readSource = readRepoFile("functions/src/social/read.ts");
    const serviceSource = readRepoFile("services/firebaseDbService.ts");

    expect(readSource).toContain("buildFeedDiagnosticMeta");
    expect(readSource).toContain("projectionUsageRate");
    expect(readSource).toContain("viewerStateProjectionHitRate");
    expect(readSource).toContain("classifyFeedAssemblyFailure");
    expect(serviceSource).toContain("meta?: SocialFeedDiagnosticsMeta");
    expect(serviceSource).not.toContain("hydrateFeedPrimaryEntities");
  });

  it("keeps client render diagnostics dev-gated and privacy bounded", () => {
    const diagnosticsSource = readRepoFile("lib/socialPerformanceDiagnostics.ts");
    const feedSource = readRepoFile("components/content/VirtualizedPostFeed.tsx");
    const cardSource = readRepoFile("components/content/PostCard.tsx");
    const attachmentSource = readRepoFile("components/content/AttachmentRendererV1.tsx");

    expect(diagnosticsSource).toContain("booktown:socialDiagnostics");
    expect(diagnosticsSource).toContain("SAFE_STRING_KEYS");
    expect(diagnosticsSource).toContain("MAX_METRICS = 200");
    expect(diagnosticsSource).toContain("import.meta.env.DEV");
    expect(feedSource).toContain("social_feed_virtualization");
    expect(cardSource).toContain("useSocialRenderDiagnostics('PostCard'");
    expect(attachmentSource).toContain("useSocialRenderDiagnostics('AttachmentRendererV1'");
  });

  it("tracks cache convergence and interaction latency through bounded diagnostics", () => {
    const reconciliationSource = readRepoFile("lib/socialCacheReconciliation.ts");
    const interactionsSource = readRepoFile("lib/hooks/usePostInteractions.ts");
    const feedsHookSource = readRepoFile("lib/hooks/useSocialFeeds.ts");

    expect(reconciliationSource).toContain("social_cache_invalidation");
    expect(interactionsSource).toContain("social_interaction_mutation");
    expect(feedsHookSource).toContain("social_feed_fetch");
  });
});
