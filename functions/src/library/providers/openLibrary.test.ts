import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOpenLibraryCanonicalMetadata,
  resolveOpenLibraryReadableCandidate,
} from "./openLibrary";

describe("resolveOpenLibraryReadableCandidate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("discovers a trusted readable source from canonical title and author when no provider ids are stored", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("openlibrary.org/search.json")) {
          return {
            ok: true,
            json: async () => ({
              docs: [
                {
                  key: "/works/OL66554W",
                  title: "Pride and Prejudice",
                  author_name: ["Jane Austen"],
                  has_fulltext: true,
                  lending_edition_s: "OL50444320M",
                  lending_identifier_s: "bwb_KS-179-237",
                },
              ],
            }),
          } as any;
        }

        if (url.includes("openlibrary.org/works/OL66554W/editions.json")) {
          return {
            ok: true,
            json: async () => ({
              entries: [
                {
                  key: "/books/OL50444320M",
                  title: "Pride and Prejudice",
                  ocaid: "pride-and-prejudice-ia",
                },
              ],
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({}),
        } as any;
      }) as any
    );

    const candidate = await resolveOpenLibraryReadableCandidate({
      bookId: "book_1",
      editionId: null,
      sourceHint: null,
      book: {
        titleEn: "Pride and Prejudice",
        authorEn: "Jane Austen",
        language: "en",
      },
    });

    expect(candidate).toBeDefined();
    expect(candidate?.provider).toBe("openLibrary");
    expect(candidate?.providerExternalId).toBe("OL66554W");
    expect(candidate?.persistedSource).toEqual({
      provider: "openLibrary",
      providerExternalId: "OL66554W",
      lendingEditionId: "OL50444320M",
      lendingIdentifier: "bwb_KS-179-237",
      trust: "trusted",
    });
    expect(candidate?.candidates[0]?.url).toContain("pride-and-prejudice-ia");
  });

  it("returns work metadata with a distinct primary edition identifier", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/works/OL66554W.json")) {
          return {
            ok: true,
            json: async () => ({
              title: "Pride and Prejudice",
              authors: [{ author: { key: "/authors/OL1394247A" } }],
              description: { value: "A classic novel." },
              covers: [12345],
              first_publish_date: "1813",
            }),
          } as any;
        }

        if (url.includes("/works/OL66554W/editions.json")) {
          return {
            ok: true,
            json: async () => ({
              entries: [
                {
                  key: "/books/OL50444320M",
                  title: "Pride and Prejudice",
                  isbn_13: ["9780141439518"],
                  languages: [{ key: "/languages/eng" }],
                },
              ],
            }),
          } as any;
        }

        if (url.endsWith("/authors/OL1394247A.json")) {
          return {
            ok: true,
            json: async () => ({
              name: "Jane Austen",
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({}),
        } as any;
      }) as any
    );

    const metadata = await fetchOpenLibraryCanonicalMetadata("OL66554W");

    expect(metadata).toMatchObject({
      externalId: "OL66554W",
      editionExternalId: "OL50444320M",
      openLibraryEditionId: "OL50444320M",
      rawProviderAuthors: ["Jane Austen"],
      isbn13: "9780141439518",
      language: "eng",
      workLevelSource: true,
    });
  });
});
