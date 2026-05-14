import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiContracts } from "../contracts/shared/apiContracts";

const repoRoot = path.resolve(process.cwd(), "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("social authority regression", () => {
  it("exposes the canonical social mutation callable contracts and removes the legacy quote bookmark endpoint", () => {
    expect(apiContracts.callable).toHaveProperty("toggleBookmark");
    expect(apiContracts.callable).toHaveProperty("markNotificationRead");
    expect(apiContracts.callable).toHaveProperty("markAllNotificationsRead");
    expect(apiContracts.callable).toHaveProperty("followShelf");
    expect(apiContracts.callable).toHaveProperty("blockUser");
    expect(apiContracts.callable).not.toHaveProperty("toggleQuoteBookmark");
  });

  it("keeps socialActionRepository read-only for interaction/status checks", () => {
    const source = readRepoFile("services/socialActionRepository.ts");

    [
      "async like(",
      "async unlike(",
      "async repost(",
      "async unrepost(",
      "async bookmark(",
      "async unbookmark(",
      "async addComment(",
      "async reportPost(",
      "async reportComment(",
      "async blockUser(",
    ].forEach((signature) => {
      expect(source).not.toContain(signature);
    });
  });

  it("keeps comment counter ownership in aggregation triggers only", () => {
    const comments = readRepoFile("functions/src/social/comments.ts");
    const triggers = readRepoFile("functions/src/triggers/aggregationTriggers.ts");

    expect(comments).not.toContain('db.collection("post_stats").doc(postId)');
    expect(comments).not.toContain("commentsCount: admin.firestore.FieldValue.increment(1)");
    expect(triggers).toContain("export const onPostCommentCreated");
    expect(triggers).toContain("export const onPostCommentDeleted");
  });

  it("blocks removed client-owned canonical social mutation paths in Firestore rules", () => {
    const rules = readRepoFile("firestore.rules");

    [
      "match /likes/{postId}",
      "match /reposts/{postId}",
      "match /venue_bookmarks/{venueId}",
      "match /event_bookmarks/{eventId}",
      "match /bookmarks/{bookmarkId}",
      "match /comment_likes/{commentLikeId}",
      "match /reports/{reportId}",
      "match /blocks/{blockedUid}",
      "match /notifications/{notificationId}",
    ].forEach((matcher) => {
      const start = rules.indexOf(matcher);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = rules.slice(start, start + 500);
      expect(block).toContain("allow create, update, delete: if false");
    });
  });
});
