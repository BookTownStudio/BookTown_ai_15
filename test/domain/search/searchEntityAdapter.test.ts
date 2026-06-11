import { describe, expect, it } from "vitest";
import {
  toEditionEntityRefFromSearchResult,
  toEntitySummaryFromSearchResult,
  toLiteraryEntityRefFromSearchResult,
} from "../../../lib/domain/search/searchEntityAdapter.ts";
import type { SearchResultDTO } from "../../../types/bookSearch.ts";

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
});

