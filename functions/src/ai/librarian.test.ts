import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import type { AgentContextSnapshot } from "../intelligence/types";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let llmTextResponse = "[]";
const llmGenerateContentMock = vi.fn(async () => ({ text: llmTextResponse }));
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function setDoc(path: string, data: Record<string, unknown>, merge = false): void {
  const existing = store.get(path) || {};
  store.set(path, merge ? deepMerge(existing, data) : clone(data));
}

class MockDocSnapshot {
  constructor(private readonly path: string) {}
  get id(): string {
    return this.path.split("/")[1] || "";
  }
  get exists(): boolean {
    return store.has(this.path);
  }
  data(): Record<string, unknown> | undefined {
    const row = store.get(this.path);
    return row ? clone(row) : undefined;
  }
  get(field: string): unknown {
    const row = store.get(this.path);
    return row ? row[field] : undefined;
  }
}

type WhereFilter = { field: string; value: unknown };

class MockQuery {
  constructor(
    protected readonly collectionName: string,
    protected readonly filters: WhereFilter[] = [],
    protected readonly cap: number | null = null,
    protected readonly orderByField: string | null = null
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    if (op !== "==" && op !== "array-contains" && op !== "array-contains-any") {
      throw new Error(`Unsupported op in test mock: ${op}`);
    }
    return new MockQuery(this.collectionName, [...this.filters, { field, value: { op, value } }], this.cap, this.orderByField);
  }

  limit(value: number): MockQuery {
    return new MockQuery(this.collectionName, this.filters, value, this.orderByField);
  }

  orderBy(field: string): MockQuery {
    return new MockQuery(this.collectionName, this.filters, this.cap, field);
  }

  async get(): Promise<{ docs: MockDocSnapshot[]; empty: boolean }> {
    const prefix = `${this.collectionName}/`;
    const rows = Array.from(store.entries())
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => ({ path, data }))
      .filter(({ data }) =>
        this.filters.every((filter) => {
          const encoded = filter.value as { op: string; value: unknown } | undefined;
          const op = encoded?.op || "==";
          const target = encoded?.value;
          const rowValue = data[filter.field];
          if (op === "==") {
            return rowValue === target;
          }
          if (op === "array-contains") {
            return Array.isArray(rowValue) && rowValue.includes(target);
          }
          if (op === "array-contains-any") {
            return (
              Array.isArray(rowValue) &&
              Array.isArray(target) &&
              target.some((entry) => rowValue.includes(entry))
            );
          }
          return false;
        })
      )
      .sort((a, b) => {
        if (!this.orderByField) return 0;
        const av = a.data[this.orderByField];
        const bv = b.data[this.orderByField];
        const as = typeof av === "string" ? av : "";
        const bs = typeof bv === "string" ? bv : "";
        return as.localeCompare(bs);
      })
      .slice(0, this.cap ?? Number.MAX_SAFE_INTEGER)
      .map(({ path }) => new MockDocSnapshot(path));
    return { docs: rows, empty: rows.length === 0 };
  }
}

class MockDocRef {
  constructor(
    private readonly collectionName: string,
    private readonly docId: string
  ) {}
  get path(): string {
    return `${this.collectionName}/${this.docId}`;
  }
  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.path);
  }
  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
  }
  async create(data: Record<string, unknown>): Promise<void> {
    if (store.has(this.path)) {
      throw new Error("already-exists");
    }
    setDoc(this.path, data, false);
  }
}

class MockCollectionRef extends MockQuery {
  constructor(collectionName: string) {
    super(collectionName, [], null);
  }
  doc(id: string): MockDocRef {
    return new MockDocRef(this.collectionName, id);
  }
}

class MockTransaction {
  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    return ref.get();
  }
  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    setDoc(ref.path, data, Boolean(options?.merge));
  }
}

const firestoreMock = {
  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(name);
  },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    return handler(new MockTransaction());
  },
};

const unifiedSearchMock = vi.fn();
const enqueueIntelligenceSignalMock = vi.fn(async () => undefined);

