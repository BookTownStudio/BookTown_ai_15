import { describe, expect, it } from "vitest";
import {
  AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT,
  buildAuthorBibliographyModel,
  flattenAuthorBibliographyPreview,
} from "../../../lib/authors/authorBibliographyAdapter.ts";
import type { Book } from "../../../types/entities.ts";

function book(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    authorId: "author_1",
    titleEn: `Title ${id}`,
    titleAr: "",
    authorEn: "Author One",
    authorAr: "",
    coverUrl: "",
    descriptionEn: "",
    descriptionAr: "",
    ontology: {
      schemaVersion: 1,
      form: "unknown",
      subForm: null,
      source: "seed",
      confidence: "unknown",
      updatedAt: "",
    },
    genresEn: [],
    genresAr: [],
    rating: 5,
    ratingsCount: 100,
    isEbookAvailable: false,
    ...overrides,
  };
}

describe("authorBibliographyAdapter", () => {
  it("builds canonical bibliography metadata", () => {
    const model = buildAuthorBibliographyModel({
      canonicalWorks: [book("work_1")],
    });

    expect(model).toMatchObject({
      authoritySource: "canonical_author_id",
      totalCanonicalCount: 1,
      totalRepairCount: 0,
      hasMore: false,
    });
    expect(model.canonicalWorks.map((item) => item.id)).toEqual(["work_1"]);
    expect(model.repairWorks).toEqual([]);
  });

  it("separates repair bibliography from canonical bibliography", () => {
    const model = buildAuthorBibliographyModel({
      repairWorks: [book("repair_1")],
    });

    expect(model.authoritySource).toBe("legacy_display_name_repair");
    expect(model.canonicalWorks).toEqual([]);
    expect(model.repairWorks.map((item) => item.id)).toEqual(["repair_1"]);
  });

  it("reports mixed bibliography state without merging duplicate repair works", () => {
    const model = buildAuthorBibliographyModel({
      canonicalWorks: [book("work_1"), book("work_2")],
      repairWorks: [book("work_2"), book("repair_1")],
    });

    expect(model.authoritySource).toBe("mixed");
    expect(model.totalCanonicalCount).toBe(2);
    expect(model.totalRepairCount).toBe(1);
    expect(model.repairWorks.map((item) => item.id)).toEqual(["repair_1"]);
  });

  it("orders deterministically by publication date, title, then id without popularity", () => {
    const model = buildAuthorBibliographyModel({
      canonicalWorks: [
        book("c", { titleEn: "Beta", publicationDate: "2000", rating: 1 }),
        book("b", { titleEn: "Alpha", publicationDate: "2000", rating: 5 }),
        book("a", { titleEn: "Later", publicationDate: "2010", rating: 5 }),
      ],
    });

    expect(model.canonicalWorks.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("provides bounded preview and view-all readiness metadata", () => {
    const canonicalWorks = Array.from({ length: AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT + 2 }, (_, index) =>
      book(`work_${String(index).padStart(2, "0")}`)
    );
    const model = buildAuthorBibliographyModel({ canonicalWorks });

    expect(model.canonicalWorks).toHaveLength(AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT);
    expect(model.totalCanonicalCount).toBe(AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT + 2);
    expect(model.hasMore).toBe(true);
    expect(flattenAuthorBibliographyPreview(model)).toHaveLength(
      AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT
    );
  });
});

