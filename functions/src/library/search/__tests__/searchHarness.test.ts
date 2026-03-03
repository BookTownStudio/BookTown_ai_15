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

  it("prioritizes author relevance for author query", async () => {
    const response = await unifiedSearch("rowling", {});
    const results = response.results;
    expect(results.length).toBeGreaterThan(0);

    const topThreeAuthors = results.slice(0, 3).map((entry: any) => entry.authorEn || entry.authors?.[0] || "");
    expect(topThreeAuthors.every((author) => normalize(author).includes("rowling"))).toBe(true);
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
    });

    const titles = results.map((entry: any) => normalize(entry.title || ""));
    expect(titles.some((title) => title.includes("print edition"))).toBe(false);
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

    const firstExternalIndex = lowCanonical.results.findIndex((entry: any) => entry.resultType === "external");
    const lastCanonicalIndex = Math.max(
      ...lowCanonical.results.map((entry: any, index: number) => (entry.resultType === "canonical" ? index : -1))
    );
    expect(firstExternalIndex).toBeGreaterThan(lastCanonicalIndex);
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
});
