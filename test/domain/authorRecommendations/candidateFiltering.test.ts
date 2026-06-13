import { describe, expect, it } from "vitest";
import {
  filterAuthorRecommendationCandidates,
  generateAuthorRecommendationCandidates,
} from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  negativeAffinity,
  rolledAffinity,
} from "./testHelpers";

describe("filterAuthorRecommendationCandidates", () => {
  it("requires canonical Author summary and approved evidence", () => {
    const candidates = generateAuthorRecommendationCandidates(
      input({
        authorAffinities: [directAffinity("author_1")],
      })
    );

    expect(filterAuthorRecommendationCandidates(candidates)).toEqual([]);
  });

  it("suppresses negative-heavy candidates", () => {
    const candidates = generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [
          rolledAffinity("author_1"),
          negativeAffinity("author_1"),
        ],
      })
    );

    expect(filterAuthorRecommendationCandidates(candidates)).toEqual([]);
  });

  it("allows direct plus rolled candidates with fewer negative than positive signals", () => {
    const candidates = generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [
          directAffinity("author_1"),
          rolledAffinity("author_1"),
          negativeAffinity("author_1"),
        ],
      })
    );

    expect(filterAuthorRecommendationCandidates(candidates)).toHaveLength(1);
  });
});

