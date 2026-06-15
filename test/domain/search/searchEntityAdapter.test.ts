import { describe, expect, it } from "vitest";
import {
  toEditionEntityRefFromSearchResult,
  toAuthorSearchEntityResult,
  toEntitySummaryFromSearchResult,
  toLiteraryEntityRefFromSearchResult,
  toQuoteSearchEntityResult,
  toSearchResultEnvelope,
  toWorkSearchEntityResult,
} from "../../../lib/domain/search/searchEntityAdapter.ts";
import type { SearchResponseDTO, SearchResultDTO } from "../../../types/bookSearch.ts";
import type { Author, Quote } from "../../../types/entities.ts";

function buildResult(overrides: Partial<SearchResultDTO> = {}): SearchResultDTO {
  return {
    id: "book_1",
    editionId: "edition_1",
    bookId: "book_1",
    workId: "book_1",
    externalId: "",
    source: "booktown",
    resultType: "canonical",
    workType: "work",
    editionPresence: "single",
    ebookClass: "unavailable",
    sourceClass: "canonical_catalog",
    languageTruth: "unknown",
    title: "Canonical Book",
    titleEn: "Canonical Book",
    titleAr: "",
    authors: ["Author One"],
    authorEn: "Author One",
    authorAr: "",
    description: "Description",
    descriptionEn: "Description",
    descriptionAr: "",
    coverUrl: "https://example.test/cover.jpg",
    language: "en",
    available: false,
    acquired: false,
    readAccess: "none",
    readProvider: null,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    confidence: 0.9,
    rank: 1,
    canonicalKey: "canonical:book:1",
    ...overrides,
  };
}

const author: Author = {
  id: "provider_author_id",
  nameEn: "Octavia Butler",
  nameAr: "",
  providerSource: "openLibrary",
  providerExternalId: "OL123A",
};

const quote: Quote = {
  id: "quote_1",
  canonicalQuoteId: "quote_1",
  ownerId: "user_1",
  textEn: "There is nothing new under the sun, but there are new suns.",
  textAr: "",
  sourceEn: "Parable",
  sourceAr: "",
  bookId: "book_1",
  authorId: "author_octavia_butler",
  provenance: {
    sourceType: "book",
    verificationStatus: "canonical_linked",
    sourceBookId: "book_1",
    sourceAuthorId: "author_octavia_butler",
  },
};

