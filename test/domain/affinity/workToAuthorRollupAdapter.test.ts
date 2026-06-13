import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  createWorkEntityRef,
  type EntityPlatformPrivacyTier,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import {
  toAuthorAffinityFromWorkSignals,
  type WorkToAuthorRollupInput,
  type WorkToAuthorRollupSignal,
  type WorkToAuthorRollupSignalClass,
} from "../../../lib/domain/affinity/workToAuthorRollupAdapter";

const authorRef = createAuthorEntityRef("author_1");
const generatedAt = "2026-06-12T00:00:00.000Z";

function workRef(id: string): LiteraryEntityRef {
  return createWorkEntityRef(id);
}

function signal(params: {
  readonly workId: string;
  readonly signalClass?: WorkToAuthorRollupSignalClass;
  readonly authorRefs?: readonly LiteraryEntityRef[];
  readonly polarity?: "positive" | "neutral" | "negative";
  readonly lifecycleState?: WorkToAuthorRollupSignal["lifecycleState"];
  readonly privacyTier?: EntityPlatformPrivacyTier;
  readonly workAffinityClass?: WorkToAuthorRollupSignal["workAffinityClass"];
  readonly confidence?: number;
}): WorkToAuthorRollupSignal {
  const signalClass = params.signalClass ?? "shelving";
  return {
    workRef: workRef(params.workId),
    canonicalAuthorRefs: params.authorRefs ?? [authorRef],
    signalSource: signalClass === "work_affinity" ? "affinity" : "interaction",
    signalClass,
    ...(params.workAffinityClass ? { workAffinityClass: params.workAffinityClass } : {}),
    polarity: params.polarity ?? "positive",
    lifecycleState: params.lifecycleState ?? "recorded",
    privacyTier: params.privacyTier ?? "public",
    occurredAt: generatedAt,
    confidence: params.confidence ?? 0.8,
    provenance: {
      sourceClass: "system",
      sourceSystem: "test",
      sourceId: `${params.workId}:${signalClass}`,
    },
  };
}

function input(
  workSignals: readonly WorkToAuthorRollupSignal[],
  targetAuthorRef: LiteraryEntityRef = authorRef
): WorkToAuthorRollupInput {
  return {
    uid: "user_1",
    authorRef: targetAuthorRef,
    workSignals,
    generatedAt,
  };
}

