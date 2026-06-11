import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type MatchMakerInput,
} from "../../../../contracts/entityPlatform";
import { runMatchMakerV1 } from "../../../../lib/domain/matchmaker";

const provenance = {
  sourceClass: "system" as const,
  sourceSystem: "matchmaker_v1_test",
};

function input(value: Partial<MatchMakerInput>): MatchMakerInput {
  return { contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION, ...value };
}

function summary(id: string): EntitySummary {
  const ref = createWorkEntityRef(id);
  return {
    ref,
    title: `Work ${id}`,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    availability: { state: "available" },
  };
}

describe("runMatchMakerV1", () => {
  it("returns deterministic bounded Work recommendations", () => {
    const inputValue = input({
      entitySummaries: [summary("work_1"), summary("work_2"), summary("work_3")],
      entityRefs: [createAuthorEntityRef("author_1")],
      userAffinitySummaries: [
        {
          uid: "user_1",
          entityRef: createWorkEntityRef("work_2"),
          affinityClass: "explicit",
          strengthBand: "very_strong",
          confidence: 0.95,
          contributingSignalClasses: ["saved"],
          provenance,
          privacyTier: "private",
          contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
        },
      ],
    });
    const options = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      maxRecommendations: 2,
    };

    const first = runMatchMakerV1(inputValue, options);
    const second = runMatchMakerV1(inputValue, options);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.every((item) => item.targetEntityRef.entityType === "work")).toBe(
      true
    );
    expect(first[0]).toMatchObject({
      metadata: {
        outputType: "recommendation",
        generatedAt: options.generatedAt,
      },
      targetEntityRef: {
        entityType: "work",
        entityId: "work_2",
      },
      confidence: {
        band: expect.any(String),
      },
    });
  });

  it("returns empty output for empty snapshots and emits no V2 output types", () => {
    expect(runMatchMakerV1(input({}))).toEqual([]);

    const outputs = runMatchMakerV1(input({ entitySummaries: [summary("work_1")] }));
    expect(outputs.map((output) => output.metadata.outputType)).toEqual([
      "recommendation",
    ]);
  });

  it("does not expose raw private discovery context in output", () => {
    const outputs = runMatchMakerV1(
      input({
        entitySummaries: [summary("work_1")],
        searchOrDiscoveryContext: {
          rawQuery: "raw secret query",
        },
        privacySafeProfileContext: {
          rawReadingHistory: "raw reading history",
        },
      }),
      { generatedAt: "2026-06-11T00:00:00.000Z" }
    );

    const serialized = JSON.stringify(outputs);
    expect(serialized).not.toContain("raw secret query");
    expect(serialized).not.toContain("raw reading history");
  });

  it("does not emit empty-evidence recommendations for entityRefs-only candidates", () => {
    const outputs = runMatchMakerV1(
      input({
        entityRefs: [createWorkEntityRef("work_1")],
      }),
      { generatedAt: "2026-06-11T00:00:00.000Z" }
    );

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.evidence.length).toBeGreaterThan(0);
    expect(outputs[0]?.evidence[0]).toMatchObject({
      source: "entity",
      signalClass: "entity_ref",
    });
  });

  it("blocks matching Work candidates with hard availability constraints", () => {
    const outputs = runMatchMakerV1(
      input({
        entitySummaries: [summary("blocked_work"), summary("available_work")],
        availabilityConstraints: {
          hardBlockedWorkIds: ["blocked_work"],
        },
      }),
      { generatedAt: "2026-06-11T00:00:00.000Z" }
    );

    expect(outputs.map((output) => output.targetEntityRef.entityId)).toEqual([
      "available_work",
    ]);
  });

  it("adds soft availability constraints to output and keeps evidence non-empty", () => {
    const outputs = runMatchMakerV1(
      input({
        entitySummaries: [summary("work_1")],
        availabilityConstraints: {
          constraints: [
            {
              entityId: "work_1",
              effect: "soft_boost",
              description: "Available in the current delivery context.",
            },
          ],
        },
      }),
      { generatedAt: "2026-06-11T00:00:00.000Z" }
    );

    expect(outputs[0]?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraintClass: "availability",
          enforced: false,
        }),
      ])
    );
    expect(outputs[0]?.evidence.some((item) => item.source === "availability")).toBe(
      true
    );
  });
});
