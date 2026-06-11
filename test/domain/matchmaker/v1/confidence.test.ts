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
  calculateMatchMakerV1Confidence,
  filterMatchMakerV1Candidates,
  generateMatchMakerV1Candidates,
  scoreMatchMakerV1Candidate,
  toMatchMakerV1ConfidenceBand,
} from "../../../../lib/domain/matchmaker/v1";

const provenance = {
  sourceClass: "system" as const,
  sourceSystem: "matchmaker_v1_test",
};

function input(value: Partial<MatchMakerInput>): MatchMakerInput {
  return { contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION, ...value };
}

function summary(id: string): EntitySummary {
  const ref = createWorkEntityRef(id);
  return {
    ref,
    title: `Work ${id}`,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    availability: { state: "available" },
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

function scoredFor(inputValue: MatchMakerInput) {
  const candidate = filterMatchMakerV1Candidates(
    generateMatchMakerV1Candidates(inputValue),
    inputValue
  )[0];
  if (!candidate) {
    throw new Error("Expected candidate");
  }
  const evidence = assembleMatchMakerV1Evidence(candidate);
  return {
    scored: scoreMatchMakerV1Candidate(candidate, evidence),
    evidence,
  };
}

describe("calculateMatchMakerV1Confidence", () => {
  it("maps confidence bands deterministically", () => {
    expect(toMatchMakerV1ConfidenceBand(0.2)).toBe("low");
    expect(toMatchMakerV1ConfidenceBand(0.5)).toBe("medium");
    expect(toMatchMakerV1ConfidenceBand(0.8)).toBe("high");
  });

  it("raises confidence with diverse privacy-safe evidence", () => {
    const { scored, evidence } = scoredFor(
      input({
        entitySummaries: [summary("work_1")],
        graphRelationshipSummaries: [relationship("rel_1", "work_1", "work_2")],
        userAffinitySummaries: [
          {
            uid: "user_1",
            entityRef: createWorkEntityRef("work_1"),
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

    const confidence = calculateMatchMakerV1Confidence(scored, evidence);

    expect(confidence.score).toBeGreaterThanOrEqual(0.45);
    expect(confidence.evidenceCoverage).toContain("source class");
  });

  it("caps confidence when contradictory negative evidence is present", () => {
    const { scored, evidence } = scoredFor(
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

    const confidence = calculateMatchMakerV1Confidence(scored, evidence);

    expect(confidence.score).toBeLessThanOrEqual(0.66);
    expect(confidence.rationale).toContain("contradictory signals");
  });

  it("does not depend on baseScore, finalScore, or rank", () => {
    const { scored, evidence } = scoredFor(
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
        ],
      })
    );

    const lowScoreCandidate = {
      ...scored,
      baseScore: 0.1,
      finalScore: 0.1,
    };
    const highScoreCandidate = {
      ...scored,
      baseScore: 0.9,
      finalScore: 0.9,
    };

    expect(calculateMatchMakerV1Confidence(lowScoreCandidate, evidence)).toEqual(
      calculateMatchMakerV1Confidence(highScoreCandidate, evidence)
    );
  });
});
