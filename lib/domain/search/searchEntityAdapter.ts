import {
  createEditionEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import type {
  SearchEntityResult,
  SearchResponseDTO,
  SearchResultDTO,
  SearchResultEnvelope,
} from "../../../types/bookSearch.ts";
import type { Author, Quote } from "../../../types/entities.ts";
import type { AuthorLifecycleResolution } from "../../authors/authorLifecycle.ts";
import { toAuthorEntitySummary } from "../../authors/authorEntitySummaryAdapter.ts";
import {
  resolveQuoteRuntimeLifecycle,
  type QuoteLifecycleResolution,
} from "../../quotes/quoteLifecycle.ts";
import { toQuoteEntitySummary } from "../../quotes/quoteEntitySummaryAdapter.ts";

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

export function toWorkSearchEntityResult(result: SearchResultDTO): SearchEntityResult {
  const summary = toEntitySummaryFromSearchResult(result);
  const route =
    result.resultType === "canonical" && result.bookId
      ? {
          kind: "book_details" as const,
          bookId: result.bookId,
          ...(result.editionId ? { editionId: result.editionId } : {}),
        }
      : {
          kind: "none" as const,
          reason: "external_work_candidate_not_routable",
        };

  return {
    resultId: result.id,
    entityType: "work",
    entityRef: summary.ref,
    summary,
    route,
    source: "book_search",
    rank: result.rank,
    score: result.confidence,
    legacyWorkResult: result,
  };
}

export function toAuthorSearchEntityResult(params: {
  readonly author: Author;
  readonly authorId?: string;
  readonly lifecycle?: AuthorLifecycleResolution;
  readonly rank?: number;
  readonly score?: number;
}): SearchEntityResult {
  const authorId = (params.authorId || params.author.id).trim();
  const summary = toAuthorEntitySummary(params.author, authorId, params.lifecycle);

  return {
    resultId: `author:${summary.ref.entityId}`,
    entityType: "author",
    entityRef: summary.ref,
    summary,
    route:
      summary.ref.authorityState === "canonical" || summary.ref.authorityState === "enriched"
        ? { kind: "author_details", authorId: summary.ref.entityId }
        : { kind: "none", reason: "non_canonical_author_not_routable" },
    source: "author_entity_adapter",
    ...(params.rank !== undefined ? { rank: params.rank } : {}),
    ...(params.score !== undefined ? { score: params.score } : {}),
  };
}

export function toQuoteSearchEntityResult(params: {
  readonly quote: Quote;
  readonly quoteId?: string;
  readonly lifecycle?: QuoteLifecycleResolution;
  readonly rank?: number;
  readonly score?: number;
}): SearchEntityResult {
  const lifecycle = params.lifecycle ?? resolveQuoteRuntimeLifecycle(params.quote);
  const quoteId = (params.quoteId || params.quote.canonicalQuoteId || params.quote.id).trim();
  const summary = toQuoteEntitySummary(params.quote, quoteId, lifecycle);

  return {
    resultId: `quote:${summary.ref.entityId}`,
    entityType: "quote",
    entityRef: summary.ref,
    summary,
    route:
      lifecycle.identityGraphEligible &&
      (summary.ref.authorityState === "canonical" || summary.ref.authorityState === "enriched")
        ? { kind: "quote_details", quoteId: summary.ref.entityId }
        : { kind: "none", reason: "non_canonical_quote_not_routable" },
    source: "quote_entity_adapter",
    ...(params.rank !== undefined ? { rank: params.rank } : {}),
    ...(params.score !== undefined ? { score: params.score } : {}),
  };
}

export function toSearchResultEnvelope(response: SearchResponseDTO): SearchResultEnvelope {
  return {
    contractVersion: 1,
    mode: "work_compatibility",
    primaryEntityType: "work",
    results: response.results,
    entityResults: response.results.map(toWorkSearchEntityResult),
    nextCursor: response.nextCursor,
    hasMore: response.hasMore,
    cursorUsed: response.cursorUsed,
  };
}
