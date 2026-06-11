import { describe, expect, it } from "vitest";
import {
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityRelationship,
  type EntitySummary,
  type MatchMakerInput,
} from "../../../../contracts/entityPlatform";
import {
  assembleMatchMakerV1Evidence,
  filterMatchMakerV1Candidates,
  generateMatchMakerV1Candidates,
  rankMatchMakerV1Candidates,
  scoreMatchMakerV1Candidate,
} from "../../../../lib/domain/matchmaker/v1";

const provenance = {
  sourceClass: "system" as const,
  sourceSystem: "matchmaker_v1_test",
};

function input(value: Partial<MatchMakerInput>): MatchMakerInput {
  return { contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION, ...value };
}

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

function relationship(id: string, sourceId: string, targetId: string): EntityRelationship {
  return {
    relationshipId: id,
    source: { ref: createWorkEntityRef(sourceId), graphEligible: true },
    target: { ref: createWorkEntityRef(targetId), graphEligible: true },
    relationshipType: "adjacent_work",
    direction: "undirected",
    relationshipSource: "editorial",
    provenance,
    confidence: 0.9,
    lifecycleState: "related",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

function firstScored(inputValue: MatchMakerInput) {
  const candidate = filterMatchMakerV1Candidates(
    generateMatchMakerV1Candidates(inputValue),
    inputValue
  )[0];
  if (!candidate) {
    throw new Error("Expected candidate");
  }
  const evidence = assembleMatchMakerV1Evidence(candidate);
  return scoreMatchMakerV1Candidate(candidate, evidence);
}

describe("scoreMatchMakerV1Candidate", () => {
  it("scores affinity evidence above graph-only evidence", () => {
    const affinityScored = firstScored(
      input({
        userAffinitySummaries: [
          {
            uid: "user_1",
            entityRef: createWorkEntityRef("affinity_work"),
            affinityClass: "explicit",
            strengthBand: "very_strong",
            confidence: 0.95,
            contributingSignalClasses: ["saved"],
            provenance,
            privacyTier: "private",
            contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
          },
        ],
      })
    );
    const graphScored = firstScored(
      input({
        entityRefs: [createWorkEntityRef("seed")],
        graphRelationshipSummaries: [relationship("rel_1", "seed", "graph_work")],
      })
    );

    expect(affinityScored.components.affinity).toBeGreaterThan(0);
    expect(affinityScored.baseScore).toBeGreaterThan(graphScored.baseScore);
  });

  it("applies negative and contradiction penalties deterministically", () => {
    const scored = firstScored(
      input({
        entitySummaries: [summary("work_1")],
        userAffinitySummaries: [
          {
            uid: "user_1",
            entityRef: createWorkEntityRef("work_1"),
            affinityClass: "explicit",
            strengthBand: "strong",
            confidence: 0.9,
            contributingSignalClasses: ["saved"],
            provenance,
            privacyTier: "private",
            contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
          },
          {
            uid: "user_1",
            entityRef: createWorkEntityRef("work_1"),
            affinityClass: "negative",
            strengthBand: "moderate",
            confidence: 0.8,
            contributingSignalClasses: ["dismissed"],
            provenance,
            privacyTier: "private",
            contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
          },
        ],
      })
    );

    expect(scored.components.negativePenalty).toBeGreaterThan(0);
    expect(scored.components.contradictionPenalty).toBeGreaterThan(0);
  });

  it("breaks equal-score ties by stable candidate key", () => {
    const inputValue = input({
      entitySummaries: [summary("b_work"), summary("a_work")],
    });
    const scored = filterMatchMakerV1Candidates(
      generateMatchMakerV1Candidates(inputValue),
      inputValue
    ).map((candidate) =>
      scoreMatchMakerV1Candidate(candidate, assembleMatchMakerV1Evidence(candidate))
    );

    expect(rankMatchMakerV1Candidates(scored).map((item) => item.candidate.key)).toEqual([
      "work:a_work",
      "work:b_work",
    ]);
  });

  it("applies soft availability constraints to scoring", () => {
    const boosted = firstScored(
      input({
        entitySummaries: [summary("work_1", "unknown")],
        availabilityConstraints: {
          softBoostWorkIds: ["work_1"],
        },
      })
    );
    const limited = firstScored(
      input({
        entitySummaries: [summary("work_1", "unknown")],
        availabilityConstraints: {
          softPenaltyWorkIds: ["work_1"],
        },
      })
    );

    expect(boosted.components.availability).toBeGreaterThan(0);
    expect(limited.components.availability).toBeLessThan(0);
    expect(boosted.baseScore).toBeGreaterThan(limited.baseScore);
  });
});