describe("workToAuthorRollupAdapter", () => {
  it("returns null for fewer than 3 distinct Works", () => {
    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          signal({ workId: "work_1", signalClass: "shelving" }),
          signal({ workId: "work_1", signalClass: "bookmarking" }),
          signal({ workId: "work_2", signalClass: "reviewing" }),
        ])
      )
    ).toBeNull();
  });

  it("returns null for fewer than 3 eligible positive signals", () => {
    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          signal({ workId: "work_1", signalClass: "shelving" }),
          signal({ workId: "work_2", signalClass: "bookmarking" }),
          signal({
            workId: "work_3",
            signalClass: "reviewing",
            lifecycleState: "withdrawn",
          }),
        ])
      )
    ).toBeNull();
  });

  it("returns null when weighted score is below 2.20", () => {
    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          signal({ workId: "work_1", signalClass: "discussing" }),
          signal({ workId: "work_2", signalClass: "discussing" }),
          signal({ workId: "work_3", signalClass: "discussing" }),
        ])
      )
    ).toBeNull();
  });

  it("returns null when target author is not canonical", () => {
    const candidateAuthor = createAuthorEntityRef("author_1", {
      authorityState: "candidate",
      authoritySource: "provider",
    });

    expect(
      toAuthorAffinityFromWorkSignals(
        input(
          [
            signal({ workId: "work_1" }),
            signal({ workId: "work_2" }),
            signal({ workId: "work_3" }),
          ],
          candidateAuthor
        )
      )
    ).toBeNull();
  });

  it("returns null when Work author refs do not include target author", () => {
    const otherAuthorRef = createAuthorEntityRef("author_2");

    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          signal({ workId: "work_1", authorRefs: [otherAuthorRef] }),
          signal({ workId: "work_2", authorRefs: [otherAuthorRef] }),
          signal({ workId: "work_3", authorRefs: [otherAuthorRef] }),
        ])
      )
    ).toBeNull();
  });

  it("returns null for display-name-only evidence", () => {
    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          {
            ...signal({ workId: "work_1" }),
            canonicalAuthorRefs: [],
            workRef: createWorkEntityRef("Virginia Woolf", {
              displayHint: "Virginia Woolf",
            }),
          },
          signal({ workId: "work_2", authorRefs: [] }),
          signal({ workId: "work_3", authorRefs: [] }),
        ])
      )
    ).toBeNull();
  });

  it("creates Author affinity for 3 distinct Works and 3 eligible positive signals", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
      ])
    );

    expect(affinity).toMatchObject({
      uid: "user_1",
      entityRef: {
        entityType: "author",
        entityId: "author_1",
        authorityState: "canonical",
        authoritySource: "author_authority",
      },
      affinityClass: "explicit",
      strengthBand: "moderate",
      privacyTier: "public",
      provenance: {
        sourceClass: "derived_identity_graph",
        sourceSystem: "work_to_author_rollup",
        sourceId: "author_1",
      },
    });
    expect(affinity?.confidence).toBeLessThanOrEqual(0.7);
    expect(affinity?.contributingSignalClasses).toEqual(
      expect.arrayContaining([
        "rollup:work_to_author",
        "signal:shelving",
        "signal:bookmarking",
        "signal:reviewing",
      ])
    );
  });

  it("caps derived confidence at 0.70", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
        signal({ workId: "work_4", signalClass: "shelving" }),
        signal({ workId: "work_5", signalClass: "bookmarking" }),
      ])
    );

    expect(affinity?.confidence).toBe(0.7);
  });

  it("completion-only rollup caps confidence at 0.55", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "completed_reading" }),
        signal({ workId: "work_2", signalClass: "completed_reading" }),
        signal({ workId: "work_3", signalClass: "completed_reading" }),
        signal({ workId: "work_4", signalClass: "completed_reading" }),
      ])
    );

    expect(affinity?.confidence).toBeLessThanOrEqual(0.55);
  });

  it("quote-only rollup caps confidence at 0.50", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "quoting" }),
        signal({ workId: "work_2", signalClass: "quoting" }),
        signal({ workId: "work_3", signalClass: "quoting" }),
        signal({ workId: "work_4", signalClass: "quoting" }),
      ])
    );

    expect(affinity?.confidence).toBeLessThanOrEqual(0.5);
  });

  it("negative signals lower or suppress confidence", () => {
    const lowered = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
        signal({ workId: "work_4", signalClass: "reviewing", polarity: "negative" }),
      ])
    );
    const suppressed = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
        signal({ workId: "work_4", signalClass: "reviewing", polarity: "negative" }),
        signal({ workId: "work_5", signalClass: "reviewing", polarity: "negative" }),
        signal({ workId: "work_6", signalClass: "reviewing", polarity: "negative" }),
      ])
    );

    expect(lowered?.confidence).toBeLessThanOrEqual(0.55);
    expect(suppressed).toBeNull();
  });

  it("withdrawn, deleted, and anonymized signals are ignored as positive evidence", () => {
    expect(
      toAuthorAffinityFromWorkSignals(
        input([
          signal({ workId: "work_1", signalClass: "shelving" }),
          signal({ workId: "work_2", signalClass: "bookmarking" }),
          signal({ workId: "work_3", signalClass: "reviewing", lifecycleState: "withdrawn" }),
          signal({ workId: "work_4", signalClass: "reviewing", lifecycleState: "deleted" }),
          signal({ workId: "work_5", signalClass: "reviewing", lifecycleState: "anonymized" }),
        ])
      )
    ).toBeNull();
  });

  it("privacy tier uses strictest contributing privacy tier", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving", privacyTier: "public" }),
        signal({ workId: "work_2", signalClass: "bookmarking", privacyTier: "private" }),
        signal({ workId: "work_3", signalClass: "reviewing", privacyTier: "followers" }),
      ])
    );

    expect(affinity?.privacyTier).toBe("private");
    expect(affinity?.confidence).toBeLessThanOrEqual(0.6);
  });

  it("strength band becomes strong only under governed threshold", () => {
    const moderate = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
      ])
    );
    const strong = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
        signal({ workId: "work_4", signalClass: "shelving" }),
      ])
    );

    expect(moderate?.strengthBand).toBe("moderate");
    expect(strong?.strengthBand).toBe("strong");
  });

  it("sets behavioral or expressive affinity class from dominant signal class", () => {
    const behavioral = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "completed_reading" }),
        signal({ workId: "work_2", signalClass: "completed_reading" }),
        signal({ workId: "work_3", signalClass: "completed_reading" }),
        signal({ workId: "work_4", signalClass: "completed_reading" }),
      ])
    );
    const expressive = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "reviewing" }),
        signal({ workId: "work_2", signalClass: "quoting" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
      ])
    );

    expect(behavioral?.affinityClass).toBe("behavioral");
    expect(expressive?.affinityClass).toBe("expressive");
  });

  it("does not create MatchMaker output fields", () => {
    const affinity = toAuthorAffinityFromWorkSignals(
      input([
        signal({ workId: "work_1", signalClass: "shelving" }),
        signal({ workId: "work_2", signalClass: "bookmarking" }),
        signal({ workId: "work_3", signalClass: "reviewing" }),
      ])
    );
    const serialized = JSON.stringify(affinity);

    expect(serialized).not.toContain("targetEntityRef");
    expect(serialized).not.toContain("recommendation");
    expect(serialized).not.toContain("matchmaker");
    expect(serialized).not.toContain("explanation");
  });
});
