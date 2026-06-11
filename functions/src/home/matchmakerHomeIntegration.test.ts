import { describe, expect, it } from "vitest";
import {
  isMatchMakerHomeDiscoveryEnabled,
  runHomeMatchMakerDiscovery,
  toHomeDynamicDiscoveryItems,
  toMatchMakerHomeInput,
  type HomeMatchMakerBookItem,
} from "./matchmakerHomeIntegration";
import {
  createAuthorEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type MatchMakerRecommendation,
} from "../contracts/shared/entityPlatform";

const generatedAt = "2026-06-11T00:00:00.000Z";

function item(id: string): HomeMatchMakerBookItem {
  return {
    kind: "book",
    bookId: id,
    title: `Work ${id}`,
    author: "Author",
    coverUrl: "",
    source: "algorithmic",
    score: 0.7,
    reason: "Existing fallback reason",
  };
}

describe("matchmakerHomeIntegration", () => {
  it("defaults the feature flag off", () => {
    expect(isMatchMakerHomeDiscoveryEnabled({})).toBe(false);
    expect(
      isMatchMakerHomeDiscoveryEnabled({ MATCHMAKER_HOME_DISCOVERY: "true" })
    ).toBe(true);
  });

  it("returns existing Home behavior when the feature flag is off", () => {
    const fallbackItems = [item("work_1")];

    const result = runHomeMatchMakerDiscovery({
      uid: "user_1",
      candidateItems: fallbackItems,
      generatedAt,
      featureFlagEnabled: false,
    });

    expect(result.usedMatchMaker).toBe(false);
    expect(result.fallbackReason).toBe("feature_flag_off");
    expect(result.items).toEqual(fallbackItems);
  });

  it("builds a bounded Work-only MatchMakerInput snapshot", () => {
    const input = toMatchMakerHomeInput(
      Array.from({ length: 20 }, (_, index) => item(`work_${index}`))
    );

    expect(input.contractVersion).toBe(ENTITY_PLATFORM_CONTRACT_VERSION);
    expect(input.entitySummaries).toHaveLength(12);
    expect(
      input.entitySummaries?.every((summary) => summary.ref.entityType === "work")
    ).toBe(true);
    expect(JSON.stringify(input)).not.toContain("Existing fallback reason");
  });

  it("uses MatchMaker output when the feature flag is on", () => {
    const result = runHomeMatchMakerDiscovery({
      uid: "user_1",
      candidateItems: [item("work_1"), item("work_2")],
      generatedAt,
      featureFlagEnabled: true,
    });

    expect(result.usedMatchMaker).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.reason).toContain("confidence");
    expect(result.telemetry.outputCount).toBe(2);
    expect(result.telemetry.confidenceBands).not.toEqual({});
    expect(result.telemetry.evidenceSourceClasses).not.toEqual({});
  });

  it("falls back when MatchMaker returns no output", () => {
    const fallbackItems = [item("work_1")];
    const result = runHomeMatchMakerDiscovery({
      uid: "user_1",
      candidateItems: fallbackItems,
      generatedAt,
      featureFlagEnabled: true,
      runEngine: () => [],
    });

    expect(result.usedMatchMaker).toBe(false);
    expect(result.fallbackReason).toBe("empty_matchmaker_output");
    expect(result.items).toEqual(fallbackItems);
  });

  it("falls back when MatchMaker throws", () => {
    const fallbackItems = [item("work_1")];
    const result = runHomeMatchMakerDiscovery({
      uid: "user_1",
      candidateItems: fallbackItems,
      generatedAt,
      featureFlagEnabled: true,
      runEngine: () => {
        throw new Error("engine failed");
      },
    });

    expect(result.usedMatchMaker).toBe(false);
    expect(result.fallbackReason).toBe("engine_failure");
    expect(result.items).toEqual(fallbackItems);
  });

  it("does not expose raw evidence, confidence scores, or output IDs in Home items", () => {
    const recommendation = {
      metadata: {
        outputId: "matchmaker_v1:secret_output_id",
        outputType: "recommendation",
        contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        generatedAt,
        provenance: { sourceClass: "system" },
        privacyTier: "private",
      },
      targetEntityRef: {
        contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        entityType: "work",
        entityId: "work_1",
        authorityState: "canonical",
        authoritySource: "work_authority",
      },
      reason: "work_affinity_alignment",
      evidence: [
        {
          evidenceId: "secret_evidence_id",
          source: "affinity",
          summary: "raw evidence should not appear",
          provenance: { sourceClass: "system" },
          privacyTier: "private",
          confidence: {
            band: "high",
            score: 0.9876,
            rationale: "internal evidence confidence",
          },
        },
      ],
      explanation: {
        primaryReasonClass: "affinity",
        reasonClasses: ["affinity"],
        summary: "Privacy-safe explanation.",
        evidenceIds: ["secret_evidence_id"],
        sourceBoundaries: ["affinity"],
        privacyBoundary: "private",
        authorityBoundary: "derived_intelligence_not_canonical_truth",
        constraintIds: [],
      },
      confidence: {
        band: "medium",
        score: 0.6789,
        rationale: "internal confidence",
      },
      constraints: [],
    } satisfies MatchMakerRecommendation;

    const homeItems = toHomeDynamicDiscoveryItems([recommendation], [item("work_1")]);
    const serialized = JSON.stringify(homeItems);

    expect(serialized).not.toContain("secret_output_id");
    expect(serialized).not.toContain("secret_evidence_id");
    expect(serialized).not.toContain("raw evidence should not appear");
    expect(serialized).not.toContain("0.6789");
    expect(homeItems[0]?.reason).toContain("Medium confidence");
  });

  it("truncates long explanations before appending the confidence band label", () => {
    const recommendation = {
      metadata: {
        outputId: "matchmaker_v1:secret_long_output_id",
        outputType: "recommendation",
        contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        generatedAt,
        provenance: { sourceClass: "system" },
        privacyTier: "private",
      },
      targetEntityRef: {
        contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        entityType: "work",
        entityId: "work_1",
        authorityState: "canonical",
        authoritySource: "work_authority",
      },
      reason: "work_affinity_alignment",
      evidence: [
        {
          evidenceId: "secret_long_evidence_id",
          source: "affinity",
          summary: "raw long evidence should not appear",
          provenance: { sourceClass: "system" },
          privacyTier: "private",
          confidence: {
            band: "medium",
            score: 0.1111,
            rationale: "internal evidence confidence",
          },
        },
      ],
      explanation: {
        primaryReasonClass: "affinity",
        reasonClasses: ["affinity"],
        summary: "A".repeat(500),
        evidenceIds: ["secret_long_evidence_id"],
        sourceBoundaries: ["affinity"],
        privacyBoundary: "private",
        authorityBoundary: "derived_intelligence_not_canonical_truth",
        constraintIds: [],
      },
      confidence: {
        band: "high",
        score: 0.9876,
        rationale: "internal confidence",
      },
      constraints: [],
    } satisfies MatchMakerRecommendation;

    const homeItems = toHomeDynamicDiscoveryItems([recommendation], [item("work_1")]);
    const reason = homeItems[0]?.reason ?? "";
    const serialized = JSON.stringify(homeItems);

    expect(reason).toHaveLength(160);
    expect(reason.endsWith(" High confidence.")).toBe(true);
    expect(serialized).not.toContain("secret_long_output_id");
    expect(serialized).not.toContain("secret_long_evidence_id");
    expect(serialized).not.toContain("raw long evidence should not appear");
    expect(serialized).not.toContain("0.9876");
  });

  it("drops non-Work recommendations defensively", () => {
    const recommendation = {
      metadata: {
        outputId: "output_1",
        outputType: "recommendation",
        contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        generatedAt,
        provenance: { sourceClass: "system" },
        privacyTier: "private",
      },
      targetEntityRef: createAuthorEntityRef("author_1"),
      reason: "work_affinity_alignment",
      evidence: [],
      explanation: {
        primaryReasonClass: "affinity",
        reasonClasses: ["affinity"],
        summary: "Explanation.",
        evidenceIds: [],
        sourceBoundaries: [],
        privacyBoundary: "private",
        authorityBoundary: "derived_intelligence_not_canonical_truth",
        constraintIds: [],
      },
      confidence: {
        band: "low",
        score: 0.1,
        rationale: "low",
      },
      constraints: [],
    } as unknown as MatchMakerRecommendation;

    expect(toHomeDynamicDiscoveryItems([recommendation], [item("work_1")])).toEqual([]);
  });
});
