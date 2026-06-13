import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  type EntityAffinity,
  type EntitySummary,
} from "../../../contracts/entityPlatform";
import {
  AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS,
  authorRecommendationInputSnapshotFingerprint,
  buildAuthorRecommendationInputSnapshot,
} from "../../../lib/authorRecommendations/buildAuthorRecommendationInputSnapshot";
import {
  authorSummary,
  directAffinity,
  generatedAt,
  rolledAffinity,
} from "./testHelpers";

function withLifecycle(
  affinity: EntityAffinity,
  lifecycleState: "withdrawn" | "deleted" | "anonymized"
): EntityAffinity {
  return {
    ...affinity,
    lifecycleState,
  } as EntityAffinity;
}

function providerOnlySummary(authorId: string): EntitySummary {
  return {
    ...authorSummary(authorId, "Provider Only Author"),
    ref: createAuthorEntityRef(authorId, {
      authorityState: "candidate",
      authoritySource: "provider",
    }),
    authorityState: "candidate",
  };
}

describe("buildAuthorRecommendationInputSnapshot", () => {
  it("includes active direct Author affinity with canonical Author summary", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [authorSummary("author_1", "Author One")],
    });

    expect(snapshot.authorAffinities).toHaveLength(1);
    expect(snapshot.authorAffinities[0].entityRef.entityId).toBe("author_1");
    expect(snapshot.authorSummaries).toHaveLength(1);
    expect(snapshot.authorSummaries[0].title).toBe("Author One");
  });

  it("includes active rolled Author affinity with canonical Author summary", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      rolledAuthorAffinities: [rolledAffinity("author_1")],
      authorSummaries: [authorSummary("author_1")],
    });

    expect(snapshot.authorAffinities).toHaveLength(1);
    expect(snapshot.authorAffinities[0].provenance.sourceSystem).toBe(
      "work_to_author_rollup"
    );
  });

  it("suppresses affinities when the canonical Author summary is missing", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [],
    });

    expect(snapshot.authorAffinities).toEqual([]);
    expect(snapshot.authorSummaries).toEqual([]);
  });

  it("suppresses provider-only authors", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [providerOnlySummary("author_1")],
    });

    expect(snapshot.authorAffinities).toEqual([]);
    expect(snapshot.authorSummaries).toEqual([]);
  });

  it("suppresses withdrawn, deleted, and anonymized affinity", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [
        withLifecycle(directAffinity("author_1"), "withdrawn"),
        withLifecycle(directAffinity("author_2"), "deleted"),
        withLifecycle(directAffinity("author_3"), "anonymized"),
      ],
      authorSummaries: [
        authorSummary("author_1"),
        authorSummary("author_2"),
        authorSummary("author_3"),
      ],
    });

    expect(snapshot.authorAffinities).toEqual([]);
    expect(snapshot.authorSummaries).toEqual([]);
  });

  it("does not accept search, review, or quote data into the snapshot", () => {
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [authorSummary("author_1")],
      searchQueries: ["tolstoy"],
      privateReviews: ["review text"],
      privateQuotes: ["quote text"],
    } as never);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("tolstoy");
    expect(serialized).not.toContain("review text");
    expect(serialized).not.toContain("quote text");
    expect(serialized).not.toContain("searchQueries");
    expect(serialized).not.toContain("privateReviews");
    expect(serialized).not.toContain("privateQuotes");
  });

  it("generates deterministic snapshots", () => {
    const sources = {
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_2"), directAffinity("author_1")],
      rolledAuthorAffinities: [rolledAffinity("author_1")],
      authorSummaries: [authorSummary("author_2"), authorSummary("author_1")],
    };

    expect(buildAuthorRecommendationInputSnapshot(sources)).toEqual(
      buildAuthorRecommendationInputSnapshot(sources)
    );
  });

  it("generates deterministic fingerprints that change when the candidate universe changes", () => {
    const first = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [authorSummary("author_1")],
    });
    const same = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1")],
      authorSummaries: [authorSummary("author_1")],
    });
    const changed = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: [directAffinity("author_1"), directAffinity("author_2")],
      authorSummaries: [authorSummary("author_1"), authorSummary("author_2")],
    });

    expect(authorRecommendationInputSnapshotFingerprint(first)).toBe(
      authorRecommendationInputSnapshotFingerprint(same)
    );
    expect(authorRecommendationInputSnapshotFingerprint(first)).not.toBe(
      authorRecommendationInputSnapshotFingerprint(changed)
    );
    expect(authorRecommendationInputSnapshotFingerprint(first)).not.toContain("evidenceId");
    expect(authorRecommendationInputSnapshotFingerprint(first)).not.toContain("outputId");
  });

  it("enforces direct, rolled, and Author bounds", () => {
    const authorIds = Array.from({ length: 120 }, (_, index) =>
      `author_${String(index).padStart(3, "0")}`
    );
    const snapshot = buildAuthorRecommendationInputSnapshot({
      uid: "user_1",
      generatedAt,
      directAuthorAffinities: authorIds.map((authorId) => directAffinity(authorId)),
      rolledAuthorAffinities: authorIds.map((authorId) => rolledAffinity(authorId)),
      authorSummaries: authorIds.map((authorId) => authorSummary(authorId)),
    });

    expect(
      snapshot.authorAffinities.filter((affinity) =>
        affinity.contributingSignalClasses.includes("interaction:following")
      )
    ).toHaveLength(AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxDirectAffinities);
    expect(
      snapshot.authorAffinities.filter((affinity) =>
        affinity.contributingSignalClasses.includes("rollup:work_to_author")
      )
    ).toHaveLength(AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxRolledAffinities);
    expect(snapshot.authorSummaries).toHaveLength(
      AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxAuthors
    );
  });
});
