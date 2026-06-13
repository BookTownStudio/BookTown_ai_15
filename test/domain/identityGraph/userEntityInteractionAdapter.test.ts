import { describe, expect, it } from "vitest";
import {
  toAuthorFollowInteraction,
  toBookmarkInteraction,
  toQuoteInteraction,
  toReadingInteraction,
  toReviewInteraction,
  toSearchClickInteraction,
  toShelfInteraction,
  toSocialAttachmentInteraction,
} from "../../../lib/domain/identityGraph/userEntityInteractionAdapter.ts";
import type { Bookmark, PostAttachment } from "../../../types/entities.ts";

const base = {
  uid: "user_1",
  occurredAt: "2026-06-11T00:00:00.000Z",
};

describe("userEntityInteractionAdapter", () => {
  it("derives reading interactions as private active Work interactions", () => {
    expect(toReadingInteraction({ ...base, bookId: "book_1", progress: 0.5 })).toMatchObject({
      uid: "user_1",
      interactionType: "reading",
      sourceSurface: "reader",
      privacyTier: "private",
      weightClass: "active",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
      provenance: {
        sourceSystem: "reader",
        evidence: ["progress:0.5"],
      },
    });
  });

  it("derives shelf interactions using shelf visibility and durable weight", () => {
    expect(
      toShelfInteraction({
        ...base,
        bookId: "book_1",
        shelfId: "shelf_1",
        visibility: "public",
      })
    ).toMatchObject({
      interactionType: "shelving",
      sourceSurface: "shelf",
      privacyTier: "public",
      weightClass: "durable",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
    });
  });

  it("derives review interactions using review visibility and expressive weight", () => {
    expect(
      toReviewInteraction({
        ...base,
        bookId: "book_1",
        reviewId: "review_1",
        visibility: "private",
      })
    ).toMatchObject({
      interactionType: "reviewing",
      sourceSurface: "book_details",
      privacyTier: "private",
      weightClass: "expressive",
      provenance: {
        sourceSystem: "review",
        sourceId: "review_1",
      },
    });
  });

  it("derives quote interactions as expressive and preserves quote privacy", () => {
    expect(
      toQuoteInteraction({
        ...base,
        quoteId: "quote_1",
        bookId: "book_1",
        isPublic: true,
      })
    ).toMatchObject({
      interactionType: "quoting",
      privacyTier: "public",
      weightClass: "expressive",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
    });

    expect(toQuoteInteraction({ ...base, quoteId: "quote_1" })).toMatchObject({
      entityRef: {
        entityType: "quote",
        entityId: "quote_1",
      },
      privacyTier: "private",
    });
  });

  it("derives bookmark interactions as private durable supported-entity interactions", () => {
    const bookmark = { type: "quote", entityId: "quote_1" } as Pick<
      Bookmark,
      "type" | "entityId"
    >;

    expect(toBookmarkInteraction({ ...base, bookmark })).toMatchObject({
      interactionType: "bookmarking",
      sourceSurface: "profile",
      privacyTier: "private",
      weightClass: "durable",
      entityRef: {
        entityType: "quote",
        entityId: "quote_1",
      },
    });
  });

  it("returns null for unsupported bookmark literary entities", () => {
    const bookmark = { type: "venue", entityId: "venue_1" } as Pick<
      Bookmark,
      "type" | "entityId"
    >;

    expect(toBookmarkInteraction({ ...base, bookmark })).toBeNull();
  });

  it("derives search clicks as private passive interactions without raw search text", () => {
    const interaction = toSearchClickInteraction({
      ...base,
      bookId: "book_1",
      resultId: "result_1",
      clickedRank: 3,
    });

    expect(interaction).toMatchObject({
      interactionType: "searching",
      sourceSurface: "search",
      privacyTier: "private",
      weightClass: "passive",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
      provenance: {
        sourceSystem: "search_click",
        sourceId: "result_1",
        evidence: ["clickedRank:3"],
      },
    });
    expect(JSON.stringify(interaction)).not.toContain("query");
  });

  it("derives social attachment interactions from supported attachment refs", () => {
    const attachment: PostAttachment = {
      type: "book",
      bookId: "book_1",
      bookTitle: "Book",
      bookAuthor: "Display Author",
      bookCover: "",
      bookRating: 0,
    };

    expect(
      toSocialAttachmentInteraction({
        ...base,
        attachment,
        postId: "post_1",
        visibility: "followers",
      })
    ).toMatchObject({
      interactionType: "discussing",
      sourceSurface: "social_post",
      privacyTier: "followers",
      weightClass: "expressive",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
    });
  });

  it("derives author follows as private durable Author identity interactions", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(interaction).toMatchObject({
      interactionId: "author_follow:user_1:author_1:following",
      uid: "user_1",
      interactionType: "following",
      sourceSurface: "author_details",
      privacyTier: "private",
      lifecycleState: "recorded",
      weightClass: "durable",
      entityRef: {
        entityType: "author",
        entityId: "author_1",
        authorityState: "canonical",
        authoritySource: "author_authority",
      },
      provenance: {
        sourceClass: "system",
        sourceSystem: "author_follow",
        sourceId: "author_1",
      },
    });
  });

  it("derives author unfollows as withdrawn Author identity interactions", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
      lifecycleState: "withdrawn",
    });

    expect(interaction).toMatchObject({
      interactionId: "author_follow:user_1:author_1:following:withdrawn",
      interactionType: "following",
      lifecycleState: "withdrawn",
      privacyTier: "private",
      weightClass: "durable",
      entityRef: {
        entityType: "author",
        entityId: "author_1",
      },
    });
  });

  it("creates deterministic author follow interactions without affinity or recommendation fields", () => {
    const first = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
      idempotencyKey: "follow:author_1",
    });
    const second = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
      idempotencyKey: "follow:author_1",
    });
    const serialized = JSON.stringify(first);

    expect(second).toEqual(first);
    expect(first.interactionId).toBe("author_follow:user_1:author_1:following");
    expect(serialized).not.toContain("affinityClass");
    expect(serialized).not.toContain("strengthBand");
    expect(serialized).not.toContain("recommendation");
    expect(serialized).not.toContain("matchmaker");
  });

  it("preserves privacy defaults and does not mutate source DTOs", () => {
    const bookmark = { type: "book", entityId: "book_1" } as Pick<
      Bookmark,
      "type" | "entityId"
    >;
    const attachment: PostAttachment = {
      type: "quote",
      quoteId: "quote_1",
      quoteText: "Quote text",
    };
    const before = {
      bookmark: structuredClone(bookmark),
      attachment: structuredClone(attachment),
    };

    expect(toShelfInteraction({ ...base, bookId: "book_1", shelfId: "shelf_1" }).privacyTier)
      .toBe("private");
    toBookmarkInteraction({ ...base, bookmark });
    toSocialAttachmentInteraction({ ...base, attachment, postId: "post_1" });

    expect({ bookmark, attachment }).toEqual(before);
  });
});
