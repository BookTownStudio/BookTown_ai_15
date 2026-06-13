import { describe, expect, it } from "vitest";
import {
  filterAuthorRecommendationCandidates,
  generateAuthorRecommendationCandidates,
  generateAuthorRecommendationConfidence,
  generateAuthorRecommendationExplanation,
} from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  negativeAffinity,
  rolledAffinity,
} from "./testHelpers";

function explained(withNegative = false) {
  const [candidate] = filterAuthorRecommendationCandidates(
    generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [
          directAffinity("author_1"),
          rolledAffinity("author_1"),
          ...(withNegative ? [negativeAffinity("author_1")] : []),
        ],
      })
    )
  );
  if (!candidate) throw new Error("expected candidate");
  const confidence = generateAuthorRecommendationConfidence(candidate);
  return generateAuthorRecommendationExplanation(candidate, confidence);
}

describe("generateAuthorRecommendationExplanation", () => {
  it("contains mandatory privacy-safe fields", () => {
    const explanation = explained();

    expect(explanation.summary).toContain("confidence");
    expect(explanation.evidenceSourceClasses).toContain("direct_author_affinity");
    expect(explanation.confidenceBand).toBe("high");
    expect(explanation.privacyBoundary).toContain("privacy-safe");
    expect(explanation.authorityBoundary).toContain("derived intelligence");
  });

  it("does not expose raw private evidence", () => {
    const serialized = JSON.stringify(explained());

    expect(serialized).not.toContain("raw reading");
    expect(serialized).not.toContain("private shelf");
    expect(serialized).not.toContain("search term");
    expect(serialized).not.toContain("review text");
  });

  it("adds contradiction note for mixed evidence", () => {
    expect(explained(true).contradictionNote).toContain("mixed");
  });
});

