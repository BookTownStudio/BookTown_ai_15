import { describe, expect, it } from "vitest";
import {
  buildBookSearchPatch,
  bookSearchPatchNeedsUpdate,
} from "../searchIndexing";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("searchIndexing", () => {
  it("prefers English alias authority for canonical retrieval while preserving alias tokens", () => {
    const patch = buildBookSearchPatch({
      title: "La Peste",
      titleEn: "The Plague",
      titleAr: "الطاعون",
      authors: ["Albert Camus"],
    }) as Record<string, any>;

    expect(patch.normalizedTitle).toBe(normalize("The Plague"));
    expect(patch.titleEnNormalized).toBe(normalize("The Plague"));
    expect(patch.searchableTitleAuthor).toBe(
      `${normalize("The Plague")} ${normalize("Albert Camus")}`
    );
    expect(patch.canonicalTitleAuthorities).toEqual([
      normalize("La Peste"),
      normalize("The Plague"),
      normalize("الطاعون"),
    ]);
    expect(patch.search.tokens).toEqual(
      expect.arrayContaining([
        "plague",
        "peste",
        normalize("الطاعون"),
        "albert",
        "camus",
      ])
    );
  });

  it("marks legacy single-title rows as needing alias search-field backfill", () => {
    const legacyRow = {
      title: "La Peste",
      titleEn: "The Plague",
      authors: ["Albert Camus"],
      normalizedTitle: normalize("La Peste"),
      titleEnNormalized: normalize("La Peste"),
      searchableTitleAuthor: `${normalize("La Peste")} ${normalize("Albert Camus")}`,
      authorNamesNormalized: [normalize("Albert Camus")],
      search: {
        tokens: [normalize("peste"), "albert", "camus"],
      },
      downloadable: false,
      hasEbook: false,
      isEbookAvailable: false,
    };

    const patch = buildBookSearchPatch(legacyRow);
    expect(bookSearchPatchNeedsUpdate(legacyRow, patch)).toBe(true);
  });
});
