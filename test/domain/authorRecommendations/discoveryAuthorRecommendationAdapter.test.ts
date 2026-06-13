import { describe, expect, it } from "vitest";
import {
  runAuthorRecommendationEngine,
  type AuthorRecommendation,
} from "../../../lib/domain/authorRecommendations";
import {
  buildDiscoveryAuthorRecommendationTelemetry,
  toDiscoveryAuthorRecommendationCardDTO,
  toDiscoveryAuthorRecommendationCardDTOs,
} from "../../../lib/authorRecommendations/discoveryAuthorRecommendationAdapter";
import {
  authorSummary,
  directAffinity,
  generatedAt,
  input,
  rolledAffinity,
} from "./testHelpers";

function recommendations() {
  return runAuthorRecommendationEngine(
    input({
      generatedAt,
      maxResults: 10,
      authorSummaries: [
        authorSummary("author_1", "Author One"),
        authorSummary("author_2", "Author Two"),
      ],
      authorAffinities: [
        directAffinity("author_1"),
        rolledAffinity("author_1"),
        directAffinity("author_2"),
      ],
    })
  ).recommendations;
}

describe("Discovery Author Recommendation adapter", () => {
  it("maps recommendations to privacy-safe Discovery card DTOs", () => {
    const [recommendation] = recommendations();
    const dto = toDiscoveryAuthorRecommendationCardDTO(recommendation);

    expect(dto).toEqual({
      authorId: "author_1",
      displayName: "Author One",
      explanationSummary:
        "Recommended with high confidence because direct author activity and repeated work-level activity both support this author.",
      confidenceBand: "high",
      sourceClassLabels: [
        "Canonical author summary",
        "Direct author activity",
        "Repeated work-level activity",
      ],
    });

    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("outputId");
    expect(serialized).not.toContain("evidenceId");
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("privacyTier");
    expect(serialized).not.toContain("score");
    expect(serialized).not.toContain("sourceId");
  });

  it("suppresses non-canonical or non-author outputs", () => {
    const [recommendation] = recommendations();
    const invalid = {
      ...recommendation,
      targetAuthorRef: {
        ...recommendation.targetAuthorRef,
        entityType: "work",
      },
    } as unknown as AuthorRecommendation;

    expect(toDiscoveryAuthorRecommendationCardDTO(invalid)).toBeNull();
  });

  it("bounds renderable DTO output to six cards", () => {
    const source = recommendations();
    const dtos = toDiscoveryAuthorRecommendationCardDTOs(
      Array.from({ length: 8 }, (_, index) => ({
        ...source[index % source.length],
        targetAuthorRef: {
          ...source[index % source.length].targetAuthorRef,
          entityId: `author_${index}`,
        },
        targetSummary: {
          ...source[index % source.length].targetSummary,
          title: `Author ${index}`,
        },
      }))
    );

    expect(dtos).toHaveLength(6);
  });

  it("builds aggregate-only telemetry", () => {
    const dtos = toDiscoveryAuthorRecommendationCardDTOs(recommendations());
    const telemetry = buildDiscoveryAuthorRecommendationTelemetry({
      recommendations: dtos,
      durationMs: 120,
    });

    expect(telemetry.moduleRendered).toBe(true);
    expect(telemetry.outputCount).toBe(2);
    expect(telemetry.confidenceBandHistogram.high).toBe(1);
    expect(telemetry.confidenceBandHistogram.medium).toBe(1);
    expect(telemetry.sourceClassHistogram["Direct author activity"]).toBe(2);
    expect(telemetry.latencyBucket).toBe("100_250ms");

    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("author_1");
    expect(serialized).not.toContain("outputId");
    expect(serialized).not.toContain("evidenceId");
    expect(serialized).not.toContain("provenance");
  });
});
