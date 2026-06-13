import type {
  EntityAffinity,
  EntityPlatformContractVersion,
  EntityPlatformPrivacyTier,
  EntityPlatformProvenance,
  EntitySummary,
  LiteraryEntityRef,
} from "../../../contracts/entityPlatform";

export const AUTHOR_RECOMMENDATION_ENGINE_VERSION = "author_recommendation_v1";

export const AUTHOR_RECOMMENDATION_LIMITS = {
  defaultResults: 10,
  maxResults: 20,
  maxCandidates: 100,
} as const;

export type AuthorRecommendationReason =
  | "direct_author_affinity"
  | "rolled_author_affinity"
  | "direct_and_rolled_author_affinity"
  | "author_identity_reinforcement"
  | "author_exploration";

export type AuthorRecommendationEvidenceSource =
  | "direct_author_affinity"
  | "rolled_author_affinity"
  | "author_summary";

export type AuthorRecommendationConfidenceBand = "low" | "medium" | "high";

export type AuthorRecommendationConstraintType =
  | "privacy"
  | "authority"
  | "scope"
  | "confidence"
  | "safety"
  | "freshness"
  | "diversity";

export interface AuthorRecommendationInputConstraint {
  readonly constraintId: string;
  readonly constraintType: AuthorRecommendationConstraintType;
  readonly description: string;
  readonly enforced: boolean;
}

export interface AuthorRecommendationInput {
  readonly uid: string;
  readonly generatedAt: string;
  readonly maxResults?: number;
  readonly authorSummaries: readonly EntitySummary[];
  readonly authorAffinities: readonly EntityAffinity[];
  readonly constraints?: readonly AuthorRecommendationInputConstraint[];
}

export interface AuthorRecommendationEvidence {
  readonly evidenceId: string;
  readonly source: AuthorRecommendationEvidenceSource;
  readonly signalClass: string;
  readonly description: string;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly provenance: EntityPlatformProvenance;
}

export interface AuthorRecommendationConfidence {
  readonly band: AuthorRecommendationConfidenceBand;
  readonly score: number;
  readonly rationale: string;
}

export interface AuthorRecommendationExplanation {
  readonly summary: string;
  readonly evidenceSourceClasses: readonly AuthorRecommendationEvidenceSource[];
  readonly confidenceBand: AuthorRecommendationConfidenceBand;
  readonly confidenceRationale: string;
  readonly privacyBoundary: string;
  readonly authorityBoundary: string;
  readonly contradictionNote?: string;
}

export interface AuthorRecommendationConstraint {
  readonly constraintId: string;
  readonly constraintType: AuthorRecommendationConstraintType;
  readonly description: string;
  readonly enforced: boolean;
}

export interface AuthorRecommendationMetadata {
  readonly outputId: string;
  readonly outputType: "author_recommendation";
  readonly contractVersion: EntityPlatformContractVersion;
  readonly generatedAt: string;
  readonly provenance: EntityPlatformProvenance;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly sourceInputContractVersion?: EntityPlatformContractVersion;
}

export interface AuthorRecommendation {
  readonly metadata: AuthorRecommendationMetadata;
  readonly targetAuthorRef: LiteraryEntityRef;
  readonly targetSummary: EntitySummary;
  readonly reason: AuthorRecommendationReason;
  readonly evidence: readonly AuthorRecommendationEvidence[];
  readonly explanation: AuthorRecommendationExplanation;
  readonly confidence: AuthorRecommendationConfidence;
  readonly constraints: readonly AuthorRecommendationConstraint[];
}

export interface AuthorRecommendationCandidate {
  readonly key: string;
  readonly authorRef: LiteraryEntityRef;
  readonly summary?: EntitySummary;
  readonly directAffinities: readonly EntityAffinity[];
  readonly rolledAffinities: readonly EntityAffinity[];
  readonly negativeAffinities: readonly EntityAffinity[];
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly evidence: readonly AuthorRecommendationEvidence[];
}

export interface EligibleAuthorRecommendationCandidate
  extends AuthorRecommendationCandidate {
  readonly summary: EntitySummary;
}

export interface AuthorRecommendationScoreComponents {
  readonly directAffinity: number;
  readonly rolledAffinity: number;
  readonly evidenceDiversity: number;
  readonly recency: number;
  readonly agreement: number;
  readonly penalties: number;
}

export interface ScoredAuthorRecommendationCandidate {
  readonly candidate: EligibleAuthorRecommendationCandidate;
  readonly baseScore: number;
  readonly finalScore: number;
  readonly scoreCap: number;
  readonly components: AuthorRecommendationScoreComponents;
}

export interface AuthorRecommendationResult {
  readonly recommendations: readonly AuthorRecommendation[];
}

