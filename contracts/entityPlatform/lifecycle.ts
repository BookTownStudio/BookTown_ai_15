import type { EntityPlatformProvenance } from "./common";
import type { LiteraryEntityRef } from "./entityRef";

export const ENTITY_LIFECYCLE_STATES = [
  "candidate",
  "resolved",
  "canonicalized",
  "enriched",
  "related",
  "surfaced",
  "deprecated",
  "merged",
  "archived",
  "unresolved",
] as const;

export type EntityLifecycleState = (typeof ENTITY_LIFECYCLE_STATES)[number];

export interface EntityMergeRecord {
  readonly originalRef: LiteraryEntityRef;
  readonly survivingRef: LiteraryEntityRef;
  readonly reason: string;
  readonly authority: string;
  readonly mergedAt: string;
  readonly compatibilityState: EntityLifecycleState;
  readonly provenance?: EntityPlatformProvenance;
}

