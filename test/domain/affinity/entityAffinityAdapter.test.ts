import { describe, expect, it } from "vitest";
import {
  toAffinityClassFromInteraction,
  toConfidenceFromInteraction,
  toContributingSignalClasses,
  toEntityAffinitiesFromInteractions,
  toEntityAffinityFromInteraction,
  toStrengthBandFromInteraction,
} from "../../../lib/domain/affinity/entityAffinityAdapter.ts";
import {
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

describe("entityAffinityAdapter", () => {
  it("maps reading interactions to behavioral moderate medium-high affinity", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "book_1", progress: 0.6 });
    expect(toEntityAffinityFromInteraction(interaction)).toMatchObject({
      uid: "user_1",
      affinityClass: "behavioral",
      strengthBand: "moderate",
      confidence: 0.75,
      privacyTier: "private",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
    });
  });

  it("maps shelf interactions to explicit strong high affinity", () => {
    const interaction = toShelfInteraction({
      ...base,
      bookId: "book_1",
      shelfId: "shelf_1",
      visibility: "public",
    });

    expect(toEntityAffinityFromInteraction(interaction)).toMatchObject({
      affinityClass: "explicit",
      strengthBand: "strong",
      confidence: 0.9,
      privacyTier: "public",
    });
  });

  it("maps review interactions to expressive strong high affinity", () => {
    const interaction = toReviewInteraction({
      ...base,
      bookId: "book_1",
      reviewId: "review_1",
    });

    expect(toEntityAffinityFromInteraction(interaction)).toMatchObject({
      affinityClass: "expressive",
      strengthBand: "strong",
      confidence: 0.9,
    });
  });

  it("maps quote interactions to expressive strong high affinity", () => {
    const interaction = toQuoteInteraction({
      ...base,
      quoteId: "quote_1",
      bookId: "book_1",
      isPublic: true,
    });

    expect(toEntityAffinityFromInteraction(interaction)).toMatchObject({
      affinityClass: "expressive",
      strengthBand: "strong",
      confidence: 0.9,
      privacyTier: "public",
    });
  });

  it("maps bookmark interactions to explicit strong high affinity", () => {
    const bookmark = { type: "quote", entityId: "quote_1" } as Pick<
      Bookmark,
      "type" | "entityId"
    >;
    const interaction = toBookmarkInteraction({ ...base, bookmark });

    expect(interaction).not.toBeNull();
    expect(toEntityAffinityFromInteraction(interaction!)).toMatchObject({
      affinityClass: "explicit",
      strengthBand: "strong",
      confidence: 0.9,
      privacyTier: "private",
      entityRef: {
        entityType: "quote",
        entityId: "quote_1",
      },
    });
  });

  it("maps search clicks to behavioral weak low affinity without raw query text", () => {
    const interaction = toSearchClickInteraction({
      ...base,
      bookId: "book_1",
      resultId: "result_1",
      clickedRank: 2,
    });
    const affinity = toEntityAffinityFromInteraction(interaction);

    expect(affinity).toMatchObject({
      affinityClass: "behavioral",
      strengthBand: "weak",
      confidence: 0.35,
      privacyTier: "private",
    });
    expect(JSON.stringify(affinity)).not.toContain("query");
  });

  it("maps social attachment interactions to expressive moderate medium affinity", () => {
    const attachment: PostAttachment = {
      type: "book",
      bookId: "book_1",
      bookTitle: "Book",
      bookAuthor: "Display Author",
      bookCover: "",
      bookRating: 0,
    };
    const interaction = toSocialAttachmentInteraction({
      ...base,
      attachment,
      postId: "post_1",
      visibility: "followers",
    });

    expect(interaction).not.toBeNull();
    expect(toEntityAffinityFromInteraction(interaction!)).toMatchObject({
      affinityClass: "expressive",
      strengthBand: "moderate",
      confidence: 0.6,
      privacyTier: "followers",
    });
  });

  it("exposes deterministic class, strength, confidence, and signal helpers", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "book_1" });

    expect(toAffinityClassFromInteraction(interaction)).toBe("behavioral");
    expect(toStrengthBandFromInteraction(interaction)).toBe("moderate");
    expect(toConfidenceFromInteraction(interaction)).toBe(0.75);
    expect(toContributingSignalClasses(interaction)).toEqual([
      "interaction:reading",
      "surface:reader",
      "weight:active",
      "source:reader",
    ]);
  });

  it("preserves provenance from originating interactions", () => {
    const interaction = toReviewInteraction({
      ...base,
      bookId: "book_1",
      reviewId: "review_1",
    });
    const affinity = toEntityAffinityFromInteraction(interaction);

    expect(affinity.provenance).toMatchObject({
      sourceClass: "system",
      sourceSystem: "review",
      sourceId: "review_1",
    });
    expect(affinity.provenance.evidence).toContain(
      `interactionId:${interaction.interactionId}`
    );
  });

  it("aggregates only same-user same-entity affinities and preserves signal classes", () => {
    const reading = toReadingInteraction({
      ...base,
      bookId: "book_1",
      occurredAt: "2026-06-10T00:00:00.000Z",
    });
    const bookmark = toBookmarkInteraction({
      ...base,
      occurredAt: "2026-06-11T00:00:00.000Z",
      bookmark: { type: "book", entityId: "book_1" } as Pick<Bookmark, "type" | "entityId">,
    });
    const other = toReadingInteraction({
      ...base,
      uid: "user_2",
      bookId: "book_1",
    });

    const affinities = toEntityAffinitiesFromInteractions([reading, bookmark!, other]);

    expect(affinities).toHaveLength(2);
    const userOneAffinity = affinities.find((affinity) => affinity.uid === "user_1");
    expect(userOneAffinity).toMatchObject({
      uid: "user_1",
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
      strengthBand: "strong",
      confidence: 0.9,
      recency: "2026-06-11T00:00:00.000Z",
    });
    expect(userOneAffinity?.contributingSignalClasses).toEqual(
      expect.arrayContaining(["interaction:reading", "interaction:bookmarking"])
    );
  });

  it("preserves the narrowest privacy tier during aggregation", () => {
    const publicShelf = toShelfInteraction({
      ...base,
      bookId: "book_1",
      shelfId: "shelf_1",
      visibility: "public",
    });
    const privateRead = toReadingInteraction({ ...base, bookId: "book_1" });

    expect(toEntityAffinitiesFromInteractions([publicShelf, privateRead])[0]).toMatchObject({
      privacyTier: "private",
    });
  });

  it("does not mutate input interactions", () => {
    const interaction = toSearchClickInteraction({
      ...base,
      bookId: "book_1",
      resultId: "result_1",
      clickedRank: 3,
    });
    const before = structuredClone(interaction);

    toEntityAffinityFromInteraction(interaction);
    toEntityAffinitiesFromInteractions([interaction]);

    expect(interaction).toEqual(before);
  });
});
