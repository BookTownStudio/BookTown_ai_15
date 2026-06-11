import { describe, expect, it } from "vitest";
import {
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type MatchMakerInput,
} from "../../../../contracts/entityPlatform";
import {
  assembleMatchMakerV1Evidence,
  buildMatchMakerV1Explanation,
  calculateMatchMakerV1Confidence,
  filterMatchMakerV1Candidates,
  generateMatchMakerV1Candidates,
  scoreMatchMakerV1Candidate,
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
  };
}

function explanationFor(inputValue: MatchMakerInput) {
  const candidate = filterMatchMakerV1Candidates(
    generateMatchMakerV1Candidates(inputValue),
    inputValue
  )[0];
  if (!candidate) {
    throw new Error("Expected candidate");
  }
  const evidence = assembleMatchMakerV1Evidence(candidate);
  const scored = scoreMatchMakerV1Candidate(candidate, evidence);
  const confidence = calculateMatchMakerV1Confidence(scored, evidence);
  return buildMatchMakerV1Explanation(scored, evidence, confidence);
}

describe("buildMatchMakerV1Explanation", () => {
  it("uses deterministic reason classes and evidence references", () => {
    const explanation = explanationFor(
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

    expect(explanation.primaryReasonClass).toBe("affinity");
    expect(explanation.reasonClasses).toContain("affinity");
    expect(explanation.evidenceIds.length).toBeGreaterThan(0);
    expect(explanation.authorityBoundary).toBe(
      "derived_intelligence_not_canonical_truth"
    );
  });

  it("keeps raw private context out of explanations", () => {
    const explanation = explanationFor(
      input({
        entitySummaries: [summary("work_1")],
        searchOrDiscoveryContext: {
          rawQuery: "private raw search phrase",
        },
      })
    );

    const serialized = JSON.stringify(explanation);
    expect(serialized).not.toContain("private raw search phrase");
    expect(explanation.privacyBoundary).toContain("raw searches");
  });
});

