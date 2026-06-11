import type {
  EntityPlatformContractVersion,
  EntityPlatformPrivacyTier,
  EntityPlatformProvenance,
} from "./common";
import type { EntitySummary } from "./entitySummary";
import type { LiteraryEntityRef } from "./entityRef";

export const MATCHMAKER_OUTPUT_TYPES = [
  "recommendation",
  "discovery",
  "pathway",
  "insight",
  "challenge",
  "reflection",
] as const;

export type MatchMakerOutputType = (typeof MATCHMAKER_OUTPUT_TYPES)[number];

export const MATCHMAKER_REASON_CLASSES = [
  "reinforcement",
  "exploration",
  "discovery",
  "growth",
  "challenge",
  "contrast",
  "identity",
  "affinity",
  "graph_context",
  "availability",
  "pathway",
  "serendipity",
] as const;

export type MatchMakerReasonClass =
  (typeof MATCHMAKER_REASON_CLASSES)[number];

export const MATCHMAKER_EVIDENCE_SOURCES = [
  "affinity",
  "interaction",
  "graph",
  "entity",
  "profile_context",
  "availability",
  "discovery_context",
] as const;

export type MatchMakerEvidenceSource =
  (typeof MATCHMAKER_EVIDENCE_SOURCES)[number];

export const MATCHMAKER_CONFIDENCE_BANDS = [
  "low",
  "medium",
  "high",
] as const;

export type MatchMakerConfidenceBand =
  (typeof MATCHMAKER_CONFIDENCE_BANDS)[number];

export const MATCHMAKER_RECOMMENDATION_REASONS = [
  "work_reinforcement",
  "work_graph_adjacent",
  "work_affinity_alignment",
  "work_availability_fit",
  "work_profile_context_fit",
  "work_serendipity_context",
] as const;

export type MatchMakerRecommendationReason =
  (typeof MATCHMAKER_RECOMMENDATION_REASONS)[number];

export const MATCHMAKER_DISCOVERY_REASONS = [
  "adjacent_work",
  "underexplored_context",
  "safe_novelty",
  "graph_near_discovery",
  "profile_context_discovery",
  "availability_discovery",
] as const;

export type MatchMakerDiscoveryReason =
  (typeof MATCHMAKER_DISCOVERY_REASONS)[number];

export interface MatchMakerConfidence {
  readonly band: MatchMakerConfidenceBand;
  readonly score: number;
  readonly rationale: string;
  readonly evidenceCoverage?: string;
}

export interface MatchMakerConstraint {
  readonly constraintId: string;
  readonly constraintClass:
    | "privacy"
    | "authority"
    | "availability"
    | "scope"
    | "diversity"
    | "freshness"
    | "safety";
  readonly description: string;
  readonly enforced: boolean;
}

export interface MatchMakerEvidence {
  readonly evidenceId: string;
  readonly source: MatchMakerEvidenceSource;
  readonly summary: string;
  readonly entityRef?: LiteraryEntityRef;
  readonly relatedEntityRef?: LiteraryEntityRef;
  readonly relationshipId?: string;
  readonly signalClass?: string;
  readonly provenance: EntityPlatformProvenance;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly confidence: MatchMakerConfidence;
}

export interface MatchMakerExplanation {
  readonly primaryReasonClass: MatchMakerReasonClass;
  readonly reasonClasses: readonly MatchMakerReasonClass[];
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly sourceBoundaries: readonly MatchMakerEvidenceSource[];
  readonly privacyBoundary: string;
  readonly authorityBoundary: "derived_intelligence_not_canonical_truth";
  readonly constraintIds: readonly string[];
}

export interface MatchMakerOutputMetadata {
  readonly outputId: string;
  readonly outputType: MatchMakerOutputType;
  readonly contractVersion: EntityPlatformContractVersion;
  readonly generatedAt: string;
  readonly provenance: EntityPlatformProvenance;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly sourceInputContractVersion?: EntityPlatformContractVersion;
}

interface MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata;
  readonly evidence: readonly MatchMakerEvidence[];
  readonly explanation: MatchMakerExplanation;
  readonly confidence: MatchMakerConfidence;
  readonly constraints: readonly MatchMakerConstraint[];
}

export type MatchMakerRecommendationTargetRef = LiteraryEntityRef & {
  readonly entityType: "work";
};

export interface MatchMakerRecommendation extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "recommendation";
  };
  readonly targetEntityRef: MatchMakerRecommendationTargetRef;
  readonly targetSummary?: EntitySummary;
  readonly reason: MatchMakerRecommendationReason;
}

export interface MatchMakerDiscovery extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "discovery";
  };
  readonly targetEntityRef: LiteraryEntityRef;
  readonly targetSummary?: EntitySummary;
  readonly reason: MatchMakerDiscoveryReason;
  readonly adjacencySummary: string;
}

export interface MatchMakerPathwayStep {
  readonly stepId: string;
  readonly order: number;
  readonly entityRef: LiteraryEntityRef;
  readonly summary?: EntitySummary;
  readonly reasonClass: MatchMakerReasonClass;
  readonly evidenceIds: readonly string[];
}

export interface MatchMakerPathway extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "pathway";
  };
  readonly startContext: string;
  readonly steps: readonly MatchMakerPathwayStep[];
  readonly destinationEntityRef?: LiteraryEntityRef;
}

export interface MatchMakerInsight extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "insight";
  };
  readonly insightClass: "identity" | "affinity" | "growth" | "contrast";
  readonly statement: string;
  readonly subjectEntityRefs: readonly LiteraryEntityRef[];
}

export interface MatchMakerChallenge extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "challenge";
  };
  readonly targetEntityRef: LiteraryEntityRef;
  readonly targetSummary?: EntitySummary;
  readonly challengeClass: "contrast" | "growth" | "difficulty" | "breadth";
  readonly rationale: string;
}

export interface MatchMakerReflection extends MatchMakerOutputBase {
  readonly metadata: MatchMakerOutputMetadata & {
    readonly outputType: "reflection";
  };
  readonly reflectionClass: "identity" | "growth" | "pattern" | "choice";
  readonly prompt: string;
  readonly subjectEntityRefs: readonly LiteraryEntityRef[];
}
