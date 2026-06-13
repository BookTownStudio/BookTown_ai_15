import { describe, expect, it } from "vitest";
import {
  assembleAuthorRecommendation,
  filterAuthorRecommendationCandidates,
  generateAuthorRecommendationCandidates,
  generateAuthorRecommendationConfidence,
  generateAuthorRecommendationExplanation,
  scoreAuthorRecommendationCandidate,
} from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  generatedAt,
  input,
  rolledAffinity,
} from "./testHelpers";

describe("assembleAuthorRecommendation", () => {
  it("assembles complete contract-shaped AuthorRecommendation output", () => {
    const [candidate] = filterAuthorRecommendationCandidates(
      generateAuthorRecommendationCandidates(
        input({
          authorSummaries: [authorSummary("author_1")],
          authorAffinities: [directAffinity("author_1"), rolledAffinity("author_1")],
        })
      )
    );
    if (!candidate) throw new Error("expected candidate");
    const confidence = generateAuthorRecommendationConfidence(candidate);
    const output = assembleAuthorRecommendation(
      scoreAuthorRecommendationCandidate(candidate),
      confidence,
      generateAuthorRecommendationExplanation(candidate, confidence),
      generatedAt
    );

    expect(output).toMatchObject({
      metadata: {
        outputType: "author_recommendation",
        generatedAt,
      },
      targetAuthorRef: {
        entityType: "author",
        entityId: "author_1",
      },
      confidence: {
        band: "high",
      },
    });
    expect(output?.evidence.length).toBeGreaterThan(0);
    expect(output?.constraints.length).toBeGreaterThan(0);
    expect(output?.explanation.summary).toContain("Recommended");
  });

  it("suppresses empty-evidence outputs", () => {
    const [candidate] = filterAuthorRecommendationCandidates(
      generateAuthorRecommendationCandidates(
        input({
          authorSummaries: [authorSummary("author_1")],
          authorAffinities: [directAffinity("author_1")],
        })
      )
    );
    if (!candidate) throw new Error("expected candidate");
    const withoutEvidence = { ...candidate, evidence: [] };
    const confidence = generateAuthorRecommendationConfidence(withoutEvidence);

    expect(
      assembleAuthorRecommendation(
        scoreAuthorRecommendationCandidate(withoutEvidence),
        confidence,
        generateAuthorRecommendationExplanation(withoutEvidence, confidence),
        generatedAt
      )
    ).toBeNull();
  });
});

