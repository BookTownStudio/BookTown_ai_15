import { afterEach, describe, it, expect, vi } from "vitest";
import { LOCAL_EDITIONS } from "./fixtures";

type WhereClause = {
  field: string;
  op: string;
  value: unknown;
};

class MockQuery {
  constructor(
    private readonly rows: Record<string, unknown>[],
    private readonly whereClauses: WhereClause[] = [],
    private readonly limitValue = 20,
    private readonly orderByField: string | null = null,
    private readonly startAtValue: string | null = null,
    private readonly endAtValue: string | null = null
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    return new MockQuery(
      this.rows,
      [...this.whereClauses, { field, op, value }],
      this.limitValue,
      this.orderByField,
      this.startAtValue,
      this.endAtValue
    );
  }

  limit(value: number): MockQuery {
    return new MockQuery(
      this.rows,
      this.whereClauses,
      value,
      this.orderByField,
      this.startAtValue,
      this.endAtValue
    );
  }

  orderBy(field: string): MockQuery {
    return new MockQuery(
      this.rows,
      this.whereClauses,
      this.limitValue,
      field,
      this.startAtValue,
      this.endAtValue
    );
  }

  startAt(value: string): MockQuery {
    return new MockQuery(
      this.rows,
      this.whereClauses,
      this.limitValue,
      this.orderByField,
      value,
      this.endAtValue
    );
  }

  endAt(value: string): MockQuery {
    return new MockQuery(
      this.rows,
      this.whereClauses,
      this.limitValue,
      this.orderByField,
      this.startAtValue,
      value
    );
  }

  async get() {
    const filtered = this.rows
      .filter((row) => this.matchesWhereClauses(row))
      .filter((row) => this.matchesRange(row))
      .sort((a, b) => this.compareRows(a, b))
      .slice(0, this.limitValue)
      .map((row) => ({
        id: String(row.id),
        data: () => row,
      }));

    return {
      forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
        filtered.forEach(cb);
      },
      docs: filtered,
      empty: filtered.length === 0,
    };
  }

  private getFieldValue(row: Record<string, unknown>, field: string): unknown {
    return field
      .split(".")
      .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), row);
  }

  private matchesRange(row: Record<string, unknown>): boolean {
    if (!this.orderByField) return true;
    if (!this.startAtValue && !this.endAtValue) return true;
    const fieldValue = this.getFieldValue(row, this.orderByField);
    if (typeof fieldValue !== "string") return false;
    if (this.startAtValue && fieldValue < this.startAtValue) return false;
    if (this.endAtValue && fieldValue > this.endAtValue) return false;
    return true;
  }

  private compareRows(a: Record<string, unknown>, b: Record<string, unknown>): number {
    if (!this.orderByField) {
      return 0;
    }
    const aValue = this.getFieldValue(a, this.orderByField);
    const bValue = this.getFieldValue(b, this.orderByField);
    if (typeof aValue !== "string" || typeof bValue !== "string") {
      return 0;
    }
    return aValue.localeCompare(bValue);
  }

  private matchesWhereClauses(row: Record<string, unknown>): boolean {
    for (const clause of this.whereClauses) {
      const value = this.getFieldValue(row, clause.field);

      if (clause.op === "==") {
        if (value !== clause.value) return false;
        continue;
      }

      if (clause.op === "array-contains-any") {
        if (!Array.isArray(value)) return false;
        const terms = Array.isArray(clause.value) ? clause.value : [];
        const matches = terms.some((term) => value.includes(term));
        if (!matches) return false;
        continue;
      }

      return false;
    }

    return true;
  }
}

vi.mock("firebase-admin/firestore", () => {
  return {
    getFirestore: () => ({
      collection: (name: string) => {
        if (name !== "books") {
          throw new Error(`Unexpected collection: ${name}`);
        }
        return new MockQuery(LOCAL_EDITIONS as unknown as Record<string, unknown>[]);
      },
    }),
  };
});

