import {
  createAuthorEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type EntitySummary,
} from "../../../contracts/entityPlatform";
import type { AuthorRecommendationInput } from "../../../lib/domain/authorRecommendations";

export const generatedAt = "2026-06-12T00:00:00.000Z";

export const provenance = {
  sourceClass: "system" as const,
  sourceSystem: "author_recommendation_test",
};

export function authorSummary(id: string, title = `Author ${id}`): EntitySummary {
  const ref = createAuthorEntityRef(id);
  return {
    ref,
    title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

export function directAffinity(id: string, confidence = 0.9): EntityAffinity {
  return {
    uid: "user_1",
    entityRef: createAuthorEntityRef(id),
    affinityClass: "explicit",
    strengthBand: "strong",
    confidence,
    contributingSignalClasses: ["interaction:following", "source:author_follow"],
    recency: "2026-06-11T00:00:00.000Z",
    provenance: {
      ...provenance,
      sourceSystem: "author_follow",
      sourceId: id,
    },
    privacyTier: "private",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

export function rolledAffinity(id: string, confidence = 0.65): EntityAffinity {
  return {
    uid: "user_1",
    entityRef: createAuthorEntityRef(id),
    affinityClass: "behavioral",
    strengthBand: "moderate",
    confidence,
    contributingSignalClasses: ["rollup:work_to_author", "signal:completed_reading"],
    recency: "2026-06-10T00:00:00.000Z",
    provenance: {
      sourceClass: "derived_identity_graph",
      sourceSystem: "work_to_author_rollup",
      sourceId: id,
    },
    privacyTier: "private",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

export function negativeAffinity(id: string): EntityAffinity {
  return {
    uid: "user_1",
    entityRef: createAuthorEntityRef(id),
    affinityClass: "negative",
    strengthBand: "moderate",
    confidence: 0.8,
    contributingSignalClasses: ["negative:author"],
    provenance,
    privacyTier: "private",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

export function input(value: Partial<AuthorRecommendationInput>): AuthorRecommendationInput {
  return {
    uid: "user_1",
    generatedAt,
    authorSummaries: [],
    authorAffinities: [],
    ...value,
  };
}

