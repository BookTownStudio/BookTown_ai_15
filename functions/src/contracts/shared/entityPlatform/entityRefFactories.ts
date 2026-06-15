import { ENTITY_PLATFORM_CONTRACT_VERSION } from "./common";
import type { EntityPlatformProvenance } from "./common";
import type { EntityAuthoritySource, EntityAuthorityState, LiteraryEntityType } from "./entityTypes";
import type { LiteraryEntityRef, LiteraryEntitySourceRef } from "./entityRef";

export interface LiteraryEntityRefFactoryOptions {
  readonly authorityState?: EntityAuthorityState;
  readonly authoritySource?: EntityAuthoritySource | string;
  readonly canonicalId?: string;
  readonly canonicalKey?: string;
  readonly sourceRef?: LiteraryEntitySourceRef;
  readonly mergeTarget?: LiteraryEntityRef;
  readonly displayHint?: string;
  readonly languageHint?: string;
  readonly resolutionConfidence?: number;
  readonly provenance?: EntityPlatformProvenance;
}

const DEFAULT_AUTHORITY_STATE: EntityAuthorityState = "canonical";

const DEFAULT_AUTHORITY_SOURCE_BY_TYPE: Readonly<Record<LiteraryEntityType, EntityAuthoritySource>> = {
  work: "work_authority",
  edition: "edition_authority",
  author: "author_authority",
  quote: "quote_authority",
  publication: "publication_authority",
  theme: "theme_authority",
  concept: "concept_authority",
  movement: "movement_authority",
  period: "period_authority",
  place: "place_authority",
};

/**
 * Creates a LiteraryEntityRef from an existing identity value.
 *
 * This helper is pure and implementation-neutral. It does not validate against
 * persistence, query an authority source, or imply subsystem adoption.
 */
export function createLiteraryEntityRef(
  entityType: LiteraryEntityType,
  entityId: string,
  options: LiteraryEntityRefFactoryOptions = {}
): LiteraryEntityRef {
  return {
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    entityType,
    entityId,
    authorityState: options.authorityState ?? DEFAULT_AUTHORITY_STATE,
    authoritySource: options.authoritySource ?? DEFAULT_AUTHORITY_SOURCE_BY_TYPE[entityType],
    ...(options.canonicalId !== undefined ? { canonicalId: options.canonicalId } : {}),
    ...(options.canonicalKey !== undefined ? { canonicalKey: options.canonicalKey } : {}),
    ...(options.sourceRef !== undefined ? { sourceRef: options.sourceRef } : {}),
    ...(options.mergeTarget !== undefined ? { mergeTarget: options.mergeTarget } : {}),
    ...(options.displayHint !== undefined ? { displayHint: options.displayHint } : {}),
    ...(options.languageHint !== undefined ? { languageHint: options.languageHint } : {}),
    ...(options.resolutionConfidence !== undefined
      ? { resolutionConfidence: options.resolutionConfidence }
      : {}),
    ...(options.provenance !== undefined ? { provenance: options.provenance } : {}),
  };
}

export function createWorkEntityRef(
  bookId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("work", bookId, options);
}

export function createEditionEntityRef(
  editionId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("edition", editionId, options);
}

export function createAuthorEntityRef(
  authorId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("author", authorId, options);
}

export function createQuoteEntityRef(
  quoteId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("quote", quoteId, options);
}

export function createPublicationEntityRef(
  publicationId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("publication", publicationId, options);
}

export function createMovementEntityRef(
  movementId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("movement", movementId, options);
}

export function createPeriodEntityRef(
  periodId: string,
  options?: LiteraryEntityRefFactoryOptions
): LiteraryEntityRef {
  return createLiteraryEntityRef("period", periodId, options);
}
