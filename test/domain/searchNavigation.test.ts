import { describe, expect, it } from "vitest";
import { buildBookDetailsParams } from "../../lib/books/searchNavigation.ts";
import type { SearchResultDTO } from "../../types/bookSearch.ts";
import type { View } from "../../types/navigation.ts";

function buildResult(overrides?: Partial<SearchResultDTO>): SearchResultDTO {
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
    description: "",
    descriptionEn: "",
    descriptionAr: "",
    coverUrl: "",
    language: "en",
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    confidence: 0.9,
    rank: 1,
    ...overrides,
  };
}

describe("buildBookDetailsParams", () => {
  const fromView: View = { type: "tab", id: "home" };

  it("navigates canonical work rows directly to their book id", () => {
    const params = buildBookDetailsParams(buildResult(), fromView);

    expect(params).toMatchObject({
      bookId: "book_1",
      from: fromView,
    });
    expect(params).not.toHaveProperty("searchResult");
  });

  it("opens canonical edition rows by their existing Firestore book id", () => {
    const editionResult = buildResult({
      id: "edition_99",
      bookId: "edition_99",
      workId: "work_42",
      workType: "edition",
      editionPresence: "edition",
    });

    const params = buildBookDetailsParams(editionResult, fromView);

    expect(params).toMatchObject({
      bookId: "edition_99",
      from: fromView,
    });
    expect(params).not.toHaveProperty("searchResult");
  });

  it("preserves external rows for hydrate-first navigation", () => {
    const externalResult = buildResult({
      id: "gb_external_123",
      bookId: "gb_external_123",
      editionId: "gb_external_123",
      externalId: "external_123",
      source: "googleBooks",
      resultType: "external",
      workType: "edition",
      sourceClass: "external_provider",
    });

    const params = buildBookDetailsParams(externalResult, fromView);

    expect(params).toMatchObject({
      bookId: "gb_external_123",
      from: fromView,
      searchResult: externalResult,
    });
  });
});
