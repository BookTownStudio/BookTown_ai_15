import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityRelationship,
  type EntitySummary,
  type MatchMakerInput,
  type UserEntityInteraction,
} from "../../../../contracts/entityPlatform";
import {
  filterMatchMakerV1Candidates,
  generateMatchMakerV1Candidates,
} from "../../../../lib/domain/matchmaker/v1";

const provenance = {
  sourceClass: "system" as const,
  sourceSystem: "matchmaker_v1_test",
};

function summary(id: string, availabilityState = "available"): EntitySummary {
  const ref = createWorkEntityRef(id);
  return {
    ref,
    title: `Work ${id}`,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    availability: { state: availabilityState },
  };
}

function input(value: Partial<MatchMakerInput>): MatchMakerInput {
  return {
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...value,
  };
}

function relationship(
  id: string,
  sourceId: string,
  targetId: string
): EntityRelationship {
  return {
    relationshipId: id,
    source: { ref: createWorkEntityRef(sourceId), graphEligible: true },
    target: { ref: createWorkEntityRef(targetId), graphEligible: true },
    relationshipType: "adjacent_work",
    direction: "undirected",
    relationshipSource: "derived_ontology",
    provenance,
    confidence: 0.8,
    lifecycleState: "related",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

function interaction(
  id: string,
  entityId: string,
  lifecycleState: UserEntityInteraction["lifecycleState"] = "recorded"
): UserEntityInteraction {
  return {
    interactionId: id,
    uid: "user_1",
    entityRef: createWorkEntityRef(entityId),
    interactionType: "reading",
    sourceSurface: "reader",
    provenance,
    privacyTier: "private",
    lifecycleState,
    weightClass: "durable",
    occurredAt: "2026-06-11T00:00:00.000Z",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

describe("generateMatchMakerV1Candidates", () => {
  it("accepts Work refs only and deduplicates by canonical identity", () => {
    const candidates = generateMatchMakerV1Candidates(
      input({
        entityRefs: [
          createWorkEntityRef("alias_1", { canonicalId: "work_1" }),
          createAuthorEntityRef("author_1"),
        ],
        entitySummaries: [summary("work_1")],
      })
    );

    expect(candidates.map((candidate) => candidate.key)).toEqual(["work:work_1"]);
    expect(candidates[0]?.sourceTypes).toEqual([
      "entity_ref",
      "entity_summary",
    ]);
  });

  it("adds only one-hop Work graph candidates connected to known Work seeds", () => {
    const candidates = generateMatchMakerV1Candidates(
      input({
        entityRefs: [createWorkEntityRef("seed")],
        graphRelationshipSummaries: [
          relationship("rel_1", "seed", "adjacent"),
          relationship("rel_2", "unseen", "not_reached"),
        ],
      })
    );

    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "work:adjacent",
      "work:seed",
    ]);
  });

  it("excludes withdrawn interactions and filters negative-only candidates", () => {
    const candidates = generateMatchMakerV1Candidates(
      input({
        interactionSummaries: [interaction("interaction_1", "withdrawn", "withdrawn")],
        userAffinitySummaries: [
          {
            uid: "user_1",
            entityRef: createWorkEntityRef("negative_only"),
            affinityClass: "negative",
            strengthBand: "strong",
            confidence: 0.9,
            contributingSignalClasses: ["dismissed"],
            provenance,
            privacyTier: "private",
            contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
          },
        ],
      })
    );

    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "work:negative_only",
    ]);
    expect(filterMatchMakerV1Candidates(candidates, input({}))).toEqual([]);
  });

  it("accepts explicitly allowed canonical Work refs without using raw discovery text", () => {
    const candidates = generateMatchMakerV1Candidates(
      input({
        searchOrDiscoveryContext: {
          rawQuery: "secret query should never be evidence",
          allowedWorkRefs: [createWorkEntityRef("structured_work")],
        },
      })
    );

    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "work:structured_work",
    ]);
  });

  it("ignores recommendation-shaped discovery context objects", () => {
    const candidates = generateMatchMakerV1Candidates(
      input({
        searchOrDiscoveryContext: {
          recommendation: {
            metadata: { outputType: "recommendation" },
            targetEntityRef: createWorkEntityRef("leaked_recommendation"),
          },
        },
      })
    );

    expect(candidates).toEqual([]);
  });
});
