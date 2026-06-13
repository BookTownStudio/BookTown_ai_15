import { describe, expect, it } from "vitest";
import {
  filterAuthorRecommendationCandidates,
  generateAuthorRecommendationCandidates,
  rankAuthorRecommendationCandidates,
  scoreAuthorRecommendationCandidate,
} from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  rolledAffinity,
} from "./testHelpers";

function eligible() {
  const candidates = generateAuthorRecommendationCandidates(
    input({
      authorSummaries: [authorSummary("author_1")],
      authorAffinities: [directAffinity("author_1"), rolledAffinity("author_1")],
    })
  );
  const [candidate] = filterAuthorRecommendationCandidates(candidates);
  if (!candidate) throw new Error("expected candidate");
  return candidate;
}

describe("scoreAuthorRecommendationCandidate", () => {
  it("uses approved scoring inputs and caps final score", () => {
    const scored = scoreAuthorRecommendationCandidate(eligible());

    expect(scored.components.directAffinity).toBeGreaterThan(0);
    expect(scored.components.rolledAffinity).toBeGreaterThan(0);
    expect(scored.finalScore).toBeLessThanOrEqual(scored.scoreCap);
  });

  it("does not depend on confidence objects or rank", () => {
    const first = scoreAuthorRecommendationCandidate(eligible());
    const second = scoreAuthorRecommendationCandidate(eligible());

    expect(first).toEqual(second);
  });

  it("breaks equal-score ties by lexicographic Author ID", () => {
    const candidates = filterAuthorRecommendationCandidates(
      generateAuthorRecommendationCandidates(
        input({
          authorSummaries: [authorSummary("b_author"), authorSummary("a_author")],
          authorAffinities: [rolledAffinity("b_author"), rolledAffinity("a_author")],
        })
      )
    ).map(scoreAuthorRecommendationCandidate);

    expect(
      rankAuthorRecommendationCandidates(candidates).map(
        (candidate) => candidate.candidate.authorRef.entityId
      )
    ).toEqual(["a_author", "b_author"]);
  });
});

