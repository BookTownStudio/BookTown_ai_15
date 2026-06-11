/**
 * Shared Entity Platform primitives.
 *
 * These contracts are implementation-neutral. They do not describe Firestore
 * documents, callable APIs, UI models, indexes, or migration behavior.
 */

export const ENTITY_PLATFORM_CONTRACT_VERSION = 1 as const;

export type EntityPlatformContractVersion = typeof ENTITY_PLATFORM_CONTRACT_VERSION;

export type EntityPlatformStringMap = Readonly<Record<string, string>>;

export interface EntityPlatformProvenance {
  readonly sourceClass: EntityPlatformProvenanceClass;
  readonly sourceSystem?: string;
  readonly sourceId?: string;
  readonly evidence?: readonly string[];
  readonly note?: string;
}

export const ENTITY_PLATFORM_PROVENANCE_CLASSES = [
  "canonical_authority",
  "editorial",
  "seeded",
  "migration",
  "provider",
  "user",
  "system",
  "ai_assisted",
  "derived_ontology",
  "derived_identity_graph",
] as const;

export type EntityPlatformProvenanceClass =
  (typeof ENTITY_PLATFORM_PROVENANCE_CLASSES)[number];

export const ENTITY_PLATFORM_PRIVACY_TIERS = [
  "public",
  "followers",
  "private",
  "system",
  "admin",
] as const;

export type EntityPlatformPrivacyTier =
  (typeof ENTITY_PLATFORM_PRIVACY_TIERS)[number];

export const ENTITY_PLATFORM_WEIGHT_CLASSES = [
  "passive",
  "active",
  "expressive",
  "durable",
  "negative",
  "administrative",
] as const;

export type EntityPlatformWeightClass =
  (typeof ENTITY_PLATFORM_WEIGHT_CLASSES)[number];