describe("searchEntityAdapter", () => {
  it("maps canonical search results to Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromSearchResult(buildResult())).toMatchObject({
      contractVersion: 1,
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
      canonicalKey: "canonical:book:1",
    });
  });

  it("maps external search results to non-canonical Work refs using existing result identity", () => {
    expect(
      toLiteraryEntityRefFromSearchResult(
        buildResult({
          id: "gb_external_123",
          bookId: "",
          editionId: "gb_external_123",
          externalId: "external_123",
          source: "googleBooks",
          resultType: "external",
          workType: "edition",
          sourceClass: "external_provider",
          canonicalKey: undefined,
        })
      )
    ).toMatchObject({
      entityType: "work",
      entityId: "gb_external_123",
      authorityState: "candidate",
      authoritySource: "provider",
      sourceRef: {
        sourceClass: "external_provider",
        sourceSystem: "googleBooks",
        sourceId: "external_123",
      },
    });
  });

  it("maps EntitySummary title, subtitle, and cover image from SearchResultDTO", () => {
    expect(toEntitySummaryFromSearchResult(buildResult())).toMatchObject({
      title: "Canonical Book",
      subtitle: "Author One",
      image: { url: "https://example.test/cover.jpg" },
      ref: {
        entityType: "work",
        entityId: "book_1",
      },
      navigation: "openable",
    });
  });

  it("keeps author strings as display subtitle and does not create Author refs", () => {
    const summary = toEntitySummaryFromSearchResult(buildResult({
      authorEn: "Display Author",
      authors: ["Display Author"],
    }));

    expect(summary.subtitle).toBe("Display Author");
    expect(JSON.stringify(summary)).not.toContain("\"entityType\":\"author\"");
  });

  it("derives optional Edition refs without replacing the Work ref", () => {
    const result = buildResult({
      editionId: "edition_99",
      bookId: "work_1",
      workId: "work_1",
      workType: "edition",
      editionPresence: "edition",
    });

    const workRef = toLiteraryEntityRefFromSearchResult(result);
    const editionRef = toEditionEntityRefFromSearchResult(result);
    const summary = toEntitySummaryFromSearchResult(result);

    expect(workRef).toMatchObject({
      entityType: "work",
      entityId: "work_1",
    });
    expect(editionRef).toMatchObject({
      entityType: "edition",
      entityId: "edition_99",
    });
    expect(summary.ref).toMatchObject({
      entityType: "work",
      entityId: "work_1",
    });
    expect(summary.typeSpecific).toMatchObject({
      editionRef: {
        entityType: "edition",
        entityId: "edition_99",
      },
    });
  });

  it("does not mutate SearchResultDTO", () => {
    const result = buildResult();
    const before = structuredClone(result);

    toLiteraryEntityRefFromSearchResult(result);
    toEditionEntityRefFromSearchResult(result);
    toEntitySummaryFromSearchResult(result);

    expect(result).toEqual(before);
  });

  it("wraps Work search results as entity results without changing legacy results", () => {
    const result = buildResult();
    const entityResult = toWorkSearchEntityResult(result);

    expect(entityResult).toMatchObject({
      resultId: "book_1",
      entityType: "work",
      source: "book_search",
      route: {
        kind: "book_details",
        bookId: "book_1",
        editionId: "edition_1",
      },
      entityRef: {
        entityType: "work",
        entityId: "book_1",
      },
    });
    expect(entityResult.legacyWorkResult).toBe(result);
  });

  it("builds a migration envelope that preserves SearchResponseDTO results", () => {
    const response: SearchResponseDTO = {
      results: [buildResult({ id: "book_1", rank: 1 }), buildResult({ id: "book_2", bookId: "book_2", rank: 2 })],
      nextCursor: "cursor_2",
      hasMore: true,
      cursorUsed: false,
    };

    const envelope = toSearchResultEnvelope(response);

    expect(envelope).toMatchObject({
      contractVersion: 1,
      mode: "work_compatibility",
      primaryEntityType: "work",
      nextCursor: "cursor_2",
      hasMore: true,
      cursorUsed: false,
    });
    expect(envelope.results).toBe(response.results);
    expect(envelope.entityResults.map((item) => item.entityType)).toEqual(["work", "work"]);
    expect(envelope.entityResults.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("allows future Author results to coexist as entity results without Work DTO shape", () => {
    const entityResult = toAuthorSearchEntityResult({
      author,
      authorId: "author_octavia_butler",
      rank: 3,
      score: 0.7,
    });

    expect(entityResult).toMatchObject({
      resultId: "author:author_octavia_butler",
      entityType: "author",
      source: "author_entity_adapter",
      route: {
        kind: "author_details",
        authorId: "author_octavia_butler",
      },
      entityRef: {
        entityType: "author",
        entityId: "author_octavia_butler",
        authorityState: "canonical",
      },
      summary: {
        title: "Octavia Butler",
      },
      rank: 3,
      score: 0.7,
    });
    expect(entityResult.legacyWorkResult).toBeUndefined();
  });

  it("allows future Quote results to coexist as entity results without Work DTO shape", () => {
    const entityResult = toQuoteSearchEntityResult({
      quote,
      rank: 4,
      score: 0.65,
    });

    expect(entityResult).toMatchObject({
      resultId: "quote:quote_1",
      entityType: "quote",
      source: "quote_entity_adapter",
      route: {
        kind: "quote_details",
        quoteId: "quote_1",
      },
      entityRef: {
        entityType: "quote",
        entityId: "quote_1",
        authorityState: "canonical",
      },
      summary: {
        title: "There is nothing new under the sun, but there are new suns.",
      },
      rank: 4,
      score: 0.65,
    });
    expect(entityResult.legacyWorkResult).toBeUndefined();
  });

  it("keeps non-canonical Author and Quote entity results non-routable", () => {
    const authorResult = toAuthorSearchEntityResult({
      author: { ...author, lifecycleState: "merged", mergeTargetAuthorId: "author_survivor" },
      authorId: "author_old",
      lifecycle: {
        authorityState: "merged",
        entityAuthorityState: "merged",
        canonicalAuthorId: "author_old",
        mergeTargetAuthorId: "author_survivor",
        splitTargetAuthorIds: [],
        supersededByAuthorId: null,
        isPseudonym: false,
        reason: "merged_author_requires_survivor_resolution",
      },
    });
    const quoteResult = toQuoteSearchEntityResult({
      quote: { ...quote, disputed: true },
    });

    expect(authorResult.route).toEqual({
      kind: "none",
      reason: "non_canonical_author_not_routable",
    });
    expect(quoteResult.route).toEqual({
      kind: "none",
      reason: "non_canonical_quote_not_routable",
    });
  });
});
