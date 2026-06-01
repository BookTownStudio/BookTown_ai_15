import { describe, expect, it } from "vitest";
import { apiContracts } from "./shared/apiContracts";

describe("searchBooks contract", () => {
  it("accepts server-owned search readability projections in responses", () => {
    const parsed = apiContracts.rest.searchBooks.responseSchema.safeParse({
      success: true,
      data: {
        results: [
          {
            id: "openLibrary:OL123W",
            editionId: "openLibrary:OL123W",
            bookId: "openLibrary:OL123W",
            workId: null,
            externalId: "OL123W",
            source: "openLibrary",
            resultType: "external",
            workType: "work",
            editionPresence: "single",
            ebookClass: "external_link",
            sourceClass: "external_provider",
            languageTruth: "unknown",
            title: "Pride and Prejudice",
            titleEn: "Pride and Prejudice",
            titleAr: "",
            authors: ["Jane Austen"],
            authorEn: "Jane Austen",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "en",
            available: true,
            acquired: false,
            readAccess: "trusted_external",
            readProvider: "openLibrary",
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 0.92,
            rank: 1,
            readerAuthority: {
              hasReadableAttachment: false,
              attachmentId: null,
            },
            readingProgressProjection: {
              exists: true,
              status_state: "reading",
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
        hasMore: false,
        cursorUsed: false,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects simultaneous ebookOnly and availabilityOnly", () => {
    const parsed = apiContracts.rest.searchBooks.requestSchema.safeParse({
      q: "pride",
      ebookOnly: true,
      availabilityOnly: true,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected searchBooks contract parse to fail");
    }

    expect(parsed.error.issues[0]?.message).toBe(
      "Search request cannot set both ebookOnly=true and availabilityOnly=true."
    );
  });
});