vi.mock("firebase-functions/logger", () => ({
  info: loggerInfoMock,
  warn: loggerWarnMock,
  error: loggerErrorMock,
}));

vi.mock("@google-cloud/vertexai", () => {
  class MockVertexAI {
    getGenerativeModel() {
      return {
        generateContent: llmGenerateContentMock,
      };
    }
  }
  return { VertexAI: MockVertexAI };
});

vi.mock("../library/search/searchEngine", () => ({
  unifiedSearch: unifiedSearchMock,
}));

vi.mock("../intelligence/signalQueue", () => ({
  enqueueIntelligenceSignal: enqueueIntelligenceSignalMock,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
  },
  Timestamp: {
    fromMillis: (value: number) => ({ toMillis: () => value }),
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => firestoreMock,
  },
}));

function buildSearchResponse(results: Array<Record<string, unknown>>) {
  return {
    results,
    nextCursor: null,
    hasMore: false,
    cursorUsed: false,
    canonicalCount: 0,
    externalCount: results.length,
  };
}

function buildCacheDocId(params: {
  uid: string;
  profileVersion: number;
  scopeIntent: "BOOK_RECOMMENDATION" | "AUTHOR_ORDER" | "BOOK_KNOWLEDGE" | "OUT_OF_SCOPE";
  requestIntent: string;
  normalizedQuery: string;
}): string {
  const cacheVersion = "v3";
  const hash = createHash("sha256")
    .update(
      `${cacheVersion}|${params.uid}|${params.profileVersion}|${params.scopeIntent}:${params.requestIntent}|${params.normalizedQuery}`
    )
    .digest("hex");
  return `librarian_${hash}`;
}

