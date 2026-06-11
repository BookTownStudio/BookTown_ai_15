import {
  createEditionEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import type { SearchResultDTO } from "../../../types/bookSearch.ts";

/**
 * Derives a LiteraryEntityRef from the existing book search DTO.
 *
 * SearchResultDTO remains the authoritative search model. This adapter is pure,
 * does not mutate the DTO, and does not imply mixed-entity search support.
 */
export function toLiteraryEntityRefFromSearchResult(result: SearchResultDTO): LiteraryEntityRef {
  if (result.resultType === "canonical") {
    return createWorkEntityRef(result.bookId, {
      canonicalKey: result.canonicalKey,
      displayHint: result.title || result.titleEn || result.titleAr,
      languageHint: result.language,
      provenance: {
        sourceClass: "system",
        sourceSystem: "book_search",
        sourceId: result.id,
      },
    });
  }

  return createWorkEntityRef(result.id, {
    authorityState: "candidate",
    authoritySource: "provider",
    displayHint: result.title || result.titleEn || result.titleAr,
    languageHint: result.language,
    sourceRef: {
      sourceClass: "external_provider",
      sourceSystem: result.source,
      sourceId: result.externalId || result.id,
    },
    provenance: {
      sourceClass: "provider",
      sourceSystem: "book_search",
      sourceId: result.id,
    },
  });
}

/**
 * Derives an optional Edition ref from SearchResultDTO.
 *
 * Edition refs are metadata only and never replace the Work ref.
 */
export function toEditionEntityRefFromSearchResult(result: SearchResultDTO): LiteraryEntityRef | null {
  if (!result.editionId) return null;

  return createEditionEntityRef(result.editionId, {
    authorityState: result.resultType === "canonical" ? "canonical" : "candidate",
    authoritySource: result.resultType === "canonical" ? "edition_authority" : "provider",
    displayHint: result.title || result.titleEn || result.titleAr,
    languageHint: result.language,
    sourceRef: result.resultType === "external"
      ? {
          sourceClass: "external_provider",
          sourceSystem: result.source,
          sourceId: result.externalId || result.editionId,
        }
      : undefined,
    provenance: {
      sourceClass: result.resultType === "canonical" ? "system" : "provider",
      sourceSystem: "book_search",
      sourceId: result.id,
    },
  });
}

/**
 * Derives an EntitySummary for display compatibility from SearchResultDTO.
 *
 * Author fields remain subtitle display strings. They are not Author entity refs.
 */
export function toEntitySummaryFromSearchResult(result: SearchResultDTO): EntitySummary {
  const ref = toLiteraryEntityRefFromSearchResult(result);
  const title = result.title || result.titleEn || result.titleAr || ref.entityId;
  const subtitle = result.authorEn || result.authors[0] || result.authorAr || "";
  const editionRef = toEditionEntityRefFromSearchResult(result);

  return {
    ref,
    title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(subtitle ? { subtitle } : {}),
    ...(result.description ? { description: result.description } : {}),
    ...(result.coverUrl ? { image: { url: result.coverUrl } } : {}),
    ...(result.language ? { language: result.language } : {}),
    navigation: "openable",
    typeSpecific: {
      searchResultType: result.resultType,
      workType: result.workType,
      editionPresence: result.editionPresence,
      source: result.source,
      sourceClass: result.sourceClass,
      ...(editionRef ? { editionRef } : {}),
    },
  };
}

