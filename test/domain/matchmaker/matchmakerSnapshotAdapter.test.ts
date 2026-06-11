import { describe, expect, it } from "vitest";
import {
  MATCHMAKER_SNAPSHOT_LIMITS,
  toBoundedAffinitySummaries,
  toBoundedEntityRefs,
  toBoundedEntitySummaries,
  toBoundedGraphRelationshipSummaries,
  toBoundedInteractionSummaries,
  toMatchMakerInput,
  toPrivacySafeProfileContext,
  toSearchDiscoveryContext,
} from "../../../lib/domain/matchmaker/matchmakerSnapshotAdapter.ts";
import { toEntityAffinityFromInteraction } from "../../../lib/domain/affinity/entityAffinityAdapter.ts";
import {
  toReadingInteraction,
  toSearchClickInteraction,
} from "../../../lib/domain/identityGraph/userEntityInteractionAdapter.ts";
import {
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityRelationship,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";

const base = {
  uid: "user_1",
  occurredAt: "2026-06-11T00:00:00.000Z",
};

function buildRef(id: string): LiteraryEntityRef {
  return createWorkEntityRef(id);
}

function buildSummary(id: string): EntitySummary {
  const ref = buildRef(id);
  return {
    ref,
    title: `Book ${id}`,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

function buildRelationship(id: string): EntityRelationship {
  const sourceRef = buildRef(`source_${id}`);
  const targetRef = buildRef(`target_${id}`);
  return {
    relationshipId: `relationship_${id}`,
    source: { ref: sourceRef, graphEligible: true },
    target: { ref: targetRef, graphEligible: true },
    relationshipType: "same_movement",
    direction: "undirected",
    relationshipSource: "derived_ontology",
    provenance: {
      sourceClass: "system",
      sourceSystem: "test_graph",
      sourceId: `relationship_${id}`,
    },
    confidence: 0.7,
    lifecycleState: "related",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

describe("matchmakerSnapshotAdapter", () => {
  it("creates MatchMakerInput from affinity summaries", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "book_1" });
    const affinity = toEntityAffinityFromInteraction(interaction);

    expect(toMatchMakerInput({ affinitySummaries: [affinity] })).toMatchObject({
      contractVersion: 1,
      userAffinitySummaries: [
        {
          uid: "user_1",
          entityRef: {
            entityType: "work",
            entityId: "book_1",
          },
          privacyTier: "private",
        },
      ],
    });
  });

  it("creates MatchMakerInput from interaction summaries", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "book_1" });

    expect(toMatchMakerInput({ interactionSummaries: [interaction] })).toMatchObject({
      interactionSummaries: [
        {
          interactionType: "reading",
          privacyTier: "private",
          entityRef: {
            entityType: "work",
            entityId: "book_1",
          },
        },
      ],
    });
  });

  it("bounds all snapshot arrays", () => {
    const refs = Array.from({ length: 55 }, (_, index) => buildRef(`book_${index}`));
    const summaries = refs.map((ref) => buildSummary(ref.entityId));
    const relationships = Array.from({ length: 55 }, (_, index) => buildRelationship(String(index)));
    const interactions = refs.map((ref) => toReadingInteraction({ ...base, bookId: ref.entityId }));
    const affinities = interactions.map((interaction) => toEntityAffinityFromInteraction(interaction));
    const snapshot = toMatchMakerInput({
      entityRefs: refs,
      entitySummaries: summaries,
      graphRelationshipSummaries: relationships,
      interactionSummaries: interactions,
      affinitySummaries: affinities,
    });

    expect(snapshot.entityRefs).toHaveLength(MATCHMAKER_SNAPSHOT_LIMITS.maxEntityRefs);
    expect(snapshot.entitySummaries).toHaveLength(MATCHMAKER_SNAPSHOT_LIMITS.maxEntitySummaries);
    expect(snapshot.graphRelationshipSummaries).toHaveLength(
      MATCHMAKER_SNAPSHOT_LIMITS.maxGraphRelationshipSummaries
    );
    expect(snapshot.interactionSummaries).toHaveLength(
      MATCHMAKER_SNAPSHOT_LIMITS.maxInteractionSummaries
    );
    expect(snapshot.userAffinitySummaries).toHaveLength(
      MATCHMAKER_SNAPSHOT_LIMITS.maxAffinitySummaries
    );
  });

  it("exposes bounded helper functions", () => {
    const refs = Array.from({ length: 55 }, (_, index) => buildRef(`book_${index}`));
    const summaries = refs.map((ref) => buildSummary(ref.entityId));
    const relationships = Array.from({ length: 55 }, (_, index) => buildRelationship(String(index)));
    const interactions = refs.map((ref) => toReadingInteraction({ ...base, bookId: ref.entityId }));
    const affinities = interactions.map((interaction) => toEntityAffinityFromInteraction(interaction));

    expect(toBoundedEntityRefs(refs)).toHaveLength(50);
    expect(toBoundedEntitySummaries(summaries)).toHaveLength(50);
    expect(toBoundedGraphRelationshipSummaries(relationships)).toHaveLength(50);
    expect(toBoundedInteractionSummaries(interactions)).toHaveLength(50);
    expect(toBoundedAffinitySummaries(affinities)).toHaveLength(50);
  });

  it("preserves privacy tiers without widening them", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "book_1" });
    const affinity = toEntityAffinityFromInteraction(interaction);
    const snapshot = toMatchMakerInput({
      affinitySummaries: [affinity],
      interactionSummaries: [interaction],
    });

    expect(snapshot.userAffinitySummaries?.[0]?.privacyTier).toBe("private");
    expect(snapshot.interactionSummaries?.[0]?.privacyTier).toBe("private");
  });

  it("excludes raw search text from search discovery context", () => {
    const context = toSearchDiscoveryContext({
      rawQuery: "secret search",
      query: "another raw query",
      clickedRank: 2,
      intentType: "TITLE_INTENT",
    });

    expect(context).toEqual({
      clickedRank: 2,
      intentType: "TITLE_INTENT",
    });
    expect(JSON.stringify(context)).not.toContain("secret search");
  });

  it("excludes raw reader history from profile context", () => {
    const context = toPrivacySafeProfileContext({
      completionRate: 0.75,
      rawReadingHistory: [{ bookId: "book_1", page: 9 }],
      readingHistory: ["book_1"],
      depthPreference: 0.5,
    });

    expect(context).toEqual({
      completionRate: 0.75,
      depthPreference: 0.5,
    });
    expect(JSON.stringify(context)).not.toContain("book_1");
  });

  it("keeps graph relationships as context only", () => {
    const relationship = buildRelationship("1");
    const snapshot = toMatchMakerInput({
      graphRelationshipSummaries: [relationship],
    });

    expect(snapshot.graphRelationshipSummaries).toHaveLength(1);
    expect(snapshot.userAffinitySummaries).toBeUndefined();
  });

  it("does not generate recommendations", () => {
    const snapshot = toMatchMakerInput({
      entityRefs: [buildRef("book_1")],
      profileContext: {
        recommendationIds: ["book_2"],
        safeMetric: 1,
      },
    });

    expect(snapshot).not.toHaveProperty("recommendations");
    expect(snapshot.privacySafeProfileContext).toEqual({ safeMetric: 1 });
  });

  it("does not perform cross-entity rollups or graph expansion", () => {
    const interaction = toReadingInteraction({ ...base, bookId: "work_1" });
    const affinity = toEntityAffinityFromInteraction(interaction);
    const relationship = buildRelationship("1");
    const snapshot = toMatchMakerInput({
      affinitySummaries: [affinity],
      graphRelationshipSummaries: [relationship],
    });

    expect(snapshot.userAffinitySummaries?.map((item) => item.entityRef.entityId)).toEqual([
      "work_1",
    ]);
    expect(JSON.stringify(snapshot.userAffinitySummaries)).not.toContain("target_1");
  });

  it("does not mutate source inputs", () => {
    const interaction = toSearchClickInteraction({
      ...base,
      bookId: "book_1",
      resultId: "result_1",
      clickedRank: 1,
    });
    const affinity = toEntityAffinityFromInteraction(interaction);
    const input = {
      affinitySummaries: [affinity],
      interactionSummaries: [interaction],
      searchDiscoveryContext: {
        query: "raw",
        clickedRank: 1,
      },
    };
    const before = structuredClone(input);

    toMatchMakerInput(input);

    expect(input).toEqual(before);
  });
});
