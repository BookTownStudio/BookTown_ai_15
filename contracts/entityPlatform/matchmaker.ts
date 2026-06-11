import type {
  EntityPlatformContractVersion,
  EntityPlatformPrivacyTier,
  EntityPlatformProvenance,
} from "./common";
import type { EntitySummary } from "./entitySummary";
import type { LiteraryEntityRef } from "./entityRef";
import type { EntityRelationship } from "./graphEntity";
import type { UserEntityInteraction } from "./userInteraction";

export const MATCHMAKER_AFFINITY_CLASSES = [
  "explicit",
  "behavioral",
  "expressive",
  "derived_graph_near",
  "negative",
] as const;

export type MatchMakerAffinityClass =
  (typeof MATCHMAKER_AFFINITY_CLASSES)[number];

export const MATCHMAKER_STRENGTH_BANDS = [
  "weak",
  "moderate",
  "strong",
  "very_strong",
] as const;

export type MatchMakerStrengthBand =
  (typeof MATCHMAKER_STRENGTH_BANDS)[number];

export interface EntityAffinity {
  readonly uid: string;
  readonly entityRef: LiteraryEntityRef;
  readonly affinityClass: MatchMakerAffinityClass;
  readonly strengthBand: MatchMakerStrengthBand;
  readonly confidence: number;
  readonly contributingSignalClasses: readonly string[];
  readonly recency?: string;
  readonly provenance: EntityPlatformProvenance;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly contractVersion: EntityPlatformContractVersion;
}

export interface MatchMakerInput {
  readonly entityRefs?: readonly LiteraryEntityRef[];
  readonly entitySummaries?: readonly EntitySummary[];
  readonly graphRelationshipSummaries?: readonly EntityRelationship[];
  readonly userAffinitySummaries?: readonly EntityAffinity[];
  readonly interactionSummaries?: readonly UserEntityInteraction[];
  readonly searchOrDiscoveryContext?: Readonly<Record<string, unknown>>;
  readonly availabilityConstraints?: Readonly<Record<string, unknown>>;
  readonly privacySafeProfileContext?: Readonly<Record<string, unknown>>;
  readonly contractVersion: EntityPlatformContractVersion;
}

export interface MatchMakerPathway {
  readonly startContext: string;
  readonly orderedEntityRefs: readonly LiteraryEntityRef[];
  readonly relationshipEvidence: readonly EntityRelationship[];
  readonly identityEvidence: readonly EntityAffinity[];
  readonly explanation: string;
  readonly confidence: number;
  readonly exclusionsOrConstraints?: readonly string[];
  readonly contractVersion: EntityPlatformContractVersion;
}

export interface MatchMakerDiscovery {
  readonly targetEntityRef: LiteraryEntityRef;
  readonly reasonClass: string;
  readonly supportingEvidence: readonly string[];
  readonly confidence: number;
  readonly userContextBoundary: string;
  readonly graphContextBoundary: string;
  readonly freshness?: string;
  readonly summary?: EntitySummary;
  readonly contractVersion: EntityPlatformContractVersion;
}

