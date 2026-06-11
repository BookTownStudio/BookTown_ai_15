import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityPlatformPrivacyTier,
} from "../../../../contracts/entityPlatform/common";
import type { LiteraryEntityRef } from "../../../../contracts/entityPlatform/entityRef";
import type {
  MatchMakerConfidence,
  MatchMakerEvidence,
  MatchMakerEvidenceSource,
  MatchMakerRecommendation,
  MatchMakerRecommendationReason,
} from "../../../../contracts/entityPlatform/matchmakerOutputs";
import {
  toMatchMakerV1EntityKey,
} from "./candidateGeneration";
import type {
  MatchMakerV1ScoredCandidate,
  MatchMakerV1ResolvedOptions,
} from "./types";
import {
  MATCHMAKER_V1_CONSTRAINTS,
  MATCHMAKER_V1_ENGINE_VERSION,
  MATCHMAKER_V1_LIMITS,
  MATCHMAKER_V1_PROVENANCE,
  PRIVACY_TIER_ORDER,
} from "./types";

export function assembleMatchMakerV1Evidence(
  candidate: MatchMakerV1ScoredCandidate["candidate"]
): readonly MatchMakerEvidence[] {
  const evidence: MatchMakerEvidence[] = [];
  if (candidate.sourceTypes.includes("entity_ref")) {
    evidence.push(
      toEvidence(
        candidate.key,
        "entity",
        "ref",
        "A canonical Work reference is present in the privacy-safe input snapshot.",
        candidate.targetRef,
        undefined,
        "entity_ref",
        candidate.targetRef.provenance ?? MATCHMAKER_V1_PROVENANCE,
        "public",
        0.58
      )
    );
  }
  if (candidate.summary) {
    evidence.push(
      toEvidence(
        candidate.key,
        "entity",
        "summary",
        "A Work summary is present in the privacy-safe input snapshot.",
        candidate.targetRef,
        undefined,
        undefined,
        candidate.targetRef.provenance ?? MATCHMAKER_V1_PROVENANCE,
        "public",
        0.65
      )
    );
  }

  for (const [index, affinity] of candidate.affinities.entries()) {
    evidence.push(
      toEvidence(
        candidate.key,
        "affinity",
        `${affinity.affinityClass}:${index}`,
        affinity.affinityClass === "negative"
          ? "A negative affinity signal exists for this Work."
          : `A ${affinity.affinityClass} affinity signal supports this Work.`,
        affinity.entityRef,
        undefined,
        affinity.affinityClass,
        affinity.provenance,
        affinity.privacyTier,
        affinity.confidence
      )
    );
  }

  for (const [index, interaction] of candidate.interactions.entries()) {
    evidence.push(
      toEvidence(
        candidate.key,
        "interaction",
        `${interaction.interactionType}:${index}`,
        interaction.weightClass === "negative"
          ? "A negative interaction signal exists for this Work."
          : `A ${interaction.weightClass} interaction signal supports this Work.`,
        interaction.entityRef,
        undefined,
        interaction.weightClass,
        interaction.provenance,
        interaction.privacyTier,
        interaction.lifecycleState === "recorded" ? 0.62 : 0.42
      )
    );
  }

  for (const relationship of candidate.relationships) {
    evidence.push(
      toEvidence(
        candidate.key,
        "graph",
        relationship.relationshipId,
        "A provided graph relationship connects this Work to the bounded snapshot.",
        candidate.targetRef,
        relatedRefFor(candidate.key, relationship.source.ref, relationship.target.ref),
        relationship.relationshipType,
        relationship.provenance,
        "public",
        relationship.confidence,
        relationship.relationshipId
      )
    );
  }

  if (candidate.availabilityState || candidate.availabilityConstraints.length > 0) {
    evidence.push(
      toEvidence(
        candidate.key,
        "availability",
        candidate.availabilityConstraints
          .map((constraint) => constraint.constraintId)
          .join("|") || "summary",
        availabilityEvidenceSummary(candidate),
        candidate.targetRef,
        undefined,
        candidate.availabilityConstraints
          .map((constraint) => constraint.effect)
          .join("|") || candidate.availabilityState,
        {
          sourceClass: "system",
          sourceSystem: MATCHMAKER_V1_ENGINE_VERSION,
          sourceId: "availability",
        },
        "private",
        candidate.availabilityConstraints.length > 0 ? 0.62 : 0.5
      )
    );
  }

  if (candidate.sourceTypes.includes("discovery_context")) {
    evidence.push(
      toEvidence(
        candidate.key,
        "discovery_context",
        "structured_ref",
        "A structured Work reference appears in the discovery context.",
        candidate.targetRef,
        undefined,
        "structured_work_ref",
        {
          sourceClass: "system",
          sourceSystem: MATCHMAKER_V1_ENGINE_VERSION,
          sourceId: "discovery_context",
        },
        "private",
        0.44
      )
    );
  }

  return evidence
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))
    .slice(0, MATCHMAKER_V1_LIMITS.maxEvidencePerCandidate);
}

