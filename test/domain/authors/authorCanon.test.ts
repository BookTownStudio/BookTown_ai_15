import { describe, expect, it } from "vitest";
import { buildAuthorCanonModel, formatPublicationLabel } from "../../../lib/authors/authorCanon.ts";
import type { Book } from "../../../types/entities.ts";

function book(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    authorId: "author_1",
    titleEn: id,
    titleAr: id,
    authorEn: "Author",
    authorAr: "Author",
    coverUrl: "",
    descriptionEn: "",
    descriptionAr: "",
    ontology: {
      schemaVersion: 1,
      form: "unknown",
      subForm: null,
      source: "seed",
      confidence: "verified",
      updatedAt: "",
    },
    genresEn: [],
    genresAr: [],
    rating: 0,
    ratingsCount: 0,
    isEbookAvailable: false,
    ...overrides,
  };
}

describe("authorCanon", () => {
  it("builds deterministic canon sections from canonical works only", () => {
    const canon = buildAuthorCanonModel([
      book("late", { publicationDate: "2000", rating: 4, ratingsCount: 10 }),
      book("major", { publicationDate: "1980", rating: 5, ratingsCount: 20 }),
      book("early", { publicationDate: "1950", rating: 3, ratingsCount: 1 }),
      book("major"),
    ]);

    expect(canon.startHere.map((item) => item.id)).toEqual(["major"]);
    expect(canon.majorWorks.map((item) => item.id)).toEqual(["late", "early"]);
    expect(canon.completeBibliography.map((item) => item.id)).toEqual(["late", "major", "early"]);
    expect(canon.publicationChronology.map((item) => item.id)).toEqual(["early", "major", "late"]);
  });

  it("formats chronology labels without fabricating dates", () => {
    expect(formatPublicationLabel(book("dated", { publicationDate: "1915-01-01" }))).toBe("1915");
    expect(formatPublicationLabel(book("unknown"))).toBe("Date unknown");
  });
});
