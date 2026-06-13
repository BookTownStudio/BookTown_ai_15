import { describe, expect, it } from "vitest";
import { createWorkEntityRef } from "../../../contracts/entityPlatform";
import { generateAuthorRecommendationCandidates } from "../../../lib/domain/authorRecommendations";
import {
  authorSummary,
  directAffinity,
  input,
  provenance,
  rolledAffinity,
} from "./testHelpers";

describe("generateAuthorRecommendationCandidates", () => {
  it("creates deduplicated candidates from direct and rolled Author affinity", () => {
    const candidates = generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [directAffinity("author_1"), rolledAffinity("author_1")],
      })
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      key: "author:author_1",
      authorRef: { entityType: "author", entityId: "author_1" },
    });
    expect(candidates[0]?.directAffinities).toHaveLength(1);
    expect(candidates[0]?.rolledAffinities).toHaveLength(1);
    expect(candidates[0]?.evidence.map((item) => item.source)).toEqual([
      "direct_author_affinity",
      "rolled_author_affinity",
      "author_summary",
    ]);
  });

  it("ignores Work, provider, graph-only, and display-name style inputs", () => {
    const candidates = generateAuthorRecommendationCandidates(
      input({
        authorSummaries: [authorSummary("author_1")],
        authorAffinities: [
          {
            ...directAffinity("author_1"),
            entityRef: createWorkEntityRef("work_1"),
          },
          {
            ...directAffinity("author_2"),
            entityRef: {
              ...directAffinity("author_2").entityRef,
              authorityState: "candidate",
              authoritySource: "provider",
              displayHint: "Display Name",
            },
          },
          {
            ...directAffinity("author_3"),
            affinityClass: "derived_graph_near",
            contributingSignalClasses: ["graph:near"],
            provenance,
          },
        ],
      })
    );

    expect(candidates).toEqual([]);
  });
});

