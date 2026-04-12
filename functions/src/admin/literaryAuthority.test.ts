import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let uuidCounter = 0;
let timestampCounter = 0;
const ingestBookServerSideMock = vi.fn();
const unifiedSearchMock = vi.fn();

type SpecialValue =
  | { __op: "serverTimestamp" }
  | { __op: "arrayUnion"; values: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSpecial(value: unknown): SpecialValue | null {
  if (!isRecord(value)) return null;
  const op = value.__op;
  if (op === "serverTimestamp") return value as SpecialValue;
  if (op === "arrayUnion") return value as SpecialValue;
  return null;
}

function materialize(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };

  for (const [key, raw] of Object.entries(incoming)) {
    const special = asSpecial(raw);
    if (special?.__op === "serverTimestamp") {
      timestampCounter += 1;
      next[key] = `ts-${timestampCounter}`;
      continue;
    }

    if (special?.__op === "arrayUnion") {
      const current = Array.isArray(existing[key]) ? (existing[key] as unknown[]) : [];
      next[key] = Array.from(new Set([...current, ...special.values]));
      continue;
    }

    if (isRecord(raw)) {
      const existingChild = isRecord(existing[key]) ? (existing[key] as Record<string, unknown>) : {};
      next[key] = materialize(raw, existingChild);
      continue;
    }

    next[key] = raw;
  }

  return next;
}

function setDoc(path: string, data: Record<string, unknown>, merge: boolean): void {
  const existing = store.get(path) || {};
  const resolved = materialize(data, merge ? existing : {});
  if (merge) {
    store.set(path, materialize(resolved, existing));
    return;
  }
  store.set(path, resolved);
}

function getDoc(path: string): Record<string, unknown> | null {
  const value = store.get(path);
  return value ? clone(value) : null;
}

class MockDocSnapshot {
  constructor(private readonly path: string) {}
  get id(): string {
    return this.path.split("/").pop() || "";
  }
  get exists(): boolean {
    return store.has(this.path);
  }
  data(): Record<string, unknown> | undefined {
    const value = store.get(this.path);
    return value ? clone(value) : undefined;
  }
}

class MockDocRef {
  constructor(
    public readonly collectionName: string,
    public readonly id: string
  ) {}
  get path(): string {
    return `${this.collectionName}/${this.id}`;
  }
  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.path);
  }
}

class MockCollectionRef {
  constructor(private readonly name: string) {}
  doc(id?: string): MockDocRef {
    return new MockDocRef(this.name, id || `doc-${++uuidCounter}`);
  }
}

class MockTransaction {
  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(ref.path);
  }
  async getAll(...refs: MockDocRef[]): Promise<MockDocSnapshot[]> {
    return refs.map((ref) => new MockDocSnapshot(ref.path));
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
    const tx = new MockTransaction();
    return handler(tx);
  },
};

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: () => `book-${++uuidCounter}`,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
    arrayUnion: (...values: unknown[]) => ({ __op: "arrayUnion", values }),
  },
}));

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (optsOrHandler: unknown, maybeHandler?: unknown) => {
    const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
    return {
      run: handler as (request: unknown) => Promise<unknown>,
    };
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: Object.assign(
      () => firestoreMock,
      {
        FieldValue: {
          serverTimestamp: () => ({ __op: "serverTimestamp" }),
        },
      }
    ),
    storage: () => ({
      bucket: () => ({
        name: "booktown-test.appspot.com",
      }),
    }),
  },
}));

vi.mock("../shared/auth", () => ({
  assertRoleFromClaims: (auth: { uid?: string } | null | undefined) => {
    if (!auth?.uid) {
      throw new MockHttpsError("unauthenticated", "Auth required.");
    }
    return { uid: auth.uid };
  },
}));

vi.mock("../library/ingestBook", () => ({
  ingestBookServerSide: ingestBookServerSideMock,
}));

vi.mock("../library/search/searchEngine", () => ({
  unifiedSearch: unifiedSearchMock,
}));

async function getAdminCreateCanonicalBookCallable() {
  const mod = await import("./literaryAuthority");
  return mod.adminCreateCanonicalBook as any;
}

async function getAdminSeedCanonicalBatchCallable() {
  const mod = await import("./literaryAuthority");
  return mod.adminSeedCanonicalBatch as any;
}

