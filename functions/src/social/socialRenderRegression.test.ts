import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("social render regression", () => {
  it("renders the Social feed through bounded virtualization", () => {
    const socialTab = readRepoFile("app/tabs/social.tsx");
    const virtualizedFeed = readRepoFile("components/content/VirtualizedPostFeed.tsx");

    expect(socialTab).toContain("VirtualizedPostFeed");
    expect(socialTab).not.toContain("lastPostObserver");
    expect(virtualizedFeed).toContain("data-virtualized-feed");
    expect(virtualizedFeed).toContain("data-mounted-count");
    expect(virtualizedFeed).toContain("ResizeObserver");
    expect(virtualizedFeed).toContain("OVERSCAN_PX");
  });

  it("keeps PostCard split into memoized render boundaries", () => {
    const postCard = readRepoFile("components/content/PostCard.tsx");

    [
      "PostListHeader.displayName",
      "PostAttachmentStack.displayName",
      "PostListBody.displayName",
      "PostInteractionBoundary.displayName",
      "QuoteAttachmentButton.displayName",
    ].forEach((boundary) => {
      expect(postCard).toContain(boundary);
    });

    expect(postCard).toContain("export default React.memo(PostCard, arePostCardPropsEqual)");
    expect(postCard).not.toContain("buildAttachmentV1RuntimeRef");
    expect(postCard).not.toContain("resolveAttachmentFromHydratedEntity");
  });

  it("isolates attachment renderer rerenders behind memo boundaries", () => {
    const attachmentRenderer = readRepoFile("components/content/AttachmentRendererV1.tsx");

    expect(attachmentRenderer).toContain("const MemoizedAttachmentRendererV1 = React.memo(AttachmentRendererV1)");
    expect(attachmentRenderer).toContain("export const AttachmentListV1 = React.memo(AttachmentListV1Component)");
    expect(attachmentRenderer).toContain("autoLoad={i < maxAutoLoad}");
  });

  it("keeps interaction rendering isolated from attachment rendering", () => {
    const postCard = readRepoFile("components/content/PostCard.tsx");
    const interactionRail = readRepoFile("components/content/InteractionRail.tsx");
    const interactionsHook = readRepoFile("lib/hooks/usePostInteractions.ts");
    const interactionBoundaryIndex = postCard.indexOf("const PostInteractionBoundary = React.memo");
    const attachmentBoundaryIndex = postCard.indexOf("const PostAttachmentStack = React.memo");

    expect(interactionBoundaryIndex).toBeGreaterThanOrEqual(0);
    expect(attachmentBoundaryIndex).toBeGreaterThanOrEqual(0);
    expect(interactionBoundaryIndex).not.toEqual(attachmentBoundaryIndex);
    expect(interactionRail).toContain("const ActionButton = React.memo");
    expect(interactionRail).toContain("export default React.memo(InteractionRail)");
    expect(interactionsHook).toContain("const actions = useMemo");
  });
});
