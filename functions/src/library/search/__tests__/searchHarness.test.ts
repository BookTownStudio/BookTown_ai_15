import { describe, it, expect, vi } from "vitest";
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
    private readonly limitValue = 20
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    return new MockQuery(
      this.rows,
      [...this.whereClauses, { field, op, value }],
      this.limitValue
    );
  }

  limit(value: number): MockQuery {
    return new MockQuery(this.rows, this.whereClauses, value);
  }

  async get() {
    const filtered = this.rows
      .filter((row) => this.matchesWhereClauses(row))
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

  private matchesWhereClauses(row: Record<string, unknown>): boolean {
    for (const clause of this.whereClauses) {
      const value = row[clause.field];

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
        if (name !== "editions") {
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

describe("Search Harness — Canonical Local Engine", () => {
  it("prioritizes strong title relevance deterministically", async () => {
    const results = await unifiedSearch("harry potter", {});
    expect(results.length).toBeGreaterThan(0);

    const topTitle = String((results[0] as any).title || "");
    expect(normalize(topTitle).includes("harry potter")).toBe(true);
  });

  it("prioritizes author relevance for author query", async () => {
    const results = await unifiedSearch("rowling", {});
    expect(results.length).toBeGreaterThan(0);

    const topThreeAuthors = results.slice(0, 3).map((entry: any) => entry.authorEn || entry.authors?.[0] || "");
    expect(topThreeAuthors.every((author) => normalize(author).includes("rowling"))).toBe(true);
  });

  it("suppresses non-book legal and institutional documents", async () => {
    const results = await unifiedSearch("financial", {});
    const normalizedTitles = results.map((entry: any) => normalize(entry.title || ""));

    expect(normalizedTitles.some((title) => title.includes("financial strategy"))).toBe(true);
    expect(normalizedTitles.some((title) => title.includes("financial report"))).toBe(false);
  });

  it("ebookOnly returns only server-verified downloadable ebooks", async () => {
    const results = await unifiedSearch("ebook filter", { ebookOnly: true });
    expect(results.length).toBeGreaterThan(0);

    results.forEach((entry: any) => {
      expect(Boolean(entry.downloadable)).toBe(true);
      expect(Boolean(entry.hasEbook)).toBe(true);
      expect(Boolean(entry.isEbookAvailable)).toBe(true);
    });

    const titles = results.map((entry: any) => normalize(entry.title || ""));
    expect(titles.some((title) => title.includes("print edition"))).toBe(false);
  });
});
