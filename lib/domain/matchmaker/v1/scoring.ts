import type { MatchMakerEvidence } from "../../../../contracts/entityPlatform/matchmakerOutputs";
import type { UserEntityInteraction } from "../../../../contracts/entityPlatform/userInteraction";
import {
  MATCHMAKER_V1_LIMITS,
  type MatchMakerV1Candidate,
  type MatchMakerV1ScoreComponents,
  type MatchMakerV1ScoredCandidate,
} from "./types";

const AFFINITY_CLASS_WEIGHTS = {
  explicit: 0.4,
  expressive: 0.32,
  behavioral: 0.28,
  derived_graph_near: 0.18,
  negative: 0,
} as const;

const STRENGTH_MULTIPLIERS = {
  weak: 0.35,
  moderate: 0.6,
  strong: 0.85,
  very_strong: 1,
} as const;

const INTERACTION_WEIGHTS = {
  passive: 0.08,
  active: 0.16,
  expressive: 0.2,
  durable: 0.24,
  negative: 0,
  administrative: 0,
} as const;

const GRAPH_SOURCE_WEIGHTS = {
  editorial: 0.16,
  seeded: 0.14,
  provider_derived: 0.1,
  derived_ontology: 0.1,
  derived_identity_graph: 0.08,
  migration: 0.06,
  ai_assisted: 0.04,
} as const;

export function scoreMatchMakerV1Candidate(
  candidate: MatchMakerV1Candidate,
  evidence: readonly MatchMakerEvidence[]
): MatchMakerV1ScoredCandidate {
  const affinity = clamp(
    candidate.affinities
      .filter((affinityItem) => affinityItem.affinityClass !== "negative")
      .reduce(
        (total, affinityItem) =>
          total +
          AFFINITY_CLASS_WEIGHTS[affinityItem.affinityClass] *
            STRENGTH_MULTIPLIERS[affinityItem.strengthBand] *
            clamp(affinityItem.confidence),
        0
      ),
    0,
    0.58
  );
  const interaction = clamp(
    candidate.interactions.reduce(
      (total, interactionItem) =>
        total + interactionContribution(interactionItem),
      0
    ),
    0,
    0.36
  );
  const graph = clamp(
    candidate.relationships.reduce(
      (total, relationship) =>
        total +
        GRAPH_SOURCE_WEIGHTS[relationship.relationshipSource] *
          clamp(relationship.confidence),
      0
    ),
    0,
    0.28
  );
  const availability = availabilityContribution(candidate);
  const negativePenalty = negativeSignalPenalty(candidate);
  const contradictionPenalty =
    negativePenalty > 0 && affinity + interaction + graph > 0 ? 0.08 : 0;
  const sparsePenalty =
    affinity === 0 && interaction === 0 && graph === 0 ? 0.07 : 0;
  const privacyPenalty = evidence.some((item) =>
    ["system", "admin"].includes(item.privacyTier)
  )
    ? 0.04
    : 0;

  const components: MatchMakerV1ScoreComponents = {
    affinity: round(affinity),
    interaction: round(interaction),
    graph: round(graph),
    availability: round(availability),
    negativePenalty: round(negativePenalty),
    contradictionPenalty: round(contradictionPenalty),
    sparsePenalty: round(sparsePenalty),
    privacyPenalty: round(privacyPenalty),
  };

  const baseScore = round(
    clamp(
      affinity +
        interaction +
        graph +
        availability -
        negativePenalty -
        contradictionPenalty -
        sparsePenalty -
        privacyPenalty
    )
  );

  return {
    candidate,
    evidence,
    baseScore,
    finalScore: baseScore,
    components,
    tieBreakers: {
      confidenceSort: 0,
      affinitySort: round(affinity),
      interactionSort: round(interaction),
      graphSort: round(graph),
      evidenceSort: evidence.length,
      keySort: candidate.key,
    },
  };
}

export function rankMatchMakerV1Candidates(
  candidates: readonly MatchMakerV1ScoredCandidate[]
): readonly MatchMakerV1ScoredCandidate[] {
  return [...candidates].sort((left, right) => {
    return (
      compareDesc(left.finalScore, right.finalScore) ||
      compareDesc(left.tieBreakers.confidenceSort, right.tieBreakers.confidenceSort) ||
      compareDesc(left.tieBreakers.affinitySort, right.tieBreakers.affinitySort) ||
      compareDesc(
        left.tieBreakers.interactionSort,
        right.tieBreakers.interactionSort
      ) ||
      compareDesc(left.tieBreakers.graphSort, right.tieBreakers.graphSort) ||
      compareDesc(left.tieBreakers.evidenceSort, right.tieBreakers.evidenceSort) ||
      left.tieBreakers.keySort.localeCompare(right.tieBreakers.keySort)
    );
  });
}

export function applyMatchMakerV1ConfidenceToScore(
  candidate: MatchMakerV1ScoredCandidate,
  confidenceScore: number
): MatchMakerV1ScoredCandidate {
  const boundedAdjustment = 0.85 + clamp(confidenceScore) * 0.15;
  const finalScore = round(clamp(candidate.baseScore * boundedAdjustment));
  return {
    ...candidate,
    finalScore,
    tieBreakers: {
      ...candidate.tieBreakers,
      confidenceSort: round(clamp(confidenceScore)),
    },
  };
}

function interactionContribution(interaction: UserEntityInteraction): number {
  if (interaction.lifecycleState !== "recorded" && interaction.lifecycleState !== "superseded") {
    return 0;
  }
  if (interaction.weightClass === "negative") {
    return 0;
  }
  const lifecycleMultiplier = interaction.lifecycleState === "superseded" ? 0.5 : 1;
  return INTERACTION_WEIGHTS[interaction.weightClass] * lifecycleMultiplier;
}

function availabilityContribution(candidate: MatchMakerV1Candidate): number {
  const constraintEffect = candidate.availabilityConstraints.reduce(
    (total, constraint) => {
      if (constraint.effect === "hard_block") {
        return total - 0.16;
      }
      if (constraint.effect === "soft_boost") {
        return total + 0.08;
      }
      if (constraint.effect === "soft_penalty") {
        return total - 0.08;
      }
      return total;
    },
    0
  );
  if (constraintEffect !== 0) {
    return clamp(constraintEffect, -0.16, 0.08);
  }
  const normalized = candidate.availabilityState?.toLowerCase() ?? "";
  if (normalized.includes("unavailable") || normalized.includes("blocked")) {
    return -0.16;
  }
  if (normalized.includes("available") || normalized.includes("open")) {
    return 0.08;
  }
  if (normalized.includes("preview")) {
    return 0.04;
  }
  return 0;
}

function negativeSignalPenalty(candidate: MatchMakerV1Candidate): number {
  const negativeAffinityPenalty = candidate.affinities
    .filter((affinity) => affinity.affinityClass === "negative")
    .reduce(
      (total, affinity) =>
        total + 0.28 * STRENGTH_MULTIPLIERS[affinity.strengthBand] * clamp(affinity.confidence),
      0
    );
  const negativeInteractionPenalty = candidate.interactions.filter(
    (interaction) => interaction.weightClass === "negative"
  ).length
    ? 0.16
    : 0;
  return clamp(negativeAffinityPenalty + negativeInteractionPenalty, 0, 0.42);
}

function compareDesc(left: number, right: number): number {
  return right - left;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export { MATCHMAKER_V1_LIMITS };
