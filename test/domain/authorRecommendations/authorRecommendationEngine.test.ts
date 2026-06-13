import { describe, expect, it } from "vitest";
import { runAuthorRecommendationEngine } from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  rolledAffinity,
} from "./testHelpers";

describe("runAuthorRecommendationEngine", () => {
  it("returns deterministic bounded Author recommendations", () => {
    const engineInput = input({
      maxResults: 1,
      authorSummaries: [authorSummary("author_1"), authorSummary("author_2")],
      authorAffinities: [
        directAffinity("author_1"),
        rolledAffinity("author_1"),
        rolledAffinity("author_2"),
      ],
    });
    const first = runAuthorRecommendationEngine(engineInput);
    const second = runAuthorRecommendationEngine(engineInput);

    expect(first).toEqual(second);
    expect(first.recommendations).toHaveLength(1);
    expect(first.recommendations[0]).toMatchObject({
      targetAuthorRef: {
        entityType: "author",
        entityId: "author_1",
      },
      reason: "direct_and_rolled_author_affinity",
    });
  });

  it("emits no recommendation without explanation, confidence, evidence, or constraints", () => {
    const result = runAuthorRecommendationEngine(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [directAffinity("author_1")],
      })
    );
    const [recommendation] = result.recommendations;

    expect(recommendation?.evidence.length).toBeGreaterThan(0);
    expect(recommendation?.confidence.band).toEqual(expect.any(String));
    expect(recommendation?.explanation.summary).toEqual(expect.any(String));
    expect(recommendation?.constraints.length).toBeGreaterThan(0);
  });

  it("does not leak raw evidence, ids, or MatchMaker outputs in user-facing explanation", () => {
    const result = runAuthorRecommendationEngine(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [directAffinity("author_1"), rolledAffinity("author_1")],
      })
    );
    const summary = result.recommendations[0]?.explanation.summary ?? "";

    expect(summary).not.toContain("evidenceId");
    expect(summary).not.toContain("outputId");
    expect(summary).not.toContain("raw");
    expect(JSON.stringify(result)).not.toContain("MatchMakerRecommendation");
  });
});

