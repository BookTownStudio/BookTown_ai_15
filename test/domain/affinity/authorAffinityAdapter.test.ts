import { describe, expect, it } from "vitest";
import { createWorkEntityRef } from "../../../contracts/entityPlatform";
import { toAuthorAffinityFromFollowInteraction } from "../../../lib/domain/affinity/authorAffinityAdapter";
import {
  toAuthorFollowInteraction,
  toReadingInteraction,
} from "../../../lib/domain/identityGraph/userEntityInteractionAdapter";

const base = {
  uid: "user_1",
  occurredAt: "2026-06-11T00:00:00.000Z",
};

describe("authorAffinityAdapter", () => {
  it("creates Author affinity from a recorded canonical Author follow", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(toAuthorAffinityFromFollowInteraction(interaction)).toMatchObject({
      uid: "user_1",
      affinityClass: "explicit",
      strengthBand: "strong",
      confidence: 0.9,
      privacyTier: "private",
      recency: "2026-06-11T00:00:00.000Z",
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

  it("uses explicit Author follow signal classes and preserves interaction evidence", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });
    const affinity = toAuthorAffinityFromFollowInteraction(interaction);

    expect(affinity?.contributingSignalClasses).toEqual([
      "interaction:following",
      "surface:author_details",
      "weight:durable",
      "source:author_follow",
    ]);
    expect(affinity?.provenance.evidence).toContain(
      `interactionId:${interaction.interactionId}`
    );
  });

  it("suppresses withdrawn Author follow affinity", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
      lifecycleState: "withdrawn",
    });

    expect(toAuthorAffinityFromFollowInteraction(interaction)).toBeNull();
  });

  it("suppresses deleted and anonymized Author follow affinity", () => {
    const recorded = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(
      toAuthorAffinityFromFollowInteraction({
        ...recorded,
        lifecycleState: "deleted",
      })
    ).toBeNull();
    expect(
      toAuthorAffinityFromFollowInteraction({
        ...recorded,
        lifecycleState: "anonymized",
      })
    ).toBeNull();
  });

  it("rejects non-author entities and does not create Work-to-Author rollups", () => {
    const workInteraction = toReadingInteraction({
      ...base,
      bookId: "book_1",
    });

    expect(toAuthorAffinityFromFollowInteraction(workInteraction)).toBeNull();
  });

  it("rejects non-follow interactions on Author entities", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(
      toAuthorAffinityFromFollowInteraction({
        ...interaction,
        interactionType: "bookmarking",
      })
    ).toBeNull();
  });

  it("rejects non-canonical Author identity", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(
      toAuthorAffinityFromFollowInteraction({
        ...interaction,
        entityRef: {
          ...interaction.entityRef,
          authorityState: "candidate",
          authoritySource: "provider",
        },
      })
    ).toBeNull();
  });

  it("rejects display-name based inputs without canonical Author identity", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });

    expect(
      toAuthorAffinityFromFollowInteraction({
        ...interaction,
        entityRef: createWorkEntityRef("Virginia Woolf", {
          displayHint: "Virginia Woolf",
        }),
      })
    ).toBeNull();
  });

  it("does not create MatchMaker outputs or recommendations", () => {
    const interaction = toAuthorFollowInteraction({
      ...base,
      authorId: "author_1",
    });
    const affinity = toAuthorAffinityFromFollowInteraction(interaction);
    const serialized = JSON.stringify(affinity);

    expect(serialized).not.toContain("recommendation");
    expect(serialized).not.toContain("targetEntityRef");
    expect(serialized).not.toContain("matchmaker");
    expect(serialized).not.toContain("score");
  });
});