export function toMatchMakerV1Recommendation(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[],
  confidence: MatchMakerConfidence,
  explanation: MatchMakerRecommendation["explanation"],
  options: MatchMakerV1ResolvedOptions
): MatchMakerRecommendation {
  return {
    metadata: {
      outputId: toMatchMakerV1OutputId(
        candidate.candidate.key,
        evidence.map((item) => item.evidenceId)
      ),
      outputType: "recommendation",
      contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
      generatedAt: options.generatedAt,
      provenance: {
        ...MATCHMAKER_V1_PROVENANCE,
        sourceId: candidate.candidate.key,
      },
      privacyTier: narrowestPrivacyTier(evidence),
      sourceInputContractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    },
    targetEntityRef: candidate.candidate.targetRef,
    targetSummary: candidate.candidate.summary,
    reason: recommendationReasonFor(candidate),
    evidence,
    explanation,
    confidence,
    constraints: [
      ...MATCHMAKER_V1_CONSTRAINTS,
      ...candidate.candidate.availabilityConstraints.map((constraint) => ({
        constraintId: constraint.constraintId,
        constraintClass: "availability" as const,
        description: constraint.description,
        enforced: constraint.enforced,
      })),
    ],
  };
}

export function toMatchMakerV1OutputId(
  candidateKey: string,
  evidenceIds: readonly string[]
): string {
  return stableId([
    MATCHMAKER_V1_ENGINE_VERSION,
    "recommendation",
    candidateKey,
    ...evidenceIds,
  ]);
}

function toEvidence(
  candidateKey: string,
  source: MatchMakerEvidenceSource,
  localId: string,
  summary: string,
  entityRef: LiteraryEntityRef,
  relatedEntityRef: LiteraryEntityRef | undefined,
  signalClass: string | undefined,
  provenance: MatchMakerEvidence["provenance"],
  privacyTier: EntityPlatformPrivacyTier,
  confidenceScore: number,
  relationshipId?: string
): MatchMakerEvidence {
  const score = clamp(confidenceScore);
  return {
    evidenceId: stableId([
      MATCHMAKER_V1_ENGINE_VERSION,
      "evidence",
      candidateKey,
      source,
      localId,
    ]),
    source,
    summary,
    entityRef,
    relatedEntityRef,
    relationshipId,
    signalClass,
    provenance,
    privacyTier,
    confidence: {
      band: score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low",
      score,
      rationale: "Evidence confidence reflects the source confidence available in the input snapshot.",
    },
  };
}

function relatedRefFor(
  candidateKey: string,
  sourceRef: LiteraryEntityRef,
  targetRef: LiteraryEntityRef
): LiteraryEntityRef {
  return toMatchMakerV1EntityKey(sourceRef) === candidateKey
    ? targetRef
    : sourceRef;
}

function recommendationReasonFor(
  candidate: MatchMakerV1ScoredCandidate
): MatchMakerRecommendationReason {
  if (candidate.components.affinity > 0) {
    return "work_affinity_alignment";
  }
  if (candidate.components.graph > 0) {
    return "work_graph_adjacent";
  }
  if (candidate.components.availability > 0) {
    return "work_availability_fit";
  }
  if (candidate.components.interaction > 0) {
    return "work_reinforcement";
  }
  return "work_serendipity_context";
}

function availabilityEvidenceSummary(
  candidate: MatchMakerV1ScoredCandidate["candidate"]
): string {
  if (
    candidate.availabilityConstraints.some(
      (constraint) => constraint.effect === "soft_boost"
    )
  ) {
    return "A soft availability constraint supports this Work.";
  }
  if (
    candidate.availabilityConstraints.some(
      (constraint) => constraint.effect === "soft_penalty"
    )
  ) {
    return "A soft availability constraint limits this Work.";
  }
  return "Availability constraints were considered for this Work.";
}

function narrowestPrivacyTier(
  evidence: readonly MatchMakerEvidence[]
): EntityPlatformPrivacyTier {
  return evidence.reduce<EntityPlatformPrivacyTier>((current, item) => {
    return PRIVACY_TIER_ORDER.indexOf(item.privacyTier) >
      PRIVACY_TIER_ORDER.indexOf(current)
      ? item.privacyTier
      : current;
  }, "public");
}

function stableId(parts: readonly string[]): string {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_");
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, Math.round(value * 10000) / 10000));
}