import { unifiedSearch } from "../searchEngine";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Search Harness — Canonical Local Engine", () => {
  it("canonical-first order: ISBN exact match ranks tier 0 and appears first", async () => {
    const response = await unifiedSearch("9780747532743", {});
    expect(response.results.length).toBeGreaterThan(0);

    const top = response.results[0] as any;
    expect(top.resultType).toBe("canonical");
    expect(top.rank).toBe(0);
    expect(response.externalCount).toBe(0);
  });

  it("prioritizes strong title relevance deterministically", async () => {
    const response = await unifiedSearch("harry potter", {});
    const results = response.results;
    expect(results.length).toBeGreaterThan(0);

    const topTitle = String((results[0] as any).title || "");
    expect(normalize(topTitle).includes("harry potter")).toBe(true);
  });

  it("rescues bounded title typos before external widening when local canonical candidates exist", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy as any);

    const response = await unifiedSearch("harry potr", {});

    expect(response.results.length).toBeGreaterThan(0);
    expect(normalize(response.results[0]?.title || "")).toContain("harry potter");
    expect(response.results[0]?.resultType).toBe("canonical");
    expect(response.results.slice(0, 4).map((entry: any) => entry.title)).not.toContain(
      "Harry Potter Critical Study"
    );
    expect(response.telemetry?.externalFallbackTriggered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prioritizes author relevance for author query", async () => {
    const response = await unifiedSearch("rowling", {});
    const results = response.results;
    expect(results.length).toBeGreaterThan(0);

    const topThreeAuthors = results.slice(0, 3).map((entry: any) => entry.authorEn || entry.authors?.[0] || "");
    expect(topThreeAuthors.every((author) => normalize(author).includes("rowling"))).toBe(true);
  });

  it("keeps Kafka and Camus author retrieval canonical-first", async () => {
    const kafka = await unifiedSearch("Kafka", {});
    const camus = await unifiedSearch("Camus", {});

    expect(kafka.results.length).toBeGreaterThan(0);
    expect(normalize(kafka.results[0]?.authorEn || "")).toContain("kafka");
    expect(kafka.results[0]?.resultType).toBe("canonical");

    expect(camus.results.length).toBeGreaterThan(0);
    expect(normalize(camus.results[0]?.authorEn || "")).toContain("camus");
    expect(camus.results[0]?.resultType).toBe("canonical");
  });

  it("keeps Kafka primary works above secondary books under author intent", async () => {
    const response = await unifiedSearch("Kafka", {});
    const titles = response.results.slice(0, 4).map((entry: any) => entry.title);

    expect(titles[0]).toBe("The Trial");
    expect(titles).toContain("The Metamorphosis");
    expect(titles).toContain("The Castle");
    expect(titles).not.toContain("Franz Kafka Writer 1913");
  });

  it("keeps Camus primary works above biography rows under author intent", async () => {
    const response = await unifiedSearch("Camus", {});
    const titles = response.results.slice(0, 4).map((entry: any) => entry.title);

    expect(titles.every((title) => title !== "Albert Camus A Biography")).toBe(true);
    expect(titles.some((title) => title === "The Stranger")).toBe(true);
    expect(titles).toContain("The Plague");
    expect(titles).toContain("The Fall");
    expect(titles).toContain("Caligula");
    expect(titles).not.toContain("Albert Camus A Biography");
  });

  it("rescues author typos by widening externally once and rerunning canonical lookup", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("googleapis")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "gb-dost-1",
                  volumeInfo: {
                    title: "Crime and Punishment",
                    authors: ["Fyodor Dostoevsky"],
                    printType: "BOOK",
                  },
                },
              ],
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                key: "/works/OLDOST1W",
                title: "The Brothers Karamazov",
                author_name: ["Fyodor Dostoevsky"],
                type: "book",
              },
            ],
          }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("dostoyesvky", {});

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]?.resultType).toBe("canonical");
    expect(normalize(response.results[0]?.authorEn || "")).toContain("dostoevsky");
    expect(response.telemetry?.externalFallbackTriggered).toBe(true);
  });

  it("keeps Dostoevsky primary works above collected or critical rows", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("googleapis")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "gb-dost-1",
                  volumeInfo: {
                    title: "Crime and Punishment",
                    authors: ["Fyodor Dostoevsky"],
                    printType: "BOOK",
                  },
                },
              ],
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                key: "/works/OLDOST1W",
                title: "The Brothers Karamazov",
                author_name: ["Fyodor Dostoevsky"],
                type: "book",
              },
            ],
          }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("dostoyesvky", {});
    const titles = response.results.slice(0, 4).map((entry: any) => entry.title);

    expect(titles[0]).toBe("Crime and Punishment");
    expect(titles).toContain("The Brothers Karamazov");
    expect(titles).toContain("Notes from Underground");
    expect(titles).not.toContain("The Complete Works of Dostoevsky 1913");
  });

  it("suppresses non-book legal and institutional documents", async () => {
    const response = await unifiedSearch("financial", {});
    const results = response.results;
    const normalizedTitles = results.map((entry: any) => normalize(entry.title || ""));

    expect(normalizedTitles.some((title) => title.includes("financial strategy"))).toBe(true);
    expect(normalizedTitles.some((title) => title.includes("financial report"))).toBe(false);
  });

  it("ebookOnly returns only server-verified downloadable ebooks", async () => {
    const response = await unifiedSearch("ebook filter", { ebookOnly: true });
    const results = response.results;
    expect(results.length).toBeGreaterThan(0);

    results.forEach((entry: any) => {
      expect(Boolean(entry.downloadable)).toBe(true);
      expect(Boolean(entry.hasEbook)).toBe(true);
      expect(Boolean(entry.isEbookAvailable)).toBe(true);
      expect(entry.ebookClass).toBe("in_app");
    });

    const titles = results.map((entry: any) => normalize(entry.title || ""));
    expect(titles.some((title) => title.includes("print edition"))).toBe(false);
  });

  it("ebookOnly blocks external fallback entirely when no in-app ebook exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy as any);

    const response = await unifiedSearch("rare fallback term", { ebookOnly: true });

    expect(response.results).toHaveLength(0);
    expect(response.canonicalCount).toBe(0);
    expect(response.externalCount).toBe(0);
    expect(response.telemetry?.externalFallbackTriggered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("availabilityOnly returns only canonical in-app and trusted external available rows", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("openlibrary.org/search.json")) {
          return {
            ok: true,
            json: async () => ({ docs: [] }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gutendex.com")) {
          return {
            ok: true,
            json: async () => ({ results: [] }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gallica.bnf.fr")) {
          return {
            ok: true,
            json: async () => ({}),
            text: async () => "",
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ entries: [] }),
          text: async () => "",
        } as any;
      }) as any
    );

    const response = await unifiedSearch("ebook filter", { availabilityOnly: true });
    const titles = response.results.map((entry: any) => normalize(entry.title || ""));

    expect(response.results.length).toBeGreaterThan(0);
    expect(titles).toContain("ebook filter primary novel");
    expect(titles).toContain("ebook filter digital edition");
    expect(titles).not.toContain("ebook filter print edition");
    response.results.forEach((entry: any) => {
      expect(entry.available).toBe(true);
    });
  });

  it("external fallback only when canonicalCount < threshold", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const fetchSpy = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("googleapis")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "gb-1",
                volumeInfo: {
                  title: "Rare Fallback Term Volume",
                  authors: ["Ext Author"],
                  printType: "BOOK",
                },
              },
            ],
          }),
        } as any;
      }

      return {
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL1W",
              title: "Rare Fallback Term Companion",
              author_name: ["Another Ext"],
              type: "book",
            },
          ],
        }),
      } as any;
    });

    vi.stubGlobal("fetch", fetchSpy as any);

    const highCanonical = await unifiedSearch("harry potter", {});
    expect(highCanonical.canonicalCount).toBeGreaterThanOrEqual(5);
    expect(highCanonical.externalCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const lowCanonical = await unifiedSearch("rare fallback term", {});
    expect(lowCanonical.canonicalCount).toBeLessThan(5);
    expect(lowCanonical.externalCount).toBeGreaterThan(0);
    expect(lowCanonical.results[0]?.workType).toBe("work");
    expect(lowCanonical.results[0]?.resultType).toBe("canonical");

    const firstExternalIndex = lowCanonical.results.findIndex((entry: any) => entry.resultType === "external");
    const lastCanonicalIndex = Math.max(
      ...lowCanonical.results.map((entry: any, index: number) => (entry.resultType === "canonical" ? index : -1))
    );
    expect(firstExternalIndex).toBeGreaterThan(lastCanonicalIndex);
  });

  it("returns grouped canonical metadata for multi-source canonical works", async () => {
    const response = await unifiedSearch("9780747532743", {});
    expect(response.results[0]?.editionPresence).toBe("grouped");
    expect(response.results[0]?.workType).toBe("work");
    expect(response.results[0]?.workId).toBe(response.results[0]?.bookId);
  });

  it("uses dedicated external isbn lookup before generic provider search when local isbn recall is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchSpy = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("googleapis") && url.includes("isbn%3A9780140449136")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "gb-isbn-1",
                volumeInfo: {
                  title: "Crime and Punishment",
                  authors: ["Fyodor Dostoevsky"],
                  printType: "BOOK",
                  industryIdentifiers: [
                    { type: "ISBN_13", identifier: "9780140449136" },
                  ],
                },
              },
            ],
          }),
        } as any;
      }
      if (url.includes("openlibrary.org/isbn/9780140449136.json")) {
        return {
          ok: true,
          json: async () => ({
            key: "/books/OL9780140449136M",
            title: "Crime and Punishment",
            by_statement: "Fyodor Dostoevsky",
            covers: [12345],
          }),
        } as any;
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy as any);

    const response = await unifiedSearch("9780140449136", {});

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]?.rank).toBe(0);
    expect(response.results[0]?.resultType).toBe("external");
    expect(fetchSpy).toHaveBeenCalled();
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        String(input).includes("googleapis") && String(input).includes("isbn%3A9780140449136")
      )
    ).toBe(true);
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        String(input).includes("openlibrary.org/isbn/9780140449136.json")
      )
    ).toBe(true);
  });

  it("keeps language behavior parity across canonical and external results", async () => {
    vi.stubEnv("NODE_ENV", "development");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("googleapis")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "gb-lang-1",
                  volumeInfo: {
                    title: "Rare Fallback Term External",
                    authors: ["Provider Author"],
                    printType: "BOOK",
                    language: "en",
                  },
                },
              ],
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({ docs: [] }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("rare fallback term", { language: "ar" });

    expect(response.canonicalCount).toBeGreaterThan(0);
    expect(response.externalCount).toBeGreaterThan(0);
    expect(response.results.some((entry: any) => entry.resultType === "canonical")).toBe(true);
    expect(response.results.some((entry: any) => entry.resultType === "external")).toBe(true);
    expect(
      response.results.every((entry: any) => entry.languageTruth === "mismatch")
    ).toBe(true);
  });

  it("non-book filtering: excluded types never appear in external results", async () => {
    vi.stubEnv("NODE_ENV", "development");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("googleapis")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "gb-valid",
                  volumeInfo: {
                    title: "Valid External Book",
                    authors: ["Valid Author"],
                    printType: "BOOK",
                  },
                },
                {
                  id: "gb-bad",
                  volumeInfo: {
                    title: "Advanced Research Paper on Networks",
                    authors: ["Research Lab"],
                    printType: "MAGAZINE",
                  },
                },
              ],
            }),
          } as any;
        }

        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                key: "/works/OL-BAD",
                title: "Annual Conference Proceedings",
                author_name: ["Institution"],
                type: "conference proceedings",
              },
            ],
          }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("valid external", {});
    const external = response.results.filter((entry: any) => entry.resultType === "external");
    const titles = external.map((entry: any) => normalize(entry.title || ""));

    expect(external.length).toBeGreaterThan(0);
    expect(
      titles.some(
        (title) =>
          title.includes("research paper") ||
          title.includes("conference proceedings")
      )
    ).toBe(false);
  });

  it("provider timeout does not hang request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();
    try {
      const hangingFetch = vi.fn((_: string | URL, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              (err as Error & { name: string }).name = "AbortError";
              reject(err);
            });
          }
        });
      });
      vi.stubGlobal("fetch", hangingFetch as any);

      const pending = unifiedSearch("rare fallback term", {});
      await vi.advanceTimersByTimeAsync(3100);
      const response = await pending;

      expect(response.externalCount).toBe(0);
      expect(hangingFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the clean canonical work above derivative Pride and Prejudice rows", async () => {
    const response = await unifiedSearch("Pride and Prejudice", {});
    const results = response.results;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBe("Pride and Prejudice");
    expect(results[0]?.authors?.[0]).toBe("Jane Austen");
    expect(results[0]?.rank).toBe(1);

    const derivativeRows = results.filter((entry: any) => {
      const normalizedTitle = normalize(entry.title || "");
      return normalizedTitle.includes("study guide") || normalizedTitle.includes("analysis");
    });

    expect(derivativeRows.length).toBe(2);
    derivativeRows.forEach((entry: any) => {
      expect(entry.rank).toBeGreaterThan(results[0]?.rank ?? 0);
      expect(normalize(entry.authors?.[0] || "")).toBe("unknown");
    });
  });

  it('returns the canonical Pride row for ebookOnly when legacy in-app storage exists', async () => {
    const pride = LOCAL_EDITIONS.find((entry) => entry.id === 'e16') as
      | (Record<string, unknown> & { storagePath?: string; isEbookAvailable?: boolean })
      | undefined;
    expect(pride).toBeDefined();

    const previousStoragePath = pride?.storagePath;
    const previousIsEbookAvailable = pride?.isEbookAvailable;

    if (pride) {
      pride.storagePath = 'books/e16/original/pride-and-prejudice.epub';
      pride.isEbookAvailable = true;
    }

    try {
      const response = await unifiedSearch('pride', { ebookOnly: true });

      expect(response.results).toHaveLength(1);
      expect(response.canonicalCount).toBe(1);
      expect(response.externalCount).toBe(0);
      expect(response.telemetry?.externalFallbackTriggered).toBe(false);
      expect(response.results[0]?.title).toBe('Pride and Prejudice');
      expect(response.results[0]?.ebookClass).toBe('in_app');
      expect(response.results[0]?.downloadable).toBe(true);
      expect(response.results[0]?.hasEbook).toBe(true);
      expect(response.results[0]?.isEbookAvailable).toBe(true);
    } finally {
      if (pride) {
        if (typeof previousStoragePath === 'string') {
          pride.storagePath = previousStoragePath;
        } else {
          delete pride.storagePath;
        }

        if (typeof previousIsEbookAvailable === 'boolean') {
          pride.isEbookAvailable = previousIsEbookAvailable;
        } else {
          delete pride.isEbookAvailable;
        }
      }
    }
  });

  it("availabilityOnly collapses duplicate external readability into the canonical row", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const pride = LOCAL_EDITIONS.find((entry) => entry.id === "e16");
    expect(pride).toBeDefined();
    const previousProviderIds = Array.isArray(pride?.providerExternalIds)
      ? [...(pride?.providerExternalIds || [])]
      : undefined;
    if (pride) {
      pride.providerExternalIds = ["openLibrary:OL66554W"];
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("openlibrary.org/works/OL66554W/editions.json")) {
          return {
            ok: true,
            json: async () => ({
              entries: [
                {
                  title: "Pride and Prejudice",
                  ocaid: "pride-and-prejudice-ia",
                },
              ],
            }),
            text: async () => "",
          } as any;
        }
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
                  language: ["en"],
                },
                {
                  key: "/works/OLMEMOIR1W",
                  title: "Pride: A Memoir",
                  author_name: ["Author Example"],
                  has_fulltext: true,
                  lending_identifier_s: "memoir-lending-id",
                  language: ["en"],
                },
              ],
            }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gutendex.com")) {
          return {
            ok: true,
            json: async () => ({ results: [] }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gallica.bnf.fr")) {
          return {
            ok: true,
            json: async () => ({}),
            text: async () => "",
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ entries: [] }),
          text: async () => "",
        } as any;
      }) as any
    );

    try {
      const response = await unifiedSearch("pride", { availabilityOnly: true });
      const canonicalPride = response.results.find(
        (entry: any) =>
          entry.resultType === "canonical" &&
          normalize(entry.title || "") === "pride and prejudice"
      );
      const duplicateExternal = response.results.find(
        (entry: any) => entry.resultType === "external" && entry.externalId === "OL66554W"
      );

      expect(canonicalPride).toBeDefined();
      expect(canonicalPride?.available).toBe(true);
      expect(canonicalPride?.acquired).toBe(false);
      expect(canonicalPride?.readAccess).toBe("trusted_external");
      expect(canonicalPride?.readProvider).toBe("openLibrary");
      expect(canonicalPride?.externalReadableSources).toEqual([
        {
          provider: "openLibrary",
          providerExternalId: "OL66554W",
          lendingEditionId: "OL50444320M",
          trust: "trusted",
        },
      ]);
      expect(duplicateExternal).toBeUndefined();
    } finally {
      if (pride) {
        if (previousProviderIds) {
          pride.providerExternalIds = previousProviderIds;
        } else {
          delete pride.providerExternalIds;
        }
      }
    }
  });

  it("availabilityOnly keeps live-shape OpenLibrary readable rows even when ebook_count_i is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
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
                  key: "/works/OL1095427W",
                  title: "Jane Eyre",
                  author_name: ["Charlotte Bronte"],
                  has_fulltext: true,
                  lending_edition_s: "OL35354586M",
                  public_scan_b: true,
                  language: ["en"],
                },
              ],
            }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gutendex.com")) {
          return {
            ok: true,
            json: async () => ({ results: [] }),
            text: async () => "",
          } as any;
        }
        if (url.includes("gallica.bnf.fr")) {
          return {
            ok: true,
            json: async () => ({}),
            text: async () => "",
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ entries: [] }),
          text: async () => "",
        } as any;
      }) as any
    );

    const response = await unifiedSearch("Jane Eyre", { availabilityOnly: true });
    const jane = response.results.find((entry: any) => entry.externalId === "OL1095427W");

    expect(jane).toBeDefined();
    expect(jane?.available).toBe(true);
    expect(jane?.acquired).toBe(false);
    expect(jane?.readAccess).toBe("trusted_external");
    expect(jane?.readProvider).toBe("openLibrary");
    expect(jane?.externalReadableSources).toEqual([
      {
        provider: "openLibrary",
        providerExternalId: "OL1095427W",
        lendingEditionId: "OL35354586M",
        trust: "trusted",
      },
    ]);
  });

  it("penalizes unknown-author Frankenstein rows below the canonical author", async () => {
    const response = await unifiedSearch("Frankenstein", {});
    const results = response.results;

    expect(results.length).toBeGreaterThan(1);
    expect(results[0]?.title).toBe("Frankenstein");
    expect(results[0]?.authors?.[0]).toBe("Mary Shelley");

    const unknownIndex = results.findIndex(
      (entry: any) =>
        normalize(entry.title || "") === "frankenstein" &&
        normalize(entry.authors?.[0] || "") === "unknown"
    );
    expect(unknownIndex).toBeGreaterThan(0);
  });

  it("gives Arabic title scoring parity for رجال في الشمس", async () => {
    const response = await unifiedSearch("رجال في الشمس", {});
    const results = response.results;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.titleAr).toBe("رجال في الشمس");
    expect(results[0]?.authors?.[0]).toBe("Ghassan Kanafani");
    expect(results[0]?.resultType).toBe("canonical");
  });

  it("recalls الأيام as the top canonical Arabic exact-title match", async () => {
    const response = await unifiedSearch("الأيام", {});
    const results = response.results;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.titleAr).toBe("الأيام");
    expect(results[0]?.authors?.[0]).toBe("Taha Hussein");
    expect(results[0]?.resultType).toBe("canonical");
  });
});
