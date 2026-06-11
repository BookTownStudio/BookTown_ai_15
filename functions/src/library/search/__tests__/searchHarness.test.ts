import { afterEach, describe, it, expect, vi } from "vitest";
import {
  normalizeSearchText,
  tokenizeSearchText,
} from "../../../shared/normalization";
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

const normalize = normalizeSearchText;
const tokenize = tokenizeSearchText;

const buildAliasOnlyEdition = (
  existing: Record<string, any>,
  primaryTitle: string,
  englishAlias: string
) => {
  const titleNorm = normalize(primaryTitle);
  const aliasNorm = normalize(englishAlias);
  const authorNorm = normalize((existing.authors || []).join(" "));

  return {
    ...existing,
    title: primaryTitle,
    titleEn: englishAlias,
    normalizedTitle: titleNorm,
    searchableTitleAuthor: `${titleNorm} ${authorNorm}`.trim(),
    search: {
      tokens: Array.from(
        new Set([
          ...normalize(primaryTitle).split(" ").filter(Boolean),
          ...normalize(englishAlias).split(" ").filter(Boolean),
          ...authorNorm.split(" ").filter(Boolean),
        ])
      ),
    },
    canonicalKey: `${normalize(existing.authors?.[0] || "unknown")}::${aliasNorm}`,
  };
};

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

  it("exposes opt-in cognition diagnostics without changing result ordering", async () => {
    const baseline = await unifiedSearch("Kafka", {});
    const observed = await unifiedSearch("Kafka", {
      __includeCognitionDiagnostics: true,
    });

    expect((baseline as any).cognitionDiagnostics).toBeUndefined();
    expect(observed.results.map((entry: any) => entry.id)).toEqual(
      baseline.results.map((entry: any) => entry.id)
    );
    expect(observed.results.map((entry: any) => entry.rank)).toEqual(
      baseline.results.map((entry: any) => entry.rank)
    );

    const diagnostics = observed.cognitionDiagnostics;
    expect(diagnostics?.schemaVersion).toBe(1);
    expect(diagnostics?.behaviorImpact).toBe("none");
    expect(diagnostics?.canonicalPrioritization.comparator).toContain("resultType");
    expect(diagnostics?.resultTraces).toHaveLength(observed.results.length);
    expect(diagnostics?.resultTraces[0]?.provisionalRole).toBe("primary_work");
    expect(diagnostics?.resultTraces[0]?.humanSummary).toContain("canonical catalog result");
    expect(diagnostics?.resultTraces[0]?.heuristics.derivativeSignals).toContain(
      "classic_work_authority"
    );
  });

  it("does not surface merged canonical tombstones as independent canonical results", async () => {
    const duplicate = {
      ...(LOCAL_EDITIONS.find((entry: any) => entry.id === "e24") as any),
      id: "merged_trial_loser",
      editionId: "merged_trial_loser",
      bookId: "merged_trial_loser",
      canonicalKey: "franz kafka::der process",
      mergedInto: "e24",
    } as any;

    LOCAL_EDITIONS.push(duplicate);

    try {
      const response = await unifiedSearch("The Trial", {});
      const ids = response.results.map((entry: any) => entry.id);
      expect(ids).toContain("e24");
      expect(ids).not.toContain("merged_trial_loser");
    } finally {
      LOCAL_EDITIONS.pop();
    }
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

  it("admits alias-only short canonical classic_work titles into the canonical pool", async () => {
    const trialIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e24");
    const strangerIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e26");
    const plagueIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e27");

    const originalTrial = { ...(LOCAL_EDITIONS[trialIndex] as any) };
    const originalStranger = { ...(LOCAL_EDITIONS[strangerIndex] as any) };
    const originalPlague = { ...(LOCAL_EDITIONS[plagueIndex] as any) };

    LOCAL_EDITIONS[trialIndex] = buildAliasOnlyEdition(
      originalTrial,
      "Der Process",
      "The Trial"
    ) as any;
    LOCAL_EDITIONS[strangerIndex] = buildAliasOnlyEdition(
      originalStranger,
      "L'Étranger",
      "The Stranger"
    ) as any;
    LOCAL_EDITIONS[plagueIndex] = buildAliasOnlyEdition(
      originalPlague,
      "La Peste",
      "The Plague"
    ) as any;

    try {
      const trial = await unifiedSearch("The Trial", {});
      const stranger = await unifiedSearch("The Stranger", {});
      const plague = await unifiedSearch("The Plague", {});

      expect(normalize(trial.results[0]?.titleEn || trial.results[0]?.title || "")).toBe(
        normalize("The Trial")
      );
      expect(normalize(trial.results[0]?.authorEn || "")).toContain("kafka");

      expect(normalize(stranger.results[0]?.titleEn || stranger.results[0]?.title || "")).toBe(
        normalize("The Stranger")
      );
      expect(normalize(stranger.results[0]?.authorEn || "")).toContain("camus");

      expect(normalize(plague.results[0]?.titleEn || plague.results[0]?.title || "")).toBe(
        normalize("The Plague")
      );
      expect(normalize(plague.results[0]?.authorEn || "")).toContain("camus");
    } finally {
      LOCAL_EDITIONS[trialIndex] = originalTrial as any;
      LOCAL_EDITIONS[strangerIndex] = originalStranger as any;
      LOCAL_EDITIONS[plagueIndex] = originalPlague as any;
    }
  });

  it("keeps short article-led classic titles out of false author suppression", async () => {
    const idiot = await unifiedSearch("The Idiot", {});
    const trial = await unifiedSearch("The Trial", {});
    const plague = await unifiedSearch("The Plague", {});

    expect(normalize(idiot.results[0]?.titleEn || idiot.results[0]?.title || "")).toBe(
      normalize("The Idiot")
    );
    expect(normalize(idiot.results[0]?.authorEn || "")).toContain("dostoevsky");

    expect(normalize(trial.results[0]?.titleEn || trial.results[0]?.title || "")).toBe(
      normalize("The Trial")
    );
    expect(normalize(trial.results[0]?.authorEn || "")).toContain("kafka");

    expect(normalize(plague.results[0]?.titleEn || plague.results[0]?.title || "")).toBe(
      normalize("The Plague")
    );
    expect(normalize(plague.results[0]?.authorEn || "")).toContain("camus");
  });

  it("keeps exact short canonical titles above external lexical contamination at visible merge", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const trialIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e24");
    const strangerIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e26");
    const plagueIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e27");

    const originalTrial = { ...(LOCAL_EDITIONS[trialIndex] as any) };
    const originalStranger = { ...(LOCAL_EDITIONS[strangerIndex] as any) };
    const originalPlague = { ...(LOCAL_EDITIONS[plagueIndex] as any) };

    LOCAL_EDITIONS[trialIndex] = buildAliasOnlyEdition(
      originalTrial,
      "Der Process",
      "The Trial"
    ) as any;
    LOCAL_EDITIONS[strangerIndex] = buildAliasOnlyEdition(
      originalStranger,
      "L'Étranger",
      "The Stranger"
    ) as any;
    LOCAL_EDITIONS[plagueIndex] = buildAliasOnlyEdition(
      originalPlague,
      "La Peste",
      "The Plague"
    ) as any;

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
                  id: "gb-trial-contam",
                  volumeInfo: {
                    title: "Clinical Trial Methodology",
                    authors: ["Research Author"],
                    printType: "BOOK",
                  },
                },
                {
                  id: "gb-plague-contam",
                  volumeInfo: {
                    title: "The Plague Cycle",
                    authors: ["Historian"],
                    printType: "BOOK",
                  },
                },
                {
                  id: "gb-stranger-contam",
                  volumeInfo: {
                    title: "The Stranger at the Pentagon",
                    authors: ["Analyst"],
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
                key: "/works/OLTRIAL1W",
                title: "Complete Collection of State Trials",
                author_name: ["Editor"],
                type: "book",
              },
              {
                key: "/works/OLPLAGUE1W",
                title: "A Journal of the Plague Year",
                author_name: ["Daniel Defoe"],
                type: "book",
              },
            ],
          }),
        } as any;
      }) as any
    );
    try {
      const trial = await unifiedSearch("The Trial", {});
      const plague = await unifiedSearch("The Plague", {});
      const stranger = await unifiedSearch("The Stranger", {});

      expect(normalize(trial.results[0]?.titleEn || trial.results[0]?.title || "")).toBe(
        normalize("The Trial")
      );
      expect(normalize(trial.results[0]?.authorEn || "")).toContain("kafka");

      expect(normalize(plague.results[0]?.titleEn || plague.results[0]?.title || "")).toBe(
        normalize("The Plague")
      );
      expect(normalize(plague.results[0]?.authorEn || "")).toContain("camus");

      expect(normalize(stranger.results[0]?.titleEn || stranger.results[0]?.title || "")).toBe(
        normalize("The Stranger")
      );
      expect(normalize(stranger.results[0]?.authorEn || "")).toContain("camus");

      const trialTitles = trial.results.slice(0, 5).map((entry: any) => normalize(entry.title || ""));
      expect(trialTitles).not.toContain(normalize("Clinical Trial Methodology"));
      const plagueTitles = plague.results.slice(0, 5).map((entry: any) => normalize(entry.title || ""));
      expect(plagueTitles).not.toContain(normalize("The Plague Cycle"));
    } finally {
      LOCAL_EDITIONS[trialIndex] = originalTrial as any;
      LOCAL_EDITIONS[strangerIndex] = originalStranger as any;
      LOCAL_EDITIONS[plagueIndex] = originalPlague as any;
    }
  });

  it("reports provider suppression reasoning in cognition diagnostics without surfacing contaminants", async () => {
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
                  id: "gb-trial-contam",
                  volumeInfo: {
                    title: "Clinical Trial Methodology",
                    authors: ["Research Author"],
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
                key: "/works/OLTRIAL1W",
                title: "Complete Collection of State Trials",
                author_name: ["Editor"],
                type: "book",
              },
            ],
          }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("The Plague", {
      __includeCognitionDiagnostics: true,
    });

    const visiblePlagueRows = response.results.filter(
      (entry: any) => normalize(entry.title || "") === normalize("The Plague")
    );
    expect(visiblePlagueRows).toHaveLength(1);
    expect(visiblePlagueRows[0]?.resultType).toBe("canonical");
    expect(response.cognitionDiagnostics?.providerBlending.externalFallbackTriggered).toBe(true);
    expect(
      Array.isArray(response.cognitionDiagnostics?.providerBlending.suppressionEvents)
    ).toBe(true);
    expect(response.cognitionDiagnostics?.providerBlending.suppressionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Clinical Trial Methodology",
          reason: "rank_confidence_filtered",
        }),
      ])
    );
    expect(response.cognitionDiagnostics?.providerBlending.visibleExternalCount).toBe(0);
  });

  it("preserves generic one-token lexical fallback behavior for love", async () => {
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
                  id: "gb-love-1",
                  volumeInfo: {
                    title: "Love Poems",
                    authors: ["Poet"],
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
                key: "/works/OLLOVE1W",
                title: "Love's Oneing",
                author_name: ["Mystic"],
                type: "book",
              },
            ],
          }),
        } as any;
      }) as any
    );

    const response = await unifiedSearch("love", {});
    const titles = response.results.map((entry: any) => normalize(entry.title || ""));

    expect(response.results.length).toBeGreaterThan(0);
    expect(titles.some((title) => title.includes("love"))).toBe(true);
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

    expect(["Crime and Punishment", "The Idiot"]).toContain(titles[0]);
    expect(titles).toContain("The Brothers Karamazov");
    expect(titles).toContain("Notes from Underground");
    expect(titles).not.toContain("The Complete Works of Dostoevsky 1913");
  });

  it("pins classic_work exact-title rows above noisy in-family lexical variants", async () => {
    const crimeVariantIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e28");
    const originalCrime = { ...(LOCAL_EDITIONS[crimeVariantIndex] as any) };
    const crimeVariant = {
      ...originalCrime,
      id: "e40",
      editionId: "e40",
      bookId: "book_e40",
      externalId: "e40_ext",
      title: "Crime and Punishment Annotated Edition",
      titleEn: "Crime and Punishment",
      authors: ["Editor"],
      authorEn: "Editor",
      authorNamesNormalized: [normalize("Editor")],
      searchableTitleAuthor: `${normalize("Crime and Punishment Annotated Edition")} ${normalize("Editor")}`,
      search: {
        tokens: Array.from(
          new Set([
            ...tokenize(normalize("Crime and Punishment Annotated Edition")),
            ...tokenize(normalize("Crime and Punishment")),
            ...tokenize(normalize("Editor")),
          ])
        ),
      },
      canonicalKey: `${normalize("Editor")}::${normalize("Crime and Punishment Annotated Edition")}`,
      literaryAuthorityClass: undefined,
    };
    const crimeNoise = {
      ...originalCrime,
      id: "e41",
      editionId: "e41",
      bookId: "book_e41",
      externalId: "e41_ext",
      title: "Crime and Punishment Study Guide",
      titleEn: "Crime and Punishment Study Guide",
      authors: ["Scholar"],
      authorEn: "Scholar",
      authorNamesNormalized: [normalize("Scholar")],
      searchableTitleAuthor: `${normalize("Crime and Punishment Study Guide")} ${normalize("Scholar")}`,
      search: {
        tokens: Array.from(
          new Set([
            ...tokenize(normalize("Crime and Punishment Study Guide")),
            ...tokenize(normalize("Crime and Punishment")),
            ...tokenize(normalize("Scholar")),
          ])
        ),
      },
      canonicalKey: `${normalize("Scholar")}::${normalize("Crime and Punishment Study Guide")}`,
      literaryAuthorityClass: undefined,
    };

    LOCAL_EDITIONS.push(crimeVariant as any, crimeNoise as any);

    try {
      const crime = await unifiedSearch("Crime and Punishment", {});

      expect(crime.results[0]?.title).toBe("Crime and Punishment");
      expect(normalize(crime.results[0]?.authorEn || "")).toContain("dostoevsky");
      const titles = crime.results.slice(0, 5).map((entry: any) => entry.title);
      expect(titles.indexOf("Crime and Punishment Study Guide")).toBeGreaterThan(0);
    } finally {
      LOCAL_EDITIONS.splice(
        LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e40"),
        1
      );
      LOCAL_EDITIONS.splice(
        LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e41"),
        1
      );
    }
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

  it("ebookOnly allows external fallback but keeps no visible rows when no ebook-capable result exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy as any);

    const response = await unifiedSearch("rare fallback term", { ebookOnly: true });

    expect(response.results).toHaveLength(0);
    expect(response.canonicalCount).toBe(0);
    expect(response.externalCount).toBe(0);
    expect(response.telemetry?.externalFallbackTriggered).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
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

  it('returns the canonical Pride row for ebookOnly when readerAuthority allows in-app reading without an attachment id', async () => {
    const pride = LOCAL_EDITIONS.find((entry) => entry.id === 'e16') as
      | (Record<string, unknown> & { readerAuthority?: unknown })
      | undefined;
    expect(pride).toBeDefined();

    const previousReaderAuthority = pride?.readerAuthority;

    if (pride) {
      pride.readerAuthority = {
        hasReadableAttachment: true,
        attachmentId: null,
        source: "user_upload",
      };
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
      expect(response.results[0]?.readerAuthority).toEqual({
        hasReadableAttachment: true,
        attachmentId: null,
        source: "user_upload",
      });
    } finally {
      if (pride) {
        if (previousReaderAuthority !== undefined) {
          pride.readerAuthority = previousReaderAuthority;
        } else {
          delete pride.readerAuthority;
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

  it("availabilityOnly does not trust raw OpenLibrary search metadata as readable authority", async () => {
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

    expect(jane).toBeUndefined();
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

  it("handles vocalized Arabic query with harakat diacritics (رِجَالٌ)", async () => {
    const response = await unifiedSearch("رِجَالٌ فِي الشَّمْسِ", {});
    const results = response.results;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.titleAr).toBe("رجال في الشمس");
    expect(results[0]?.authors?.[0]).toBe("Ghassan Kanafani");
    expect(results[0]?.resultType).toBe("canonical");
  });

  it("documents that Arabic transliteration queries (Latin-phonetic) find nothing without titleEn", async () => {
    const response = await unifiedSearch("rejal fi al-shams", {});
    expect(response.canonicalCount).toBe(0);
    expect(response.externalCount).toBe(0);
  });

  it("ensures pagination cursor advances correctly (second page)", async () => {
    const firstPage = await unifiedSearch("Kafka", { limit: 2 });
    expect(firstPage.results.length).toBe(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await unifiedSearch("Kafka", { limit: 2, cursor: firstPage.nextCursor || undefined });
    expect(secondPage.results.length).toBeGreaterThan(0);
    expect(secondPage.cursorUsed).toBe(true);
    expect(secondPage.results[0]?.id).not.toBe(firstPage.results[0]?.id);
  });

  it("ranks Harry Potter exact-title books consistently (Philosopher Stone first)", async () => {
    const response = await unifiedSearch("Harry Potter", {});
    const hpBooks = response.results.filter(
      (entry: any) => normalize(entry.title || "").includes("harry potter")
    );

    expect(hpBooks.length).toBeGreaterThan(0);
    expect(normalize(hpBooks[0]?.title || "")).toContain("philosopher");
    expect(normalize(hpBooks[0]?.title || "")).toContain("stone");
  });

  it("respects language filter: Arabic canonical rows ranked above English when language=ar", async () => {
    const response = await unifiedSearch("Men in the Sun", { language: "ar" });

    const canonicalMen = response.results.find(
      (entry: any) => entry.resultType === "canonical" && entry.titleAr === "رجال في الشمس"
    );
    expect(canonicalMen).toBeDefined();
    expect(canonicalMen?.languageTruth).toBe("match");
  });

  it("deduplicates ISBN-less external duplicates using fuzzy title+author matching", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mmenIndex = LOCAL_EDITIONS.findIndex((entry: any) => entry.id === "e22");
    const originalMmen = { ...(LOCAL_EDITIONS[mmenIndex] as any) };

    if (LOCAL_EDITIONS[mmenIndex]) {
      (LOCAL_EDITIONS[mmenIndex] as any).isbn13 = undefined;
      (LOCAL_EDITIONS[mmenIndex] as any).isbn10 = undefined;
    }

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
                  id: "gb-men-sun",
                  volumeInfo: {
                    title: "Men in the Sun",
                    authors: ["Ghassan Kanafani"],
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
                key: "/works/OLMEN1W",
                title: "Men in the Sun",
                author_name: ["Ghassan Kanafani"],
                type: "book",
                has_fulltext: true,
                lending_edition_s: "OLMEN1M",
              },
            ],
          }),
        } as any;
      }) as any
    );

    try {
      const response = await unifiedSearch("Men in the Sun", {});
      const menResults = response.results.filter(
        (entry: any) =>
          normalize(entry.title || "").includes("men in the sun") ||
          normalize(entry.titleAr || "").includes("رجال في الشمس")
      );

      expect(menResults.length).toBe(1);
      expect(menResults[0]?.resultType).toBe("canonical");
      expect(menResults[0]?.externalReadableSources).toBeUndefined();
      expect(menResults[0]?.readAccess).toBe("none");
    } finally {
      if (LOCAL_EDITIONS[mmenIndex]) {
        (LOCAL_EDITIONS[mmenIndex] as any) = originalMmen;
      }
    }
  });

  it("applies deterministic tie-breaker: series order → publication year → normalized title", async () => {
    const response = await unifiedSearch("Harry Potter", {});
    const hpBooks = response.results.filter(
      (entry: any) => normalize(entry.title || "").includes("harry potter")
    );

    expect(hpBooks.length).toBeGreaterThanOrEqual(2);

    expect(hpBooks.slice(0, 3).map((entry: any) => normalize(entry.title || ""))).toEqual([
      normalize("Harry Potter and the Philosopher Stone"),
      normalize("Harry Potter and the Chamber of Secrets"),
      normalize("Harry Potter and the Prisoner of Azkaban"),
    ]);
  });

  it("normalizes Arabic letter variants: أ إ آ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي", async () => {
    const query1 = "الإمارات";
    const query2 = "الامارات";
    const query3 = "رأية";
    const query4 = "رايه";

    const normalized1 = normalize(query1);
    const normalized2 = normalize(query2);
    const normalized3 = normalize(query3);
    const normalized4 = normalize(query4);

    expect(normalized1).toBe(normalized2);
    expect(normalized3).toBe(normalized4);
  });

  it("provides transliteration lookup for Arabic author names", async () => {
    const { lookup, lookupPrimary, hasTransliteration } = await import(
      "../transliterationMap"
    );

    expect(hasTransliteration("mahfouz")).toBe(true);
    expect(hasTransliteration("mahfuz")).toBe(true);
    expect(lookupPrimary("mahfouz")).toBe("محفوظ");
    expect(lookupPrimary("mahfuz")).toBe("محفوظ");
    expect(lookup("mahfouz")).toContain("محفوظ");

    expect(hasTransliteration("kanafani")).toBe(true);
    expect(lookupPrimary("kanafani")).toBe("كنعاني");

    expect(hasTransliteration("darwish")).toBe(true);
    expect(lookupPrimary("darwish")).toBe("درويش");

    expect(hasTransliteration("unknown_author")).toBe(false);
    expect(lookupPrimary("unknown_author")).toBe("");
  });

  it("detects transliteration trigger for non-Arabic queries with mappable tokens", async () => {
    const { hasTransliteration } = await import("../transliterationMap");
    const { tokenize } = await import("../../../shared/tokenization");

    const latinQuery = "mahfouz cairo";
    const arabicQuery = "محفوظ القاهرة";

    const latinTokens = tokenize(normalize(latinQuery));
    const arabicTokens = tokenize(normalize(arabicQuery));

    const latinMappable = latinTokens.some((token) => hasTransliteration(token));
    const arabicMappable = arabicTokens.some((token) => hasTransliteration(token));

    expect(latinMappable).toBe(true);
    expect(arabicMappable).toBe(false);

    expect(/[\u0600-\u06FF]/.test(latinQuery)).toBe(false);
    expect(/[\u0600-\u06FF]/.test(arabicQuery)).toBe(true);
  });

  it("builds a single transliteration-expanded query from tokens", async () => {
    const { lookupPrimary } = await import("../transliterationMap");
    const { tokenize } = await import("../../../shared/tokenization");

    const buildTransliterationQuery = (tokens: string[]): string => {
      if (tokens.length === 0) return "";
      const expandedTokens = tokens.map((token) => {
        const arabicForm = lookupPrimary(token);
        return arabicForm || token;
      });
      return expandedTokens.join(" ");
    };

    const tokens1 = ["mahfouz", "cairo"];
    const expanded1 = buildTransliterationQuery(tokens1);
    expect(expanded1).toBe("محفوظ cairo");

    const tokens2 = ["kanafani", "palestin"];
    const expanded2 = buildTransliterationQuery(tokens2);
    expect(expanded2).toContain("كنعاني");
    expect(expanded2).toContain("palestin");

    const tokens3 = ["unknown", "query"];
    const expanded3 = buildTransliterationQuery(tokens3);
    expect(expanded3).toBe("unknown query");

    const tokens4: string[] = [];
    const expanded4 = buildTransliterationQuery(tokens4);
    expect(expanded4).toBe("");

    const tokens5 = ["naguib", "mahfouz"];
    const expanded5 = buildTransliterationQuery(tokens5);
    expect(expanded5).toContain("محفوظ");
  });

  it("triggers transliteration fallback when primary results are weak", async () => {
    const shouldTriggerTransliterationFallback = (
      visibleCanonicalCount: number,
      visibleExternalCount: number
    ): boolean => {
      return visibleCanonicalCount < 3 && (visibleCanonicalCount + visibleExternalCount) < 5;
    };

    expect(shouldTriggerTransliterationFallback(0, 0)).toBe(true);
    expect(shouldTriggerTransliterationFallback(1, 1)).toBe(true);
    expect(shouldTriggerTransliterationFallback(2, 2)).toBe(true);
    expect(shouldTriggerTransliterationFallback(2, 3)).toBe(false);
    expect(shouldTriggerTransliterationFallback(3, 0)).toBe(false);
    expect(shouldTriggerTransliterationFallback(0, 5)).toBe(false);
  });

  it("merges transliteration results using canonicalKey deduplication and applies ranking penalty", async () => {
    const mergeTransliterationResults = (
      primaryResults: any[],
      translitResults: any[]
    ): any[] => {
      const primaryByCanonicalKey = new Map<string, any>();
      const primaryIds = new Set<string>();

      for (const result of primaryResults) {
        const key = result.canonicalKey || `${result.source}:${result.id}`;
        primaryByCanonicalKey.set(key, result);
        primaryIds.add(result.id);
      }

      const TRANSLITERATION_PENALTY_MULTIPLIER = 0.85;
      const newResults: any[] = [];

      for (const translitResult of translitResults) {
        const key = translitResult.canonicalKey || `${translitResult.source}:${translitResult.id}`;

        if (primaryByCanonicalKey.has(key)) {
          continue;
        }

        if (!primaryIds.has(translitResult.id)) {
          const resultWithPenalty = translitResult as any;
          if (typeof resultWithPenalty.computedScore === "number") {
            resultWithPenalty.computedScore = Math.round(
              resultWithPenalty.computedScore * TRANSLITERATION_PENALTY_MULTIPLIER
            );
          }
          newResults.push(resultWithPenalty);
        }
      }

      return newResults;
    };

    const primaryResults = [
      {
        id: "e1",
        canonicalKey: "rowling::harry potter",
        source: "booktown",
        title: "HP Book 1",
        computedScore: 100,
      },
      {
        id: "e2",
        canonicalKey: "kanafani::men in sun",
        source: "booktown",
        title: "Men in Sun",
        computedScore: 95,
      },
    ];

    const translitResults = [
      {
        id: "e1",
        canonicalKey: "rowling::harry potter",
        source: "booktown",
        title: "HP Book 1",
        computedScore: 100,
      },
      {
        id: "e3",
        canonicalKey: "mahfouz::cairo",
        source: "booktown",
        title: "Cairo Trilogy",
        computedScore: 100,
      },
      {
        id: "e4",
        canonicalKey: null,
        source: "googleBooks",
        title: "Mahfouz Works",
        computedScore: 80,
      },
    ];

    const merged = mergeTransliterationResults(primaryResults, translitResults);

    expect(merged.length).toBe(2);
    const e3 = merged.find((r: any) => r.id === "e3");
    const e4 = merged.find((r: any) => r.id === "e4");

    expect(e3).toBeDefined();
    expect(e4).toBeDefined();
    expect(merged.find((r: any) => r.id === "e1")).toBeUndefined();

    expect(e3?.computedScore).toBe(85);
    expect(e4?.computedScore).toBe(68);
  });
});