describe("adminCreateCanonicalBook", () => {
  beforeEach(() => {
    store.clear();
    uuidCounter = 0;
    timestampCounter = 0;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    ingestBookServerSideMock.mockReset();
    unifiedSearchMock.mockReset();
  });

  it("creates a canonical book with canonical author linkage and no edition when isbn is absent", async () => {
    const callable = await getAdminCreateCanonicalBookCallable();
    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        title: "The Master and Margarita",
        author: "Mikhail Bulgakov",
        language: "en",
        description: "A canonical admin-created book.",
      },
    });

    const response = result as {
      book: {
        bookId: string;
        authorityStatus: string;
        canonicalLocked: boolean;
        editionId?: string;
        authorId?: string;
        authorCanonicalKey?: string;
      };
      status: string;
    };

    const book = getDoc(`books/${response.book.bookId}`);

    expect(["CREATED", "MERGED"]).toContain(response.status);
    expect(response.book.authorityStatus).toBe("canonical");
    expect(response.book.canonicalLocked).toBe(true);
    expect(response.book.editionId).toBeUndefined();
    expect(book?.authorityStatus).toBe("canonical");
    expect(book?.canonicalLocked).toBe(true);
    expect(book?.workType).toBe("canonical");
    expect(book?.sourcePriority).toBe("canonical");
    expect(typeof book?.authorId).toBe("string");
    expect(typeof book?.authorCanonicalKey).toBe("string");
  });

  it("creates a cover job through the shared cover_jobs pipeline when coverUrl is provided", async () => {
    const callable = await getAdminCreateCanonicalBookCallable();
    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        title: "The Trial",
        author: "Franz Kafka",
        coverUrl: "https://example.com/trial-cover.jpg",
      },
    });

    const response = result as {
      book: { bookId: string; coverState?: string };
    };

    const book = getDoc(`books/${response.book.bookId}`);
    const coverJob = getDoc(`cover_jobs/${response.book.bookId}`);

    expect(book?.coverState).toBe("PENDING");
    expect(response.book.coverState).toBe("PENDING");
    expect(coverJob?.source).toBe("booktown_canonical");
    expect(coverJob?.candidateUrls).toEqual(["https://example.com/trial-cover.jpg"]);
  });

  it("creates an edition only when isbn is supplied", async () => {
    const callable = await getAdminCreateCanonicalBookCallable();
    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        title: "The Plague",
        author: "Albert Camus",
        isbn: "978-0-679-72139-2",
      },
    });

    const response = result as {
      book: { bookId: string; editionId?: string };
    };

    expect(response.book.editionId).toBe(`canonical:${response.book.bookId}`);
    expect(getDoc(`editions/${response.book.editionId}`)?.bookId).toBe(response.book.bookId);
  });

  it("builds a canonical batch through unified search and ingest while continuing after failures", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            resultType: "external",
            source: "openLibrary",
            externalId: "OL1W",
            rawBook: { title: "The Brothers Karamazov", author: "Fyodor Dostoevsky" },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [],
      })
      .mockResolvedValueOnce({
        results: [
          {
            resultType: "external",
            source: "googleBooks",
            externalId: "gb-77",
            rawBook: { title: "Nausea", author: "Jean-Paul Sartre" },
          },
        ],
      });

    ingestBookServerSideMock
      .mockResolvedValueOnce({
        canonicalBookId: "book-1",
        bookId: "book-1",
        editionId: "openLibrary:OL1W",
        status: "CREATED",
      })
      .mockResolvedValueOnce({
        canonicalBookId: "book-2",
        bookId: "book-2",
        editionId: "googleBooks:gb-77",
        status: "MERGED",
      });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "The Brothers Karamazov | Fyodor Dostoevsky",
          "Unknown Work | Unknown Author",
          "Nausea | Jean-Paul Sartre",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        source?: string;
        providerExternalId?: string;
        message?: string;
      }>;
      summary: {
        successCount: number;
        existingCount: number;
        failedCount: number;
      };
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(3);
    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(2);
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: "book-1",
        source: "openLibrary",
        providerExternalId: "OL1W",
      }),
      expect.objectContaining({
        row: 2,
        status: "failed",
        message: "No provider candidate matched this row.",
      }),
      expect.objectContaining({
        row: 3,
        status: "existing",
        canonicalBookId: "book-2",
        source: "googleBooks",
        providerExternalId: "gb-77",
      }),
    ]);
    expect(response.summary).toEqual({
      successCount: 2,
      existingCount: 1,
      failedCount: 1,
    });
  });

  it("rejects weak provider artifacts and selects the exact Crime and Punishment authority row", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "gb_bad",
          editionId: "gb_bad",
          bookId: "gb_bad",
          workId: null,
          externalId: "bad-1",
          source: "googleBooks",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "Crime and Punishment by Fyodor Dostoevsky",
          titleEn: "Crime and Punishment by Fyodor Dostoevsky",
          titleAr: "",
          authors: ["ClassyBookRead"],
          authorEn: "ClassyBookRead",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "en",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 99,
          rank: 1,
          rawBook: {
            title: "Crime and Punishment by Fyodor Dostoevsky",
            author: "ClassyBookRead",
          },
        },
        {
          id: "ol_good",
          editionId: "ol_good",
          bookId: "ol_good",
          workId: null,
          externalId: "OLGOOD",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "Crime and Punishment",
          titleEn: "Crime and Punishment",
          titleAr: "",
          authors: ["Fyodor Dostoevsky"],
          authorEn: "Fyodor Dostoevsky",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "en",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 80,
          rank: 2,
          rawBook: {
            title: "Crime and Punishment",
            author: "Fyodor Dostoevsky",
          },
        },
      ],
    });

    ingestBookServerSideMock.mockResolvedValueOnce({
      canonicalBookId: "crime-1",
      bookId: "crime-1",
      editionId: "openLibrary:OLGOOD",
      status: "CREATED",
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "Crime and Punishment | Fyodor Dostoevsky",
      },
    });

    const response = result as {
      rows: Array<{
        status: "created" | "existing" | "failed";
        source?: string;
        providerExternalId?: string;
        canonicalBookId?: string;
      }>;
    };

    expect(ingestBookServerSideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "openLibrary",
        providerExternalId: "OLGOOD",
      })
    );
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        status: "created",
        source: "openLibrary",
        providerExternalId: "OLGOOD",
        canonicalBookId: "crime-1",
      })
    );
  });

  it("prefers a cover-bearing candidate when authority signals are otherwise equal", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "gb_plain",
          editionId: "gb_plain",
          bookId: "gb_plain",
          workId: null,
          externalId: "GBPLAIN",
          source: "googleBooks",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "The Trial",
          titleEn: "The Trial",
          titleAr: "",
          authors: ["Franz Kafka"],
          authorEn: "Franz Kafka",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "en",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 90,
          rank: 1,
          rawBook: {
            title: "The Trial",
            author: "Franz Kafka",
          },
        },
        {
          id: "ol_cover",
          editionId: "ol_cover",
          bookId: "ol_cover",
          workId: null,
          externalId: "OLCOVER",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "The Trial",
          titleEn: "The Trial",
          titleAr: "",
          authors: ["Franz Kafka"],
          authorEn: "Franz Kafka",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "en",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 90,
          rank: 2,
          rawBook: {
            title: "The Trial",
            author: "Franz Kafka",
            cover_i: "987654",
          },
        },
      ],
    });

    ingestBookServerSideMock.mockResolvedValueOnce({
      canonicalBookId: "trial-1",
      bookId: "trial-1",
      editionId: "openLibrary:OLCOVER",
      status: "CREATED",
    });

    await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "The Trial | Franz Kafka",
      },
    });

    expect(ingestBookServerSideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "openLibrary",
        providerExternalId: "OLCOVER",
      })
    );
  });

  it("cleans provider-polluted canonical titles before batch ingestion while preserving cover fields", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            id: "crime_polluted",
            editionId: "crime_polluted",
            bookId: "crime_polluted",
            workId: null,
            externalId: "CRIME1",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Crime and Punishment by Fyodor Mikhailovich Dostoyevsky Unabridged 1866",
            titleEn: "Crime and Punishment by Fyodor Mikhailovich Dostoyevsky Unabridged 1866",
            titleAr: "",
            authors: ["Fyodor Dostoevsky"],
            authorEn: "Fyodor Dostoevsky",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "en",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 90,
            rank: 1,
            rawBook: {
              title: "Crime and Punishment by Fyodor Mikhailovich Dostoyevsky Unabridged 1866",
              titleEn: "Crime and Punishment by Fyodor Mikhailovich Dostoyevsky Unabridged 1866",
              author: "Fyodor Dostoevsky",
              authors: ["Fyodor Dostoevsky"],
              cover_i: "111111",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "bovary_polluted",
            editionId: "bovary_polluted",
            bookId: "bovary_polluted",
            workId: null,
            externalId: "BOVARY1",
            source: "googleBooks",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Madame Bovary By Gustave Flaubert",
            titleEn: "Madame Bovary By Gustave Flaubert",
            titleAr: "",
            authors: ["Gustave Flaubert"],
            authorEn: "Gustave Flaubert",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "en",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 90,
            rank: 1,
            rawBook: {
              title: "Madame Bovary By Gustave Flaubert",
              titleEn: "Madame Bovary By Gustave Flaubert",
              author: "Gustave Flaubert",
              authors: ["Gustave Flaubert"],
              thumbnail: "https://example.com/madame-bovary.jpg",
            },
          },
        ],
      });

    ingestBookServerSideMock
      .mockResolvedValueOnce({
        canonicalBookId: "crime-clean",
        bookId: "crime-clean",
        editionId: "openLibrary:CRIME1",
        status: "CREATED",
      })
      .mockResolvedValueOnce({
        canonicalBookId: "bovary-clean",
        bookId: "bovary-clean",
        editionId: "googleBooks:BOVARY1",
        status: "CREATED",
      });

    await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "Crime and Punishment | Fyodor Dostoevsky",
          "Madame Bovary | Gustave Flaubert",
        ].join("\n"),
      },
    });

    expect(ingestBookServerSideMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: "openLibrary",
        providerExternalId: "CRIME1",
        rawBook: expect.objectContaining({
          title: "Crime and Punishment",
          titleEn: "Crime and Punishment",
          cover_i: "111111",
        }),
      })
    );

    expect(ingestBookServerSideMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: "googleBooks",
        providerExternalId: "BOVARY1",
        rawBook: expect.objectContaining({
          title: "Madame Bovary",
          titleEn: "Madame Bovary",
          thumbnail: "https://example.com/madame-bovary.jpg",
        }),
      })
    );
  });
});
