import type {
  EntityPlatformContractVersion,
  EntityPlatformProvenance,
} from "./common";
import type {
  EntityAuthoritySource,
  EntityAuthorityState,
  LiteraryEntityType,
} from "./entityTypes";

export interface LiteraryEntitySourceRef {
  readonly sourceClass: string;
  readonly sourceSystem?: string;
  readonly sourceId?: string;
  readonly sourceUrl?: string;
}

/**
 * Canonical cross-system reference to a literary entity.
 *
 * IDs are type-scoped. Consumers must read entityType before interpreting
 * entityId.
 */
export interface LiteraryEntityRef {
  readonly contractVersion: EntityPlatformContractVersion;
  readonly entityType: LiteraryEntityType;
  readonly entityId: string;
  readonly authorityState: EntityAuthorityState;
  readonly authoritySource: EntityAuthoritySource | string;
  readonly canonicalId?: string;
  readonly canonicalKey?: string;
  readonly sourceRef?: LiteraryEntitySourceRef;
  readonly mergeTarget?: LiteraryEntityRef;
  readonly displayHint?: string;
  readonly languageHint?: string;
  readonly resolutionConfidence?: number;
  readonly provenance?: EntityPlatformProvenance;
}

