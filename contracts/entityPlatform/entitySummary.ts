import type {
  EntityPlatformContractVersion,
  EntityPlatformStringMap,
} from "./common";
import type { EntityAuthorityState } from "./entityTypes";
import type { LiteraryEntityRef } from "./entityRef";

export const ENTITY_SUMMARY_NAVIGATION_STATES = [
  "openable",
  "preview_only",
  "non_navigable",
] as const;

export type EntitySummaryNavigationState =
  (typeof ENTITY_SUMMARY_NAVIGATION_STATES)[number];

export interface EntitySummaryImage {
  readonly url: string;
  readonly alt?: string;
  readonly source?: string;
}

export interface EntitySummaryAvailability {
  readonly state: string;
  readonly label?: string;
}

export interface EntitySummaryRelationshipContext {
  readonly reasonClass: string;
  readonly label?: string;
  readonly evidence?: readonly string[];
}

/**
 * Lightweight display and routing representation of a literary entity.
 *
 * Only ref carries identity authority. All display fields are projections.
 */
export interface EntitySummary {
  readonly ref: LiteraryEntityRef;
  readonly title: string;
  readonly authorityState: EntityAuthorityState;
  readonly summaryVersion: EntityPlatformContractVersion;
  readonly subtitle?: string;
  readonly description?: string;
  readonly image?: EntitySummaryImage;
  readonly language?: string;
  readonly alternateTitles?: readonly string[];
  readonly localizedTitles?: EntityPlatformStringMap;
  readonly badges?: readonly string[];
  readonly availability?: EntitySummaryAvailability;
  readonly relationshipContext?: EntitySummaryRelationshipContext;
  readonly navigation?: EntitySummaryNavigationState;
  readonly typeSpecific?: Readonly<Record<string, unknown>>;
}

