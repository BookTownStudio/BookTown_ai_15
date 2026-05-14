import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("social convergence regression", () => {
  it("reconciles post interactions through the shared convergence invalidation path", () => {
    const source = readRepoFile("lib/hooks/usePostInteractions.ts");

    expect(source).toContain("invalidatePostConvergence");
    expect(source).toContain("invalidateBookmarkConvergence");
    expect(source).toContain("buildSnapshotFromPost(post)");
    expect(source).toContain("queryClient.setQueryData<PostInteractionSnapshot>");
  });

  it("does not fabricate temporary comments or mutate post comment counters locally", () => {
    const source = readRepoFile("lib/hooks/useThreadComments.ts");

    expect(source).toContain("invalidateCommentConvergence");
    expect(source).not.toContain("temp_comment");
    expect(source).not.toContain("buildOptimisticComment");
    expect(source).not.toContain("incrementPostCommentCaches");
    expect(source).not.toContain("commentsCount:");
  });

  it("keeps notification unread counters server-reconciled", () => {
    const source = readRepoFile("lib/hooks/useNotifications.ts");

    expect(source).toContain("invalidateNotificationConvergence");
    expect(source).not.toContain("previousCount");
    expect(source).not.toContain("setQueryData(countKey");
    expect(source).not.toContain("'unread-count'], 0");
  });

  it("does not inject ghost bookmarks into aggregate bookmark caches", () => {
    const source = readRepoFile("lib/hooks/useBookmarkToggle.ts");

    expect(source).toContain("invalidateBookmarkConvergence");
    expect(source).not.toContain("optimisticBookmark");
    expect(source).not.toContain("temp-");
    expect(source).not.toContain("setQueryData(bookmarksKey");
  });

  it("uses the canonical attachment resolver on post render surfaces", () => {
    const postCard = readRepoFile("components/content/PostCard.tsx");
    const threadBody = readRepoFile("components/content/ThreadBody.tsx");

    expect(postCard).toContain("resolveCanonicalPostAttachments(post)");
    expect(threadBody).toContain("resolveCanonicalPostAttachments(post)");
    expect(postCard).not.toContain("buildAttachmentV1RuntimeRef");
    expect(postCard).not.toContain("resolveAttachmentFromHydratedEntity");
  });

  it("does not use legacy quote collection-group hydration fallback", () => {
    const source = readRepoFile("functions/src/social/read.ts");

    expect(source).not.toContain('collectionGroup("quotes")');
    expect(source).not.toContain("collectionGroup('quotes')");
    expect(source).toContain("quoteHydrated.get(primary.id) ?? null");
  });
});