function sentenceCount(value: string): number {
  return value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

const baseContext: AgentContextSnapshot = {
  schemaVersion: 1,
  profileVersion: 1,
  privacyTier: "owner_only",
  computedAt: null,
  reading: {
    totalBooksRead: 0,
    completionRate: 0,
    readingVelocity: 0,
  },
  genres: {
    dominantGenre: "",
    entropyScore: 0,
    topGenres: [],
  },
  behavior: {
    noveltyTolerance: 0.5,
    deviationTolerance: 0.5,
    depthPreference: 0.5,
    abandonmentRate: 0.1,
  },
  indices: {
    explorationIndex: 0.2,
    completionConsistency: 0.3,
    culturalDepthIndex: 0.4,
  },
  engagement: {
    socialEngagementIndex: 0,
    quoteDensity: 0,
    reviewFrequency: 0,
  },
};

async function runLibrarian(input: {
  uid?: string;
  query?: string;
  intent?: string;
  context?: AgentContextSnapshot;
}) {
  const mod = await import("./librarian");
  return mod.runLibrarianRecommendation({
    uid: input.uid ?? "user_test_001",
    request: {
      normalizedQuery: input.query ?? "space opera classics",
      intent: input.intent ?? "Reinforcement",
    },
    context: input.context ?? baseContext,
  });
}

describe("librarian orchestrator refactor", () => {
  beforeEach(() => {
    store.clear();
    llmTextResponse = "[]";
    llmGenerateContentMock.mockReset();
    llmGenerateContentMock.mockImplementation(async () => ({ text: llmTextResponse }));
    loggerInfoMock.mockClear();
    loggerWarnMock.mockClear();
    loggerErrorMock.mockClear();
    unifiedSearchMock.mockReset();
    enqueueIntelligenceSignalMock.mockClear();
    process.env.GCP_PROJECT = "booktown-ai";
  });

  it("empty catalog returns >=2 books", async () => {
    llmTextResponse = JSON.stringify([
      { title: "Dune", author: "Frank Herbert" },
      { title: "Kindred", author: "Octavia Butler" },
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
    ]);

    unifiedSearchMock.mockImplementation(async (query: string) => {
      if (query.includes("Dune")) {
        return buildSearchResponse([
          {
            title: "Dune",
            titleEn: "Dune",
            authorEn: "Frank Herbert",
            authors: ["Frank Herbert"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-DUNE",
            bookId: "ol-dune",
          },
        ]);
      }
      if (query.includes("Kindred")) {
        return buildSearchResponse([
          {
            title: "Kindred",
            titleEn: "Kindred",
            authorEn: "Octavia Butler",
            authors: ["Octavia Butler"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-KINDRED",
            bookId: "gb-kindred",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      query: "recommend me speculative fiction",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it("off-catalog suggestion is verified externally and shown", async () => {
    llmTextResponse = JSON.stringify([
      { title: "The Windup Girl", author: "Paolo Bacigalupi" },
    ]);

    unifiedSearchMock.mockResolvedValue(
      buildSearchResponse([
        {
          title: "The Windup Girl",
          titleEn: "The Windup Girl",
          authorEn: "Paolo Bacigalupi",
          authors: ["Paolo Bacigalupi"],
          source: "openLibrary",
          resultType: "external",
          externalId: "OL-WINDUP",
          bookId: "ol-windup",
        },
      ])
    );

    const result = await runLibrarian({
      query: "biopunk novels",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations[0].title).toBe("The Windup Girl");
    expect(result.recommendations[0].bookId.startsWith("ext_")).toBe(true);
  });

  it("dominantGenre does not block recommendation existence", async () => {
    llmTextResponse = JSON.stringify([
      { title: "Parable of the Sower", author: "Octavia Butler" },
      { title: "Children of Time", author: "Adrian Tchaikovsky" },
    ]);

    unifiedSearchMock.mockImplementation(async (query: string) => {
      if (query.includes("Parable")) {
        return buildSearchResponse([
          {
            title: "Parable of the Sower",
            titleEn: "Parable of the Sower",
            authorEn: "Octavia Butler",
            authors: ["Octavia Butler"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-PARABLE",
            bookId: "ol-parable",
          },
        ]);
      }
      if (query.includes("Children of Time")) {
        return buildSearchResponse([
          {
            title: "Children of Time",
            titleEn: "Children of Time",
            authorEn: "Adrian Tchaikovsky",
            authors: ["Adrian Tchaikovsky"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-COT",
            bookId: "gb-cot",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      context: {
        ...baseContext,
        genres: {
          dominantGenre: "Uncategorized",
          entropyScore: 0,
          topGenres: [],
        },
      },
      query: "books like dune",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations[0].title).not.toBe("No verified recommendations");
  });

  it("fallback is emitted only when verification fully fails", async () => {
    llmTextResponse = JSON.stringify([
      { title: "Unknown Book A", author: "Unknown Author A" },
      { title: "Unknown Book B", author: "Unknown Author B" },
    ]);
    unifiedSearchMock.mockResolvedValue(buildSearchResponse([]));

    const result = await runLibrarian({
      query: "totally unknown query",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations[0].short_reason.toLowerCase()).not.toContain("verification");
  });

  it(
    "LLM timeout triggers fallback",
    async () => {
      llmGenerateContentMock.mockImplementation(
        () =>
          new Promise(() => {
            // Deliberately unresolved to force timeout path.
          })
      );
      unifiedSearchMock.mockResolvedValue(
        buildSearchResponse([
          {
            title: "Timeout Recovery Book",
            titleEn: "Timeout Recovery Book",
            authorEn: "Fallback Author",
            authors: ["Fallback Author"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-TIMEOUT",
            bookId: "ol-timeout",
          },
        ])
      );

      const result = await runLibrarian({
        query: "slow llm simulation",
      });

      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(unifiedSearchMock).toHaveBeenCalled();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        "[AI][LIBRARIAN][TIMEOUT]",
        expect.any(Object)
      );
    },
    12000
  );

  it("cache hit does not decrement quota", async () => {
    const uid = "user_test_001";
    const normalizedQuery = "space opera classics";
    const intent = "Reinforcement";
    const profileVersion = 1;
    const cacheDocId = buildCacheDocId({
      uid,
      profileVersion,
      scopeIntent: "BOOK_RECOMMENDATION",
      requestIntent: intent,
      normalizedQuery,
    });
    store.set(`ai_librarian_cache/${cacheDocId}`, {
      uid,
      profileVersion,
      intent: `BOOK_RECOMMENDATION:${intent}`,
      normalizedQuery,
      recommendations: [
        {
          bookId: "book-cache-001",
          title: "Cached Title",
          author: "Cached Author",
          short_reason: "Cached reason",
        },
      ],
      expiresAt: {
        toMillis: () => Date.now() + 60_000,
      },
    });

    const result = await runLibrarian({});
    const dateKey = new Date().toISOString().slice(0, 10);
    const quotaPath = `_ai_librarian_quota/librarian_${uid}_${dateKey}`;

    expect(result.fromCache).toBe(true);
    expect(result.normalizedQuery).toBe(normalizedQuery);
    expect(typeof result.remainingQuota).toBe("number");
    expect(store.has(quotaPath)).toBe(false);
  });

  it("cache hit does not bypass intent gate", async () => {
    const uid = "user_test_001";
    const normalizedQuery = "how is the stock market doing";
    const cacheDocId = buildCacheDocId({
      uid,
      profileVersion: 1,
      scopeIntent: "OUT_OF_SCOPE",
      requestIntent: "Reinforcement",
      normalizedQuery,
    });
    store.set(`ai_librarian_cache/${cacheDocId}`, {
      uid,
      profileVersion: 1,
      intent: "OUT_OF_SCOPE:Reinforcement",
      normalizedQuery,
      recommendations: [
        {
          bookId: "cached_fin_1",
          title: "The Intelligent Investor",
          author: "Benjamin Graham",
          short_reason: "Clear finance foundation. Useful for disciplined long-term thinking. Extra sentence.",
        },
        {
          bookId: "cached_fin_2",
          title: "The Intelligent Investor",
          author: "Benjamin Graham",
          short_reason: "",
        },
      ],
      expiresAt: {
        toMillis: () => Date.now() + 60_000,
      },
    });

    const result = await runLibrarian({
      uid,
      query: "How is the stock market doing?",
      intent: "Reinforcement",
    });

    expect(result.fromCache).toBe(true);
    expect(result.recommendations.length).toBe(1);
    expect(result.recommendations[0].title).toBe("The Intelligent Investor");
    expect(sentenceCount(result.recommendations[0].short_reason)).toBeLessThanOrEqual(2);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "[AI][LIBRARIAN][INTENT_GATE]",
      expect.objectContaining({
        routeIntent: "OUT_OF_SCOPE",
        source: "cache_hit",
      })
    );
  });

  it("no duplicate titles when cache is hit", async () => {
    const uid = "user_test_001";
    const normalizedQuery = "space opera classics";
    const cacheDocId = buildCacheDocId({
      uid,
      profileVersion: 1,
      scopeIntent: "BOOK_RECOMMENDATION",
      requestIntent: "Reinforcement",
      normalizedQuery,
    });
    store.set(`ai_librarian_cache/${cacheDocId}`, {
      uid,
      profileVersion: 1,
      intent: "BOOK_RECOMMENDATION:Reinforcement",
      normalizedQuery,
      recommendations: [
        {
          bookId: "cached_1",
          title: "Dune",
          author: "Frank Herbert",
          short_reason: "Good fit.",
        },
        {
          bookId: "cached_2",
          title: "Dune",
          author: "Frank Herbert",
          short_reason: "Duplicate row.",
        },
      ],
      expiresAt: {
        toMillis: () => Date.now() + 60_000,
      },
    });

    const result = await runLibrarian({
      uid,
      query: normalizedQuery,
      intent: "Reinforcement",
    });
    const keys = result.recommendations.map((row) => `${row.title}|${row.author}`);

    expect(result.fromCache).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("external call cap is enforced", async () => {
    const attemptOne = [
      { title: "Book 1", author: "Author 1" },
      { title: "Book 2", author: "Author 2" },
      { title: "Book 3", author: "Author 3" },
      { title: "Book 4", author: "Author 4" },
      { title: "Book 5", author: "Author 5" },
      { title: "Book 6", author: "Author 6" },
    ];
    const attemptTwo = [
      { title: "Book 7", author: "Author 7" },
      { title: "Book 8", author: "Author 8" },
      { title: "Book 9", author: "Author 9" },
      { title: "Book 10", author: "Author 10" },
      { title: "Book 11", author: "Author 11" },
      { title: "Book 12", author: "Author 12" },
    ];
    let llmCallCount = 0;
    llmGenerateContentMock.mockImplementation(async () => {
      llmCallCount += 1;
      return {
        text: JSON.stringify(llmCallCount === 1 ? attemptOne : attemptTwo),
      };
    });
    unifiedSearchMock.mockResolvedValue(buildSearchResponse([]));

    const result = await runLibrarian({
      query: "obscure request with many candidates",
    });

    expect(unifiedSearchMock.mock.calls.length).toBeGreaterThan(0);
    expect(unifiedSearchMock.mock.calls.length).toBeLessThanOrEqual(8);
    expect(result.recommendations.length).toBe(1);
    expect(result.recommendations[0].title).toBe("No verified books yet");
    expect(result.conversation.explanation.trim().length).toBeGreaterThan(0);
    expect(sentenceCount(result.conversation.explanation)).toBeLessThanOrEqual(2);
    if (unifiedSearchMock.mock.calls.length === 8) {
      expect(loggerWarnMock).toHaveBeenCalledWith(
        "[AI][LIBRARIAN][CALL_CAP]",
        expect.any(Object)
      );
    }
  });

  it("OUT_OF_SCOPE('stock market') returns explanation-only with follow-up", async () => {
    const result = await runLibrarian({
      query: "what is the stock market today",
    });

    expect(result.recommendations.length).toBe(0);
    expect(result.intent).toBe("out_of_scope");
    expect(result.conversation.explanation.trim().length).toBeGreaterThan(0);
    expect(sentenceCount(result.conversation.explanation)).toBeLessThanOrEqual(2);
    expect(result.conversation.follow_up_question).toBeTruthy();
    expect(result.conversation.needs_clarification).toBe(false);
    // OUT_OF_SCOPE must not run search/proposal generation.
    expect(unifiedSearchMock).not.toHaveBeenCalled();
    const maxOutputTokensUsed = llmGenerateContentMock.mock.calls.map((call) => {
      const firstArg = Array.isArray(call) ? (call as unknown[])[0] : undefined;
      if (!firstArg || typeof firstArg !== "object") return 0;
      const config = (
        firstArg as {
          config?: { maxOutputTokens?: number };
          generationConfig?: { maxOutputTokens?: number };
        }
      );
      return Number(config.generationConfig?.maxOutputTokens || config.config?.maxOutputTokens || 0);
    });
    expect(llmGenerateContentMock.mock.calls.length).toBeGreaterThan(0);
    expect(maxOutputTokensUsed.includes(380)).toBe(false);
  });

  it("clarification query returns question and no cards", async () => {
    const result = await runLibrarian({
      query: "recommend a book",
      intent: "Reinforcement",
    });

    expect(result.intent).toBe("clarification");
    expect(result.recommendations.length).toBe(0);
    expect(result.conversation.needs_clarification).toBe(true);
    expect(result.conversation.follow_up_question).toBeTruthy();
    expect(result.conversation.explanation.trim().length).toBeGreaterThan(0);
    expect(sentenceCount(result.conversation.explanation)).toBeLessThanOrEqual(2);
  });

  it("AUTHOR_ORDER('Amin Maalouf') returns sorted unique titles with short_reason", async () => {
    unifiedSearchMock.mockResolvedValue(
      buildSearchResponse([
        {
          title: "Samarkand",
          titleEn: "Samarkand",
          authorEn: "Amin Maalouf",
          authors: ["Amin Maalouf"],
          source: "openLibrary",
          resultType: "external",
          externalId: "OL-AMIN-2",
          bookId: "ol-amin-2",
        },
        {
          title: "Leo Africanus",
          titleEn: "Leo Africanus",
          authorEn: "Amin Maalouf",
          authors: ["Amin Maalouf"],
          source: "googleBooks",
          resultType: "external",
          externalId: "GB-AMIN-1",
          bookId: "gb-amin-1",
        },
        {
          title: "Leo Africanus",
          titleEn: "Leo Africanus",
          authorEn: "Amin Maalouf",
          authors: ["Amin Maalouf"],
          source: "openLibrary",
          resultType: "external",
          externalId: "OL-AMIN-1",
          bookId: "ol-amin-1",
        },
      ])
    );

    const result = await runLibrarian({
      query: "in which order should i read amin maalouf",
    });

    const titles = result.recommendations.map((row) => row.title);
    expect(titles).toEqual(["Leo Africanus", "Samarkand"]);
    for (const row of result.recommendations) {
      expect(row.short_reason.trim().length).toBeGreaterThan(0);
      expect(sentenceCount(row.short_reason)).toBeLessThanOrEqual(2);
    }
    expect(result.intent).toBe("author_request");
    expect(result.conversation.explanation.trim().length).toBeGreaterThan(0);
    expect(sentenceCount(result.conversation.explanation)).toBeLessThanOrEqual(2);
    // Conversational pipeline allows LLM intent interpretation + explanation,
    // but AUTHOR_ORDER should still skip proposal generation.
    const maxOutputTokensUsed = llmGenerateContentMock.mock.calls.map((call) => {
      const firstArg = Array.isArray(call) ? (call as unknown[])[0] : undefined;
      if (!firstArg || typeof firstArg !== "object") return 0;
      const config = (
        firstArg as {
          config?: { maxOutputTokens?: number };
          generationConfig?: { maxOutputTokens?: number };
        }
      );
      return Number(config.generationConfig?.maxOutputTokens || config.config?.maxOutputTokens || 0);
    });
    expect(llmGenerateContentMock.mock.calls.length).toBeGreaterThan(0);
    expect(maxOutputTokensUsed.includes(380)).toBe(false);
  });

  it("AUTHOR_ORDER cached response does not leak into OUT_OF_SCOPE", async () => {
    const uid = "user_test_001";
    const normalizedQuery = "stock market";
    const authorOrderCacheDocId = buildCacheDocId({
      uid,
      profileVersion: 1,
      scopeIntent: "AUTHOR_ORDER",
      requestIntent: "Reinforcement",
      normalizedQuery,
    });
    store.set(`ai_librarian_cache/${authorOrderCacheDocId}`, {
      uid,
      profileVersion: 1,
      intent: "AUTHOR_ORDER:Reinforcement",
      normalizedQuery,
      recommendations: [
        {
          bookId: "cached_author_1",
          title: "Disordered World",
          author: "Some Author",
          short_reason: "Wrong branch cache payload.",
        },
      ],
      expiresAt: {
        toMillis: () => Date.now() + 60_000,
      },
    });
    unifiedSearchMock.mockResolvedValue(
      buildSearchResponse([
        {
          title: "The Intelligent Investor",
          titleEn: "The Intelligent Investor",
          authorEn: "Benjamin Graham",
          authors: ["Benjamin Graham"],
          source: "googleBooks",
          resultType: "external",
          externalId: "GB-CROSS-BRANCH-1",
          bookId: "gb-cross-branch-1",
        },
        {
          title: "A Random Walk Down Wall Street",
          titleEn: "A Random Walk Down Wall Street",
          authorEn: "Burton G. Malkiel",
          authors: ["Burton G. Malkiel"],
          source: "openLibrary",
          resultType: "external",
          externalId: "OL-CROSS-BRANCH-2",
          bookId: "ol-cross-branch-2",
        },
      ])
    );

    const result = await runLibrarian({
      uid,
      query: "stock market",
      intent: "Reinforcement",
    });

    expect(result.fromCache).toBe(false);
    expect(result.recommendations.some((row) => row.title === "Disordered World")).toBe(false);
  });

  it("no duplicate titles are returned in BOOK_RECOMMENDATION branch", async () => {
    llmTextResponse = JSON.stringify([
      { title: "Dune", author: "Frank Herbert" },
      { title: "Dune", author: "Frank Herbert" },
      { title: "Kindred", author: "Octavia Butler" },
    ]);
    unifiedSearchMock.mockImplementation(async (query: string) => {
      if (query.includes("Dune")) {
        return buildSearchResponse([
          {
            title: "Dune",
            titleEn: "Dune",
            authorEn: "Frank Herbert",
            authors: ["Frank Herbert"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-DUNE-DEDUPE",
            bookId: "ol-dune-dedupe",
          },
        ]);
      }
      if (query.includes("Kindred")) {
        return buildSearchResponse([
          {
            title: "Kindred",
            titleEn: "Kindred",
            authorEn: "Octavia Butler",
            authors: ["Octavia Butler"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-KINDRED-DEDUPE",
            bookId: "gb-kindred-dedupe",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      query: "recommend books like dune",
      intent: "HighConfidencePrecision",
    });
    const keys = result.recommendations.map((row) => `${row.title}|${row.author}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("thematic in-scope query returns cards with short_reason and explanation <= 2 sentences", async () => {
    unifiedSearchMock.mockResolvedValue(
      buildSearchResponse([
        {
          title: "The Intelligent Investor",
          titleEn: "The Intelligent Investor",
          authorEn: "Benjamin Graham",
          authors: ["Benjamin Graham"],
          source: "googleBooks",
          resultType: "external",
          externalId: "GB-REASON-1",
          bookId: "gb-reason-1",
        },
        {
          title: "A Random Walk Down Wall Street",
          titleEn: "A Random Walk Down Wall Street",
          authorEn: "Burton G. Malkiel",
          authors: ["Burton G. Malkiel"],
          source: "openLibrary",
          resultType: "external",
          externalId: "OL-REASON-2",
          bookId: "ol-reason-2",
        },
      ])
    );

    const result = await runLibrarian({
      query: "books about market psychology",
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const row of result.recommendations) {
      expect(row.short_reason.trim().length).toBeGreaterThan(0);
      expect(sentenceCount(row.short_reason)).toBeLessThanOrEqual(2);
    }
  });

  it("rumi_author_query returns verified Rumi titles, not catalog fallback", async () => {
    llmTextResponse = JSON.stringify([
      { title: "The Essential Rumi", author: "Rumi" },
      { title: "Rumi: The Book of Love", author: "Rumi" },
      { title: "The Masnavi", author: "Rumi" },
    ]);

    unifiedSearchMock.mockImplementation(async (query: string) => {
      const normalized = query.toLowerCase();
      if (normalized.includes("essential rumi")) {
        return buildSearchResponse([
          {
            title: "The Essential Rumi",
            titleEn: "The Essential Rumi",
            authorEn: "Rumi",
            authors: ["Rumi"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-RUMI-1",
            bookId: "gb-rumi-1",
          },
        ]);
      }
      if (normalized.includes("book of love")) {
        return buildSearchResponse([
          {
            title: "Rumi: The Book of Love",
            titleEn: "Rumi: The Book of Love",
            authorEn: "Rumi",
            authors: ["Rumi"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-RUMI-2",
            bookId: "ol-rumi-2",
          },
        ]);
      }
      if (normalized.includes("masnavi")) {
        return buildSearchResponse([
          {
            title: "The Masnavi",
            titleEn: "The Masnavi",
            authorEn: "Rumi",
            authors: ["Rumi"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-RUMI-3",
            bookId: "gb-rumi-3",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      query: "a book by rumi",
      intent: "HighConfidencePrecision",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations.some((row) => row.author.toLowerCase().includes("rumi"))).toBe(true);
    expect(result.recommendations.some((row) => row.title === "Start with a concrete title")).toBe(false);
  });

  it("eco_author_query returns verified Umberto Eco titles", async () => {
    llmTextResponse = JSON.stringify([
      { title: "The Name of the Rose", author: "Umberto Eco" },
      { title: "Foucault's Pendulum", author: "Umberto Eco" },
      { title: "The Prague Cemetery", author: "Umberto Eco" },
    ]);

    unifiedSearchMock.mockImplementation(async (query: string) => {
      const normalized = query.toLowerCase();
      if (normalized.includes("name of the rose")) {
        return buildSearchResponse([
          {
            title: "The Name of the Rose",
            titleEn: "The Name of the Rose",
            authorEn: "Umberto Eco",
            authors: ["Umberto Eco"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-ECO-1",
            bookId: "ol-eco-1",
          },
        ]);
      }
      if (normalized.includes("foucault")) {
        return buildSearchResponse([
          {
            title: "Foucault's Pendulum",
            titleEn: "Foucault's Pendulum",
            authorEn: "Umberto Eco",
            authors: ["Umberto Eco"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-ECO-2",
            bookId: "gb-eco-2",
          },
        ]);
      }
      if (normalized.includes("prague cemetery")) {
        return buildSearchResponse([
          {
            title: "The Prague Cemetery",
            titleEn: "The Prague Cemetery",
            authorEn: "Umberto Eco",
            authors: ["Umberto Eco"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-ECO-3",
            bookId: "ol-eco-3",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      query: "a book by umberto eco",
      intent: "HighConfidencePrecision",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(
      result.recommendations.some(
        (row) =>
          row.title === "The Name of the Rose" ||
          row.title === "Foucault's Pendulum" ||
          row.title === "The Prague Cemetery"
      )
    ).toBe(true);
    expect(result.recommendations.some((row) => row.title === "Start with a concrete title")).toBe(false);
  });

  it("similarity_query returns verified sci-fi titles for loved dune", async () => {
    llmTextResponse = JSON.stringify([
      { title: "Hyperion", author: "Dan Simmons" },
      { title: "Foundation", author: "Isaac Asimov" },
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
    ]);

    unifiedSearchMock.mockImplementation(async (query: string) => {
      const normalized = query.toLowerCase();
      if (normalized.includes("hyperion")) {
        return buildSearchResponse([
          {
            title: "Hyperion",
            titleEn: "Hyperion",
            authorEn: "Dan Simmons",
            authors: ["Dan Simmons"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-SF-1",
            bookId: "gb-sf-1",
          },
        ]);
      }
      if (normalized.includes("foundation")) {
        return buildSearchResponse([
          {
            title: "Foundation",
            titleEn: "Foundation",
            authorEn: "Isaac Asimov",
            authors: ["Isaac Asimov"],
            source: "openLibrary",
            resultType: "external",
            externalId: "OL-SF-2",
            bookId: "ol-sf-2",
          },
        ]);
      }
      if (normalized.includes("left hand of darkness")) {
        return buildSearchResponse([
          {
            title: "The Left Hand of Darkness",
            titleEn: "The Left Hand of Darkness",
            authorEn: "Ursula K. Le Guin",
            authors: ["Ursula K. Le Guin"],
            source: "googleBooks",
            resultType: "external",
            externalId: "GB-SF-3",
            bookId: "gb-sf-3",
          },
        ]);
      }
      return buildSearchResponse([]);
    });

    const result = await runLibrarian({
      query: "what should i read if i loved dune",
      intent: "HighConfidencePrecision",
    });

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(
      result.recommendations.some(
        (row) =>
          row.title === "Hyperion" ||
          row.title === "Foundation" ||
          row.title === "The Left Hand of Darkness"
      )
    ).toBe(true);
    expect(result.recommendations.some((row) => row.title === "Start with a concrete title")).toBe(false);
  });

  it("cache key differs between BOOK_RECOMMENDATION and AUTHOR_ORDER for same query", () => {
    const uid = "user_test_001";
    const normalizedQuery = "dune";
    const profileVersion = 1;

    const recommendationKey = buildCacheDocId({
      uid,
      profileVersion,
      scopeIntent: "BOOK_RECOMMENDATION",
      requestIntent: "Reinforcement",
      normalizedQuery,
    });
    const authorOrderKey = buildCacheDocId({
      uid,
      profileVersion,
      scopeIntent: "AUTHOR_ORDER",
      requestIntent: "Reinforcement",
      normalizedQuery,
    });

    expect(recommendationKey).not.toBe(authorOrderKey);
  });
});
