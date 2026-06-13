import { describe, expect, it } from "vitest";
import {
  filterAuthorRecommendationCandidates,
  generateAuthorRecommendationCandidates,
  generateAuthorRecommendationConfidence,
  scoreAuthorRecommendationCandidate,
} from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  rolledAffinity,
} from "./testHelpers";

function candidateFor(authorAffinities = [rolledAffinity("author_1")]) {
  const [candidate] = filterAuthorRecommendationCandidates(
    generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities,
      })
    )
  );
  if (!candidate) throw new Error("expected candidate");
  return candidate;
}

describe("generateAuthorRecommendationConfidence", () => {
  it("caps rolled-only confidence below high", () => {
    const confidence = generateAuthorRecommendationConfidence(candidateFor());

    expect(confidence.score).toBeLessThanOrEqual(0.6);
    expect(confidence.band).not.toBe("high");
  });

  it("allows direct plus rolled evidence to reach high confidence", () => {
    const confidence = generateAuthorRecommendationConfidence(
      candidateFor([directAffinity("author_1"), rolledAffinity("author_1")])
    );

    expect(confidence.band).toBe("high");
  });

  it("does not depend on score or rank", () => {
    const candidate = candidateFor([directAffinity("author_1"), rolledAffinity("author_1")]);
    const beforeScore = generateAuthorRecommendationConfidence(candidate);
    scoreAuthorRecommendationCandidate(candidate);
    const afterScore = generateAuthorRecommendationConfidence(candidate);

    expect(afterScore).toEqual(beforeScore);
  });
});

