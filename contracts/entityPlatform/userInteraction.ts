import type {
  EntityPlatformContractVersion,
  EntityPlatformPrivacyTier,
  EntityPlatformProvenance,
  EntityPlatformWeightClass,
} from "./common";
import type { LiteraryEntityRef } from "./entityRef";

export const USER_ENTITY_INTERACTION_TYPES = [
  "reading",
  "shelving",
  "reviewing",
  "quoting",
  "following",
  "bookmarking",
  "searching",
  "discovering",
  "publishing",
  "discussing",
] as const;

export type UserEntityInteractionType =
  (typeof USER_ENTITY_INTERACTION_TYPES)[number];

export const USER_ENTITY_INTERACTION_LIFECYCLE_STATES = [
  "recorded",
  "superseded",
  "withdrawn",
  "expired",
  "anonymized",
  "deleted",
] as const;

export type UserEntityInteractionLifecycleState =
  (typeof USER_ENTITY_INTERACTION_LIFECYCLE_STATES)[number];

export const USER_ENTITY_INTERACTION_SOURCE_SURFACES = [
  "reader",
  "search",
  "discovery",
  "book_details",
  "author_details",
  "quote_details",
  "shelf",
  "social_post",
  "message",
  "publication_reader",
  "profile",
  "admin",
  "migration",
] as const;

export type UserEntityInteractionSourceSurface =
  (typeof USER_ENTITY_INTERACTION_SOURCE_SURFACES)[number];

/**
 * Canonical model for user interaction with a literary entity.
 *
 * This belongs to the Literary Identity Graph and must not redefine entity
 * truth.
 */
export interface UserEntityInteraction {
  readonly interactionId: string;
  readonly uid: string;
  readonly entityRef: LiteraryEntityRef;
  readonly interactionType: UserEntityInteractionType;
  readonly sourceSurface: UserEntityInteractionSourceSurface | string;
  readonly provenance: EntityPlatformProvenance;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly lifecycleState: UserEntityInteractionLifecycleState;
  readonly weightClass: EntityPlatformWeightClass;
  readonly occurredAt: string;
  readonly contractVersion: EntityPlatformContractVersion;
  readonly idempotencyKey?: string;
}

