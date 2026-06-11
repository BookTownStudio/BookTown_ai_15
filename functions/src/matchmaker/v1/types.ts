import type {
  EntityPlatformPrivacyTier,
  EntityPlatformProvenance,
} from "../../contracts/shared/entityPlatform/common";
import type { LiteraryEntityRef } from "../../contracts/shared/entityPlatform/entityRef";
import type { EntitySummary } from "../../contracts/shared/entityPlatform/entitySummary";
import type { EntityRelationship } from "../../contracts/shared/entityPlatform/graphEntity";
import type {
  EntityAffinity,
  MatchMakerInput,
} from "../../contracts/shared/entityPlatform/matchmaker";
import type {
  MatchMakerConfidence,
  MatchMakerConstraint,
  MatchMakerEvidence,
  MatchMakerRecommendation,
  MatchMakerRecommendationTargetRef,
} from "../../contracts/shared/entityPlatform/matchmakerOutputs";
import type { UserEntityInteraction } from "../../contracts/shared/entityPlatform/userInteraction";

export const MATCHMAKER_V1_ENGINE_VERSION = "matchmaker_v1";

export const MATCHMAKER_V1_DEFAULT_GENERATED_AT =
  "1970-01-01T00:00:00.000Z";

export const MATCHMAKER_V1_LIMITS = {
  defaultRecommendations: 20,
  maxRecommendations: 50,
  maxInputRefs: 100,
  maxCandidates: 120,
  maxEvidencePerCandidate: 12,
} as const;

export const MATCHMAKER_V1_PROVENANCE: EntityPlatformProvenance = {
  sourceClass: "system",
  sourceSystem: MATCHMAKER_V1_ENGINE_VERSION,
  sourceId: "engine",
};

export const MATCHMAKER_V1_CONSTRAINTS: readonly MatchMakerConstraint[] = [
  {
    constraintId: "matchmaker_v1:scope:work_only",
    constraintClass: "scope",
    description: "V1 emits Work recommendations only.",
    enforced: true,
  },
  {
    constraintId: "matchmaker_v1:authority:derived_intelligence",
    constraintClass: "authority",
    description:
      "Outputs are derived literary intelligence and do not change canonical entity truth.",
    enforced: true,
  },
  {
    constraintId: "matchmaker_v1:privacy:snapshot_only",
    constraintClass: "privacy",
    description:
      "Explanations disclose only privacy-safe evidence summaries from the input snapshot.",
    enforced: true,
  },
  {
    constraintId: "matchmaker_v1:safety:bounded_deterministic",
    constraintClass: "safety",
    description:
      "Candidate processing is bounded, deterministic, and side-effect free.",
    enforced: true,
  },
];

export interface MatchMakerV1Options {
  readonly generatedAt: string;
  readonly maxRecommendations?: number;
}

export interface MatchMakerV1ResolvedOptions {
  readonly generatedAt: string;
  readonly maxRecommendations: number;
}

export type MatchMakerV1CandidateSource =
  | "entity_ref"
  | "entity_summary"
  | "affinity"
  | "interaction"
  | "graph"
  | "discovery_context";

export type MatchMakerV1SuppressionReason =
  | "non_work"
  | "inactive_authority"
  | "missing_identity"
  | "negative_only"
  | "no_safe_evidence"
  | "hard_availability_block";

export type MatchMakerV1AvailabilityEffect =
  | "hard_block"
  | "soft_boost"
  | "soft_penalty"
  | "neutral";

export interface MatchMakerV1AvailabilityConstraint {
  readonly constraintId: string;
  readonly effect: MatchMakerV1AvailabilityEffect;
  readonly description: string;
  readonly state?: string;
  readonly enforced: boolean;
}

export interface MatchMakerV1Candidate {
  readonly key: string;
  readonly targetRef: MatchMakerRecommendationTargetRef;
  readonly refs: readonly MatchMakerRecommendationTargetRef[];
  readonly summary?: EntitySummary;
  readonly sourceTypes: readonly MatchMakerV1CandidateSource[];
  readonly affinities: readonly EntityAffinity[];
  readonly interactions: readonly UserEntityInteraction[];
  readonly relationships: readonly EntityRelationship[];
  readonly availabilityState?: string;
  readonly availabilityConstraints: readonly MatchMakerV1AvailabilityConstraint[];
  readonly suppressedReasons: readonly MatchMakerV1SuppressionReason[];
}

export interface MatchMakerV1ScoreComponents {
  readonly affinity: number;
  readonly interaction: number;
  readonly graph: number;
  readonly availability: number;
  readonly negativePenalty: number;
  readonly contradictionPenalty: number;
  readonly sparsePenalty: number;
  readonly privacyPenalty: number;
}

export interface MatchMakerV1TieBreakers {
  readonly confidenceSort: number;
  readonly affinitySort: number;
  readonly interactionSort: number;
  readonly graphSort: number;
  readonly evidenceSort: number;
  readonly keySort: string;
}

export interface MatchMakerV1ScoredCandidate {
  readonly candidate: MatchMakerV1Candidate;
  readonly evidence: readonly MatchMakerEvidence[];
  readonly baseScore: number;
  readonly finalScore: number;
  readonly components: MatchMakerV1ScoreComponents;
  readonly tieBreakers: MatchMakerV1TieBreakers;
  readonly confidence?: MatchMakerConfidence;
}

export interface MatchMakerV1RecommendationDraft {
  readonly scoredCandidate: MatchMakerV1ScoredCandidate;
  readonly evidence: readonly MatchMakerEvidence[];
  readonly confidence: MatchMakerConfidence;
  readonly recommendation: MatchMakerRecommendation;
}

export type MatchMakerV1CandidateMap = Map<string, MutableMatchMakerV1Candidate>;

export interface MutableMatchMakerV1Candidate {
  key: string;
  targetRef: MatchMakerRecommendationTargetRef;
  refs: MatchMakerRecommendationTargetRef[];
  summary?: EntitySummary;
  sourceTypes: Set<MatchMakerV1CandidateSource>;
  affinities: EntityAffinity[];
  interactions: UserEntityInteraction[];
  relationships: EntityRelationship[];
  availabilityState?: string;
  availabilityConstraints: MatchMakerV1AvailabilityConstraint[];
  suppressedReasons: Set<MatchMakerV1SuppressionReason>;
}

export type MatchMakerV1InputSection =
  | keyof Pick<
      MatchMakerInput,
      | "entityRefs"
      | "entitySummaries"
      | "userAffinitySummaries"
      | "interactionSummaries"
      | "graphRelationshipSummaries"
    >;

export const PRIVACY_TIER_ORDER: readonly EntityPlatformPrivacyTier[] = [
  "public",
  "followers",
  "private",
  "system",
  "admin",
];
