import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
const storageFiles = new Set<string>();
let uuidCounter = 0;
let timestampCounter = 0;
const ingestBookServerSideMock = vi.fn();
const unifiedSearchMock = vi.fn();

type SpecialValue =
  | { __op: "serverTimestamp" }
  | { __op: "arrayUnion"; values: unknown[] }
  | { __op: "delete" };

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
  if (op === "delete") return value as SpecialValue;
  return null;
}

function deleteAtPath(target: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = cursor[part];
    if (!isRecord(next)) {
      return;
    }
    cursor = next;
  }

  delete cursor[parts[parts.length - 1]];
}

function getAtPath(target: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = target;

  for (const part of parts) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }

  return cursor;
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

    if (special?.__op === "delete") {
      deleteAtPath(next, key);
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
  get ref(): MockDocRef {
    const segments = this.path.split("/");
    const id = segments[segments.length - 1];
    const collectionName = segments.slice(0, -1).join("/");
    return new MockDocRef(collectionName, id);
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
  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
  }
  async delete(): Promise<void> {
    store.delete(this.path);
  }
}

class MockQuery {
  constructor(
    private readonly collectionName: string,
    private readonly field: string | null,
    private readonly op: string,
    private readonly value: unknown,
    private readonly limitCount?: number
  ) {}

  async get(): Promise<{ docs: MockDocSnapshot[] }> {
    const docs = Array.from(store.entries())
      .filter(([path, data]) => {
        const collectionName = path.split("/").slice(0, -1).join("/");
        if (collectionName !== this.collectionName) return false;
        if (this.field == null) return true;
        if (!isRecord(data)) return false;
        const fieldValue = getAtPath(data, this.field);
        if (this.op === "==") {
          return fieldValue === this.value;
        }
        if (this.op === "array-contains") {
          return Array.isArray(fieldValue) && fieldValue.includes(this.value);
        }
        return false;
      })
      .map(([path]) => new MockDocSnapshot(path))
      .slice(0, this.limitCount ?? Number.MAX_SAFE_INTEGER);

    return { docs };
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.collectionName, this.field, this.op, this.value, count);
  }
}

class MockCollectionRef {
  constructor(private readonly name: string) {}
  doc(id?: string): MockDocRef {
    return new MockDocRef(this.name, id || `doc-${++uuidCounter}`);
  }
  where(field: string, op: string, value: unknown): MockQuery {
    if (op !== "==" && op !== "array-contains") {
      throw new Error(`Unsupported operator ${op}`);
    }
    return new MockQuery(this.name, field, op, value);
  }
  get(): Promise<{ docs: MockDocSnapshot[] }> {
    return new MockQuery(this.name, null, "==", null).get();
  }
}

class MockTransaction {
  private hasWritten = false;

  async get(ref: MockDocRef | MockQuery): Promise<MockDocSnapshot | { docs: MockDocSnapshot[] }> {
    if (this.hasWritten) {
      throw new Error("Firestore transactions require all reads to be executed before all writes.");
    }
    if (ref instanceof MockQuery) {
      return ref.get();
    }
    return new MockDocSnapshot(ref.path);
  }
  async getAll(...refs: MockDocRef[]): Promise<MockDocSnapshot[]> {
    if (this.hasWritten) {
      throw new Error("Firestore transactions require all reads to be executed before all writes.");
    }
    return refs.map((ref) => new MockDocSnapshot(ref.path));
  }
  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    this.hasWritten = true;
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
    delete: () => ({ __op: "delete" }),
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
        getFiles: async ({ prefix }: { prefix?: string } = {}) => [
          Array.from(storageFiles)
            .filter((path) => (prefix ? path.startsWith(prefix) : true))
            .map((path) => ({
              delete: async () => {
                storageFiles.delete(path);
              },
            })),
        ],
        file: (path: string) => ({
          delete: async () => {
            storageFiles.delete(path);
          },
        }),
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

async function getAdminDeleteAllBooksCallable() {
  const mod = await import("./literaryAuthority");
  return mod.adminDeleteAllBooks as any;
}

async function getAdminDeleteCanonicalBookCallable() {
  const mod = await import("./literaryAuthority");
  return mod.adminDeleteCanonicalBook as any;
}

async function getMaterializeBookAuthorityFn() {
  const mod = await import("../library/materializeBookAuthority");
  return mod.materializeBookAuthority as any;
}

describe("adminCreateCanonicalBook", () => {
  beforeEach(() => {
    store.clear();
    storageFiles.clear();
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
        description:
          "Franz Kafka's trial novel follows Josef K. through an opaque legal machine that strips certainty, dignity, and control while forcing every ordinary detail into existential dread.",
        coverUrl: "https://example.com/trial-cover.jpg",
      },
    });

    const response = result as {
      book: {
        bookId: string;
        coverState?: string;
        coverSource?: string;
        coverAuthority?: number;
        descriptionSource?: string;
        descriptionAuthority?: number;
      };
    };

    const book = getDoc(`books/${response.book.bookId}`);
    const coverJob = getDoc(`cover_jobs/${response.book.bookId}`);

    expect(book?.coverState).toBe("PENDING");
    expect(response.book.coverState).toBe("PENDING");
    expect(book?.coverSource).toBe("manualAdmin");
    expect(book?.coverAuthority).toBe(100);
    expect(book?.descriptionSource).toBe("manualAdmin");
    expect(book?.descriptionAuthority).toBe(100);
    expect(response.book.coverSource).toBe("manualAdmin");
    expect(response.book.coverAuthority).toBe(100);
    expect(response.book.descriptionSource).toBe("manualAdmin");
    expect(response.book.descriptionAuthority).toBe(100);
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
      })
      .mockResolvedValueOnce({
        results: [],
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

    expect(unifiedSearchMock).toHaveBeenCalledTimes(5);
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

  it("prefers an Open Library work-id candidate over a higher-scoring Google Books title match", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "gb-solitude",
          editionId: "gb-solitude",
          bookId: "gb-solitude",
          workId: null,
          externalId: "gb-solitude-1",
          source: "googleBooks",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "One Hundred Years of Solitude",
          titleEn: "One Hundred Years of Solitude",
          titleAr: "",
          authors: ["Gabriel García Márquez"],
          authorEn: "Gabriel García Márquez",
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
            title: "One Hundred Years of Solitude",
            author: "Gabriel García Márquez",
          },
        },
        {
          id: "ol-solitude-work",
          editionId: "ol-solitude-work",
          bookId: "ol-solitude-work",
          workId: null,
          externalId: "OL27448W",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "mismatch",
          title: "Cien años de soledad",
          titleEn: "Cien años de soledad",
          titleAr: "",
          authors: ["Gabriel García Márquez"],
          authorEn: "Gabriel García Márquez",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "es",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 40,
          rank: 5,
          rawBook: {
            key: "/works/OL27448W",
            openLibraryWorkId: "OL27448W",
            title: "Cien años de soledad",
            author: "Gabriel García Márquez",
            titleAliases: ["One Hundred Years of Solitude"],
          },
        },
      ],
    });

    ingestBookServerSideMock.mockResolvedValueOnce({
      canonicalBookId: "solitude-openlibrary",
      bookId: "solitude-openlibrary",
      editionId: "openLibrary:OL27448W",
      status: "CREATED",
    });

    await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "One Hundred Years of Solitude | Gabriel García Márquez",
      },
    });

    expect(ingestBookServerSideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "openLibrary",
        providerExternalId: "OL27448W",
        rawBook: expect.objectContaining({
          title: "One Hundred Years of Solitude",
          titleEn: "One Hundred Years of Solitude",
          titleAliases: expect.arrayContaining([
            "Cien años de soledad",
            "One Hundred Years of Solitude",
          ]),
        }),
      })
    );
  });

  it("retries Open Library before accepting a Google Books seed winner", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            id: "gb-lesmis",
            editionId: "gb-lesmis",
            bookId: "gb-lesmis",
            workId: null,
            externalId: "gb-lesmis-1",
            source: "googleBooks",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Les Miserables",
            titleEn: "Les Miserables",
            titleAr: "",
            authors: ["Victor Hugo"],
            authorEn: "Victor Hugo",
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
            confidence: 96,
            rank: 1,
            rawBook: {
              title: "Les Miserables",
              author: "Victor Hugo",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-lesmis-work",
            editionId: "ol-lesmis-work",
            bookId: "ol-lesmis-work",
            workId: null,
            externalId: "OL12345W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Les Misérables",
            titleEn: "Les Misérables",
            titleAr: "",
            authors: ["Victor Hugo"],
            authorEn: "Victor Hugo",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "fr",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 55,
            rank: 4,
            rawBook: {
              key: "/works/OL12345W",
              openLibraryWorkId: "OL12345W",
              title: "Les Misérables",
              author: "Victor Hugo",
              titleAliases: ["Les Miserables"],
            },
          },
        ],
      });

    ingestBookServerSideMock.mockResolvedValueOnce({
      canonicalBookId: "lesmis-openlibrary",
      bookId: "lesmis-openlibrary",
      editionId: "openLibrary:OL12345W",
      status: "CREATED",
    });

    await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "Les Misérables | Victor Hugo",
      },
    });

    expect(unifiedSearchMock).toHaveBeenNthCalledWith(
      2,
      "les miserables victor hugo",
      { limit: 10 }
    );
    expect(ingestBookServerSideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "openLibrary",
        providerExternalId: "OL12345W",
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
      })
      .mockResolvedValueOnce({
        results: [],
      })
      ;

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

  it("reuses one canonical work for repeated accented seed lines", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "proust-ol",
          editionId: "proust-ol",
          bookId: "proust-ol",
          workId: null,
          externalId: "OLPROUST1",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "A la recherche du temps perdu",
          titleEn: "A la recherche du temps perdu",
          titleAr: "",
          authors: ["Marcel Proust"],
          authorEn: "Marcel Proust",
          authorAr: "",
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          language: "fr",
          available: false,
          acquired: false,
          readAccess: "none",
          readProvider: null,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
          confidence: 92,
          rank: 1,
          rawBook: {
            title: "A la recherche du temps perdu",
            author: "Marcel Proust",
          },
        },
      ],
    });

    ingestBookServerSideMock.mockImplementationOnce(async () => {
      setDoc(
        "books/proust-work-1",
        {
          bookId: "proust-work-1",
          canonicalBookId: "proust-work-1",
          canonicalKey: "marcel proust::a la recherche du temps perdu",
          normalizedTitle: "a la recherche du temps perdu",
          titleEnNormalized: "a la recherche du temps perdu",
          canonicalTitle: "A la recherche du temps perdu",
          title: "A la recherche du temps perdu",
          author: "Marcel Proust",
          authorEn: "Marcel Proust",
          authorNamesNormalized: ["marcel proust"],
          authorityStatus: "canonical",
          workType: "canonical",
          canonicalLocked: true,
          source: "openLibrary",
          editionId: "openLibrary:OLPROUST1",
        },
        false
      );

      return {
        canonicalBookId: "proust-work-1",
        bookId: "proust-work-1",
        editionId: "openLibrary:OLPROUST1",
        status: "CREATED",
      };
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "À la recherche du temps perdu | Marcel Proust",
          "A la recherche du temps perdu | Marcel Proust",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        source?: string;
        message?: string;
      }>;
      summary: {
        successCount: number;
        existingCount: number;
        failedCount: number;
      };
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(1);
    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(1);
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: "proust-work-1",
        source: "openLibrary",
      }),
      expect.objectContaining({
        row: 2,
        status: "existing",
        canonicalBookId: "proust-work-1",
        source: "openLibrary",
        message: expect.stringContaining("duplicate prevented"),
      }),
    ]);
    expect(response.summary).toEqual({
      successCount: 2,
      existingCount: 1,
      failedCount: 0,
    });
  });

  it("reuses one canonical work across translated seed titles when the external work id matches", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-es",
            editionId: "ol-solitude-es",
            bookId: "ol-solitude-es",
            workId: null,
            externalId: "OL27448W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Cien años de soledad",
            titleEn: "Cien años de soledad",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "es",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 93,
            rank: 1,
            rawBook: {
              key: "/works/OL27448W",
              title: "Cien años de soledad",
              author: "Gabriel García Márquez",
              titleAliases: ["One Hundred Years of Solitude"],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-en",
            editionId: "ol-solitude-en",
            bookId: "ol-solitude-en",
            workId: null,
            externalId: "OL27448W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "One Hundred Years of Solitude",
            titleEn: "One Hundred Years of Solitude",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
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
            confidence: 94,
            rank: 1,
            rawBook: {
              key: "/works/OL27448W",
              title: "One Hundred Years of Solitude",
              author: "Gabriel García Márquez",
              titleAliases: ["Cien años de soledad"],
            },
          },
        ],
      });

    ingestBookServerSideMock.mockImplementationOnce(async () => {
      setDoc(
        "books/solitude-work-1",
        {
          bookId: "solitude-work-1",
          canonicalBookId: "solitude-work-1",
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          normalizedTitle: "cien anos de soledad",
          titleEnNormalized: "cien anos de soledad",
          canonicalTitle: "Cien años de soledad",
          title: "Cien años de soledad",
          author: "Gabriel García Márquez",
          authorEn: "Gabriel García Márquez",
          authorNamesNormalized: ["gabriel garcia marquez"],
          authorityStatus: "canonical",
          workType: "canonical",
          canonicalLocked: true,
          source: "openLibrary",
          editionId: "openLibrary:OL27448W",
          titleAliases: ["One Hundred Years of Solitude"],
          workIdentity: {
            canonicalKey: "gabriel garcia marquez::cien anos de soledad",
            mergeKeys: [
              "gabriel garcia marquez::cien anos de soledad",
              "gabriel garcia marquez::one hundred years of solitude",
            ],
            providerWorkId: "openLibrary:OL27448W",
          },
        },
        false
      );

      return {
        canonicalBookId: "solitude-work-1",
        bookId: "solitude-work-1",
        editionId: "openLibrary:OL27448W",
        status: "CREATED",
      };
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "Cien años de soledad | Gabriel García Márquez",
          "One Hundred Years of Solitude | Gabriel García Márquez",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        source?: string;
        message?: string;
      }>;
      summary: {
        successCount: number;
        existingCount: number;
        failedCount: number;
      };
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(2);
    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(1);
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: "solitude-work-1",
        source: "openLibrary",
      }),
      expect.objectContaining({
        row: 2,
        status: "existing",
        canonicalBookId: "solitude-work-1",
        source: "openLibrary",
        message: expect.stringContaining("multilingual authority convergence"),
      }),
    ]);
    expect(response.summary).toEqual({
      successCount: 2,
      existingCount: 1,
      failedCount: 0,
    });
    expect(getDoc("books/solitude-work-1")?.titleAliases).toEqual([
      "One Hundred Years of Solitude",
    ]);
  });

  it("reuses an existing canonical for a translated Open Library title when alias confidence is exact", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-es-1",
            editionId: "ol-solitude-es-1",
            bookId: "ol-solitude-es-1",
            workId: null,
            externalId: "OL27448W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Cien años de soledad",
            titleEn: "Cien años de soledad",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "es",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 94,
            rank: 1,
            rawBook: {
              key: "/works/OL27448W",
              openLibraryWorkId: "OL27448W",
              title: "Cien años de soledad",
              author: "Gabriel García Márquez",
              titleAliases: ["One Hundred Years of Solitude"],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-en-2",
            editionId: "ol-solitude-en-2",
            bookId: "ol-solitude-en-2",
            workId: null,
            externalId: "OL99999W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "One Hundred Years of Solitude",
            titleEn: "One Hundred Years of Solitude",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
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
            confidence: 93,
            rank: 1,
            rawBook: {
              key: "/works/OL99999W",
              openLibraryWorkId: "OL99999W",
              title: "One Hundred Years of Solitude",
              author: "Gabriel García Márquez",
              titleAliases: ["Cien años de soledad"],
            },
          },
        ],
      });

    ingestBookServerSideMock.mockImplementationOnce(async () => {
      setDoc(
        "books/solitude-translation-1",
        {
          bookId: "solitude-translation-1",
          canonicalBookId: "solitude-translation-1",
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          normalizedTitle: "cien anos de soledad",
          titleEnNormalized: "cien anos de soledad",
          canonicalTitle: "Cien años de soledad",
          title: "Cien años de soledad",
          author: "Gabriel García Márquez",
          authorEn: "Gabriel García Márquez",
          authorNamesNormalized: ["gabriel garcia marquez"],
          authorityStatus: "canonical",
          workType: "canonical",
          canonicalLocked: true,
          source: "openLibrary",
          editionId: "openLibrary:OL27448W",
          titleAliases: ["One Hundred Years of Solitude"],
          workIdentity: {
            canonicalKey: "gabriel garcia marquez::cien anos de soledad",
            mergeKeys: [
              "gabriel garcia marquez::cien anos de soledad",
              "gabriel garcia marquez::one hundred years of solitude",
            ],
            providerWorkId: "openLibrary:OL27448W",
          },
        },
        false
      );

      return {
        canonicalBookId: "solitude-translation-1",
        bookId: "solitude-translation-1",
        editionId: "openLibrary:OL27448W",
        status: "CREATED",
      };
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "Cien años de soledad | Gabriel García Márquez",
          "One Hundred Years of Solitude | Gabriel García Márquez",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
      }>;
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(2);
    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(1);
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: "solitude-translation-1",
      }),
      expect.objectContaining({
        row: 2,
        status: "existing",
        canonicalBookId: "solitude-translation-1",
      }),
    ]);
    expect(getDoc("books/solitude-translation-1")?.workIdentity).toMatchObject({
      providerWorkId: "openLibrary:OL27448W",
      alternateProviderWorkIds: ["openLibrary:OL99999W"],
    });
  });

  it("reuses an existing canonical when provider originalTitle proves translation equivalence", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/solitude-original-title-1",
      {
        bookId: "solitude-original-title-1",
        canonicalBookId: "solitude-original-title-1",
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        normalizedTitle: "cien anos de soledad",
        titleEnNormalized: "cien anos de soledad",
        canonicalTitle: "Cien años de soledad",
        originalTitle: "Cien años de soledad",
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          mergeKeys: ["gabriel garcia marquez::cien anos de soledad"],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "ol-solitude-original-title-en",
          editionId: "ol-solitude-original-title-en",
          bookId: "ol-solitude-original-title-en",
          workId: null,
          externalId: "OL99999W",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "One Hundred Years of Solitude",
          titleEn: "One Hundred Years of Solitude",
          titleAr: "",
          authors: ["Gabriel García Márquez"],
          authorEn: "Gabriel García Márquez",
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
          confidence: 95,
          rank: 1,
          rawBook: {
            key: "/works/OL99999W",
            openLibraryWorkId: "OL99999W",
            title: "One Hundred Years of Solitude",
            originalTitle: "Cien años de soledad",
            author: "Gabriel García Márquez",
          },
        },
      ],
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "One Hundred Years of Solitude | Gabriel García Márquez",
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        message?: string;
      }>;
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(1);
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        row: 1,
        status: "existing",
        canonicalBookId: "solitude-original-title-1",
        message: expect.stringContaining("multilingual authority convergence"),
      })
    );
    expect(getDoc("books/solitude-original-title-1")?.workIdentity).toMatchObject({
      providerWorkId: "openLibrary:OL27448W",
      alternateProviderWorkIds: ["openLibrary:OL99999W"],
    });
  });

  it("reuses an existing canonical before failing when provider returns no candidate", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/solitude-provider-miss-1",
      {
        bookId: "solitude-provider-miss-1",
        canonicalBookId: "solitude-provider-miss-1",
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
        normalizedTitle: "one hundred years of solitude",
        titleEnNormalized: "one hundred years of solitude",
        canonicalTitle: "One Hundred Years of Solitude",
        title: "One Hundred Years of Solitude",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        titleAliases: ["Cien años de soledad"],
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
          mergeKeys: [
            "gabriel garcia marquez::one hundred years of solitude",
            "gabriel garcia marquez::cien anos de soledad",
          ],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    unifiedSearchMock.mockResolvedValueOnce({
      results: [],
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "Cien años de soledad | Gabriel García Márquez",
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        message?: string;
      }>;
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(1);
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        row: 1,
        status: "existing",
        canonicalBookId: "solitude-provider-miss-1",
        message: expect.stringContaining("provider miss fell back to strict canonical authority reuse"),
      })
    );
  });

  it("runs one final survivor gate before create and reuses an alias-matched canonical", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/solitude-final-gate-1",
      {
        bookId: "solitude-final-gate-1",
        canonicalBookId: "solitude-final-gate-1",
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        normalizedTitle: "cien anos de soledad",
        titleEnNormalized: "cien anos de soledad",
        canonicalTitle: "Cien años de soledad",
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        titleAliases: ["One Hundred Years of Solitude"],
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          mergeKeys: [
            "gabriel garcia marquez::cien anos de soledad",
            "gabriel garcia marquez::one hundred years of solitude",
          ],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "gb-solitude-final-gate",
          editionId: "gb-solitude-final-gate",
          bookId: "gb-solitude-final-gate",
          workId: null,
          externalId: "gb-solitude-final-gate-1",
          source: "googleBooks",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "One Hundred Years of Solitude",
          titleEn: "One Hundred Years of Solitude",
          titleAr: "",
          authors: ["Gabriel García Márquez"],
          authorEn: "Gabriel García Márquez",
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
          confidence: 96,
          rank: 1,
          rawBook: {
            title: "One Hundred Years of Solitude",
            author: "Gabriel García Márquez",
          },
        },
      ],
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "One Hundred Years of Solitude | Gabriel García Márquez",
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        message?: string;
      }>;
    };

    expect(unifiedSearchMock).toHaveBeenCalledTimes(3);
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        row: 1,
        status: "existing",
        canonicalBookId: "solitude-final-gate-1",
        message: expect.stringContaining("final survivor gate prevented duplicate canonical create"),
      })
    );
  });

  it("enriches a google-first canonical with trusted open library aliases before first create", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    unifiedSearchMock
      .mockResolvedValueOnce({
        results: [
          {
            id: "gb-solitude-create-es",
            editionId: "gb-solitude-create-es",
            bookId: "gb-solitude-create-es",
            workId: null,
            externalId: "gb-solitude-create-es-1",
            source: "googleBooks",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Cien años de soledad",
            titleEn: "Cien años de soledad",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "es",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 95,
            rank: 1,
            rawBook: {
              title: "Cien años de soledad",
              author: "Gabriel García Márquez",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-alias-es",
            editionId: "ol-solitude-alias-es",
            bookId: "ol-solitude-alias-es",
            workId: null,
            externalId: "ol-solitude-alias-es-1",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "Cien años de soledad",
            titleEn: "Cien años de soledad",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
            authorAr: "",
            description: "",
            descriptionEn: "",
            descriptionAr: "",
            coverUrl: "",
            language: "es",
            available: false,
            acquired: false,
            readAccess: "none",
            readProvider: null,
            hasEbook: false,
            downloadable: false,
            isEbookAvailable: false,
            confidence: 96,
            rank: 1,
            rawBook: {
              title: "Cien años de soledad",
              author: "Gabriel García Márquez",
              titleAliases: ["One Hundred Years of Solitude"],
              alternateTitles: ["One Hundred Years of Solitude"],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: "ol-solitude-create-en",
            editionId: "ol-solitude-create-en",
            bookId: "ol-solitude-create-en",
            workId: null,
            externalId: "OL27448W",
            source: "openLibrary",
            resultType: "external",
            workType: "edition",
            editionPresence: "edition",
            ebookClass: "unavailable",
            sourceClass: "external_provider",
            languageTruth: "match",
            title: "One Hundred Years of Solitude",
            titleEn: "One Hundred Years of Solitude",
            titleAr: "",
            authors: ["Gabriel García Márquez"],
            authorEn: "Gabriel García Márquez",
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
            confidence: 97,
            rank: 1,
            rawBook: {
              title: "One Hundred Years of Solitude",
              author: "Gabriel García Márquez",
            },
          },
        ],
      });

    ingestBookServerSideMock.mockImplementationOnce(async (params: {
      source: "openLibrary" | "googleBooks";
      providerExternalId: string;
      rawBook: Record<string, unknown>;
    }) => {
      const result = await materializeBookAuthority({
        source: params.source,
        authorityStatus: "canonical",
        providerExternalId: params.providerExternalId,
        rawBook: params.rawBook,
      });

      return {
        canonicalBookId: result.bookId,
        bookId: result.bookId,
        editionId: result.editionId,
        status: "CREATED" as const,
      };
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "Cien años de soledad | Gabriel García Márquez",
          "One Hundred Years of Solitude | Gabriel García Márquez",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
        message?: string;
      }>;
      summary: {
        successCount: number;
        existingCount: number;
        failedCount: number;
      };
    };

    const createdCanonicalId = response.rows[0]?.canonicalBookId;
    expect(createdCanonicalId).toBeTruthy();
    expect(unifiedSearchMock).toHaveBeenCalledTimes(4);
    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(1);
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: createdCanonicalId,
        source: "googleBooks",
      }),
      expect.objectContaining({
        row: 2,
        status: "existing",
        canonicalBookId: createdCanonicalId,
        source: "googleBooks",
      }),
    ]);
    expect(response.summary).toEqual({
      successCount: 2,
      existingCount: 1,
      failedCount: 0,
    });
    expect(getDoc(`books/${createdCanonicalId}`)?.source).toBe("googleBooks");
    expect(getDoc(`books/${createdCanonicalId}`)?.titleAliases).toEqual(
      expect.arrayContaining(["One Hundred Years of Solitude"])
    );
  });

  it("merges existing canonical duplicates into the stronger survivor before reuse", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/ac63bf05-f1a8-4a90-91e1-c31447848685",
      {
        bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
        canonicalBookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        normalizedTitle: "cien anos de soledad",
        titleEnNormalized: "cien anos de soledad",
        canonicalTitle: "Cien años de soledad",
        originalTitle: "Cien años de soledad",
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        createdAt: "2026-01-02T00:00:00.000Z",
        canonicalAuthorIds: ["author-gabo-1"],
        titleAliases: ["One Hundred Years of Solitude"],
        providerExternalIds: ["openLibrary:OL27448W"],
        identityKeys: ["canonical:gabriel garcia marquez::cien anos de soledad"],
        editionId: "openLibrary:OL27448W",
        canonicalRelations: {
          primaryEditionId: "openLibrary:OL27448W",
        },
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          mergeKeys: ["gabriel garcia marquez::cien anos de soledad"],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    setDoc(
      "books/792f007c-d24f-4166-abf1-1dc9bf3653d1",
      {
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        canonicalBookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
        normalizedTitle: "one hundred years of solitude",
        titleEnNormalized: "one hundred years of solitude",
        canonicalTitle: "One Hundred Years of Solitude",
        originalTitle: "One Hundred Years of Solitude",
        title: "One Hundred Years of Solitude",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "googleBooks",
        createdAt: "2025-01-01T00:00:00.000Z",
        canonicalAuthorIds: ["author-gabo-1"],
        titleAliases: ["Cien años de soledad"],
        providerExternalIds: ["googleBooks:gb-solitude-1"],
        identityKeys: [
          "canonical:gabriel garcia marquez::one hundred years of solitude",
          "provider:googleBooks:gb-solitude-1",
        ],
        editionId: "googleBooks:gb-solitude-1",
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
          mergeKeys: ["gabriel garcia marquez::one hundred years of solitude"],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    setDoc(
      "editions/googleBooks:gb-solitude-1",
      {
        editionId: "googleBooks:gb-solitude-1",
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        workId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
        title: "One Hundred Years of Solitude",
        authors: ["Gabriel García Márquez"],
      },
      false
    );

    setDoc(
      "book_identity/canonical:gabriel garcia marquez::one hundred years of solitude",
      {
        identityKey: "canonical:gabriel garcia marquez::one hundred years of solitude",
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
      },
      false
    );

    setDoc(
      "book_identity/provider:googleBooks:gb-solitude-1",
      {
        identityKey: "provider:googleBooks:gb-solitude-1",
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
      },
      false
    );

    setDoc(
      "book_ingestions/googleBooks:gb-solitude-1",
      {
        ingestionKey: "googleBooks:gb-solitude-1",
        source: "googleBooks",
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        editionId: "googleBooks:gb-solitude-1",
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
      },
      false
    );

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: [
          "Cien años de soledad | Gabriel García Márquez",
          "One Hundred Years of Solitude | Gabriel García Márquez",
        ].join("\n"),
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
      }>;
    };

    expect(unifiedSearchMock).not.toHaveBeenCalled();
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(response.rows).toEqual([
      expect.objectContaining({
        row: 1,
        status: "existing",
        canonicalBookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      }),
      expect.objectContaining({
        row: 2,
        status: "existing",
        canonicalBookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      }),
    ]);

    expect(getDoc("books/792f007c-d24f-4166-abf1-1dc9bf3653d1")).toMatchObject({
      mergedInto: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      mergeState: "merged_duplicate",
    });
    expect(getDoc("books/ac63bf05-f1a8-4a90-91e1-c31447848685")).toMatchObject({
      titleAliases: ["One Hundred Years of Solitude"],
      canonicalAuthorIds: ["author-gabo-1"],
      providerExternalIds: ["openLibrary:OL27448W", "googleBooks:gb-solitude-1"],
      identityKeys: [
        "canonical:gabriel garcia marquez::cien anos de soledad",
        "canonical:gabriel garcia marquez::one hundred years of solitude",
        "provider:googleBooks:gb-solitude-1",
      ],
      canonicalRelations: {
        primaryEditionId: "openLibrary:OL27448W",
      },
      workIdentity: {
        providerWorkId: "openLibrary:OL27448W",
        mergeKeys: [
          "gabriel garcia marquez::cien anos de soledad",
          "gabriel garcia marquez::one hundred years of solitude",
        ],
      },
    });
    expect(getDoc("editions/googleBooks:gb-solitude-1")).toMatchObject({
      bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      workId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      canonicalKey: "gabriel garcia marquez::cien anos de soledad",
    });
    expect(
      getDoc("book_identity/canonical:gabriel garcia marquez::one hundred years of solitude")
    ).toMatchObject({
      bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
    });
    expect(getDoc("book_identity/provider:googleBooks:gb-solitude-1")).toMatchObject({
      bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
    });
    expect(getDoc("book_ingestions/googleBooks:gb-solitude-1")).toMatchObject({
      bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      canonicalKey: "gabriel garcia marquez::cien anos de soledad",
    });
    expect(
      Array.from(store.keys()).filter((path) => path.startsWith("books/"))
    ).toHaveLength(2);
  });

  it("redirects merged duplicate lookup results to the survivor canonical work", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/ac63bf05-f1a8-4a90-91e1-c31447848685",
      {
        bookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
        canonicalBookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        normalizedTitle: "cien anos de soledad",
        titleEnNormalized: "cien anos de soledad",
        canonicalTitle: "Cien años de soledad",
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        titleAliases: ["One Hundred Years of Solitude"],
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          mergeKeys: [
            "gabriel garcia marquez::cien anos de soledad",
            "gabriel garcia marquez::one hundred years of solitude",
          ],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    setDoc(
      "books/792f007c-d24f-4166-abf1-1dc9bf3653d1",
      {
        bookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        canonicalBookId: "792f007c-d24f-4166-abf1-1dc9bf3653d1",
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
        normalizedTitle: "one hundred years of solitude",
        titleEnNormalized: "one hundred years of solitude",
        canonicalTitle: "One Hundred Years of Solitude",
        title: "One Hundred Years of Solitude",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "googleBooks",
        mergedInto: "ac63bf05-f1a8-4a90-91e1-c31447848685",
        mergeState: "merged_duplicate",
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
          mergeKeys: ["gabriel garcia marquez::one hundred years of solitude"],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "One Hundred Years of Solitude | Gabriel García Márquez",
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
      }>;
    };

    expect(unifiedSearchMock).not.toHaveBeenCalled();
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        row: 1,
        status: "existing",
        canonicalBookId: "ac63bf05-f1a8-4a90-91e1-c31447848685",
      })
    );
  });

  it("allows superadmin delete-all execution with explicit confirmation and runs the cascade", async () => {
    const callable = await getAdminDeleteAllBooksCallable();

    setDoc("books/book-1", { title: "The Trial", authorId: "author-1" }, false);
    setDoc("books/book-2", { title: "The Plague" }, false);
    setDoc("editions/edition-1", { bookId: "book-1" }, false);
    setDoc("book_identity/identity-1", { bookId: "book-1" }, false);
    setDoc("book_ingestions/ingestion-1", { bookId: "book-1" }, false);
    setDoc("reading_progress/user-1_book-1", { bookId: "book-1" }, false);
    setDoc("user_library_books/user-1_book-1", { bookId: "book-1", shelfIds: ["shelf-1"] }, false);
    setDoc("shelves/shelf-1", { entries: { "book-1": { addedAt: "ts" } }, orderedBookIds: ["book-1"] }, false);
    setDoc("quotes/quote-1", { bookId: "book-1" }, false);
    setDoc("authors/author-1", { bookIds: ["book-1", "book-9"] }, false);
    setDoc("cover_jobs/book-1", { status: "PENDING" }, false);

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        confirmation: "DELETE ALL BOOKS",
      },
    });

    expect(result).toEqual({
      deletedCount: 2,
      cascade: expect.objectContaining({
        books: 2,
        editions: 1,
        bookIdentity: 1,
        bookIngestions: 1,
        coverJobs: 1,
        readingProgress: 1,
        userLibraryBooks: 1,
        shelfRefs: 1,
        quoteLinks: 1,
        authorRefs: 1,
      }),
    });
    expect(getDoc("books/book-1")).toBeNull();
    expect(getDoc("books/book-2")).toBeNull();
    expect(getDoc("editions/edition-1")).toBeNull();
    expect(getDoc("book_identity/identity-1")).toBeNull();
    expect(getDoc("book_ingestions/ingestion-1")).toBeNull();
    expect(getDoc("reading_progress/user-1_book-1")).toBeNull();
    expect(getDoc("user_library_books/user-1_book-1")).toBeNull();
    expect(getDoc("cover_jobs/book-1")).toBeNull();
    expect(getDoc("quotes/quote-1")?.bookId).toBeNull();
    expect(getDoc("authors/author-1")?.bookIds).toEqual(["book-9"]);
    expect(getDoc("shelves/shelf-1")?.orderedBookIds).toEqual([]);
    expect(getDoc("shelves/shelf-1")?.entries).toEqual({});
  });

  it("resolves an edition id into one hard-delete plan before deleting the canonical work graph", async () => {
    const callable = await getAdminDeleteCanonicalBookCallable();

    setDoc(
      "books/book-1",
      {
        title: "The Trial",
        authorId: "author-1",
        canonicalAuthorIds: ["author-1"],
        ebookAttachmentId: "att-1",
        storagePath: "books/book-1/original/trial.epub",
      },
      false
    );
    setDoc("editions/edition-1", { bookId: "book-1", workId: "book-1", ebookAttachmentId: "att-1" }, false);
    setDoc("editions/edition-2", { workId: "book-1" }, false);
    setDoc("attachments/att-1", { bookId: "book-1", parentId: "edition-1", storagePath: "ebooks/book-1/canonical.epub" }, false);
    setDoc("_attachment_upload_intents/att-1", { storagePath: "attachments/user/att-1.epub" }, false);
    setDoc("books/book-1/reviews/user-1", { bookId: "book-1", text: "great" }, false);
    setDoc("books/book-1/ratings/user-1", { bookId: "book-1", rating: 5 }, false);
    setDoc("user_reviews/user-1_book-1", { bookId: "book-1" }, false);
    setDoc(
      "reader_manifests/book-1",
      {
        locationMap: { docPath: "reader_location_map/book-1" },
        searchIndex: { docPath: "reader_search_index/book-1" },
        highlightAnchors: { docPath: "reader_highlight_anchors/book-1" },
      },
      false
    );
    setDoc("reader_location_map/book-1", { bookId: "book-1" }, false);
    setDoc("reader_search_index/book-1", { bookId: "book-1" }, false);
    setDoc("reader_highlight_anchors/book-1", { bookId: "book-1" }, false);
    setDoc("reader_highlights/user-1_book-1_h1", { bookId: "book-1" }, false);
    setDoc("reader_bookmarks/user-1_book-1_b1", { bookId: "book-1" }, false);
    setDoc("reader_events/event-1", { bookId: "book-1" }, false);
    setDoc("reader_sync_idempotency/id-1", { bookId: "book-1" }, false);
    setDoc("book_stats/book-1", { bookId: "book-1" }, false);

    storageFiles.add("books/book-1/covers/medium.jpg");
    storageFiles.add("books/book-1/original/trial.epub");
    storageFiles.add("ebooks/book-1/canonical.epub");
    storageFiles.add("attachments/user/att-1.epub");

    const preview = (await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        bookId: "edition-1",
        dryRun: true,
      },
    })) as {
      bookId: string;
      deleted: boolean;
      dryRun: boolean;
      resolved: boolean;
      inputType: string;
      collectionCounts: Record<string, number>;
      storageCounts: Record<string, number>;
      deleteGraph: {
        editionIds: string[];
        attachmentIds: string[];
      };
    };

    expect(preview).toEqual(
      expect.objectContaining({
        bookId: "book-1",
        deleted: false,
        dryRun: true,
        resolved: true,
        inputType: "edition",
      })
    );
    expect(preview.collectionCounts).toMatchObject({
      books: 1,
      editions: 2,
      attachments: 1,
      "_attachment_upload_intents": 1,
      "books.reviews": 1,
      "books.ratings": 1,
      user_reviews: 1,
      reader_manifests: 1,
    });
    expect(preview.storageCounts).toMatchObject({
      coverStorageFiles: 1,
      originalStorageFiles: 1,
      ebookStorageFiles: 1,
      attachmentStorageFiles: 1,
    });
    expect(preview.deleteGraph.editionIds).toEqual(expect.arrayContaining(["edition-1", "edition-2"]));
    expect(preview.deleteGraph.attachmentIds).toEqual(["att-1"]);
    expect(getDoc("books/book-1")).not.toBeNull();
    expect(getDoc("editions/edition-1")).not.toBeNull();

    const result = (await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        bookId: "edition-1",
        confirmation: "book-1",
      },
    })) as {
      bookId: string;
      deleted: boolean;
    };

    expect(result).toEqual(
      expect.objectContaining({
        bookId: "book-1",
        deleted: true,
      })
    );
    expect(getDoc("books/book-1")).toBeNull();
    expect(getDoc("editions/edition-1")).toBeNull();
    expect(getDoc("editions/edition-2")).toBeNull();
    expect(getDoc("attachments/att-1")).toBeNull();
    expect(getDoc("_attachment_upload_intents/att-1")).toBeNull();
    expect(getDoc("books/book-1/reviews/user-1")).toBeNull();
    expect(getDoc("books/book-1/ratings/user-1")).toBeNull();
    expect(getDoc("user_reviews/user-1_book-1")).toBeNull();
    expect(getDoc("reader_manifests/book-1")).toBeNull();
    expect(getDoc("reader_location_map/book-1")).toBeNull();
    expect(getDoc("reader_search_index/book-1")).toBeNull();
    expect(getDoc("reader_highlight_anchors/book-1")).toBeNull();
    expect(getDoc("reader_highlights/user-1_book-1_h1")).toBeNull();
    expect(getDoc("reader_bookmarks/user-1_book-1_b1")).toBeNull();
    expect(getDoc("reader_events/event-1")).toBeNull();
    expect(getDoc("reader_sync_idempotency/id-1")).toBeNull();
    expect(getDoc("book_stats/book-1")).toBeNull();
    expect(storageFiles.has("books/book-1/covers/medium.jpg")).toBe(false);
    expect(storageFiles.has("books/book-1/original/trial.epub")).toBe(false);
    expect(storageFiles.has("ebooks/book-1/canonical.epub")).toBe(false);
    expect(storageFiles.has("attachments/user/att-1.epub")).toBe(false);
  });

  it("keeps stronger existing provider metadata and freezes title, author, canonical key, and language on later weaker enrichment", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    const first = await materializeBookAuthority({
      source: "googleBooks",
      authorityStatus: "canonical",
      providerExternalId: "gb_trial_1",
      rawBook: {
        title: "The Trial",
        titleEn: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        language: "en",
        isbn13: "9780141182902",
        description:
          "Josef K. wakes on his thirtieth birthday to find himself arrested without explanation, then spends the novel trapped inside a bureaucracy whose rituals turn everyday life into punishment, doubt, and metaphysical terror.",
      },
      coverCandidates: ["https://example.com/google-trial.jpg"],
      createEdition: true,
      ingestionKey: "googleBooks:gb_trial_1",
    });

    await materializeBookAuthority({
      source: "openLibrary",
      authorityStatus: "canonical",
      providerExternalId: "OLTRIAL1M",
      rawBook: {
        title: "Der Process",
        titleEn: "Der Process",
        author: "F. Kafka",
        authorEn: "F. Kafka",
        authors: ["F. Kafka"],
        language: "de",
        isbn13: "9780141182902",
        description:
          "This open library summary is long enough to pass validation, but it should still lose because the existing Google Books description already carries stronger accepted authority for this canonical row.",
      },
      coverCandidates: ["https://example.com/openlibrary-trial.jpg"],
      createEdition: true,
      ingestionKey: "openLibrary:OLTRIAL1M",
    });

    const book = getDoc(`books/${first.bookId}`);
    const coverJob = getDoc(`cover_jobs/${first.bookId}`);

    expect(book?.title).toBe("The Trial");
    expect(book?.author).toBe("Franz Kafka");
    expect(book?.canonicalKey).toBe("franz kafka::the trial");
    expect(book?.language).toBe("en");
    expect(book?.descriptionSource).toBe("googleBooks");
    expect(book?.descriptionAuthority).toBe(80);
    expect(book?.coverSource).toBe("googleBooks");
    expect(book?.coverAuthority).toBe(90);
    expect(book?.coverUrl).toBe("https://example.com/google-trial.jpg");
    expect(coverJob?.candidateUrls).toEqual(["https://example.com/google-trial.jpg"]);
  });

  it("allows stronger manual admin metadata to replace weaker provider metadata without changing frozen identity fields", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();
    const adminCallable = await getAdminCreateCanonicalBookCallable();

    const first = await materializeBookAuthority({
      source: "googleBooks",
      authorityStatus: "canonical",
      providerExternalId: "gb_plague_1",
      rawBook: {
        title: "The Plague",
        titleEn: "The Plague",
        author: "Albert Camus",
        authorEn: "Albert Camus",
        authors: ["Albert Camus"],
        language: "en",
        isbn13: "9780679720218",
        description:
          "Oran is sealed by epidemic and Camus follows doctors, clerks, priests, and exiles as they discover that solidarity, routine, and moral clarity are all tested by the same relentless contagion.",
      },
      coverCandidates: ["https://example.com/google-plague.jpg"],
      createEdition: true,
      ingestionKey: "googleBooks:gb_plague_1",
    });

    await adminCallable.run({
      auth: { uid: "superadmin-1" },
      data: {
        title: "La Peste",
        author: "Albert Camus",
        language: "fr",
        isbn: "9780679720218",
        description:
          "A stronger manual canonical note now replaces the provider description with stable editorial copy that exceeds the minimum threshold and should become the accepted authority for this canonical book.",
        coverUrl: "https://example.com/manual-plague.jpg",
      },
    });

    const book = getDoc(`books/${first.bookId}`);
    const coverJob = getDoc(`cover_jobs/${first.bookId}`);

    expect(book?.title).toBe("The Plague");
    expect(book?.author).toBe("Albert Camus");
    expect(book?.canonicalKey).toBe("albert camus::the plague");
    expect(book?.language).toBe("en");
    expect(book?.descriptionSource).toBe("manualAdmin");
    expect(book?.descriptionAuthority).toBe(100);
    expect(book?.coverSource).toBe("manualAdmin");
    expect(book?.coverAuthority).toBe(100);
    expect(book?.coverUrl).toBe("https://example.com/manual-plague.jpg");
    expect(book?.coverState).toBe("PENDING");
    expect(coverJob?.candidateUrls).toContain("https://example.com/manual-plague.jpg");
  });

  it("rejects provider work reuse when the provider work id matches but the author differs", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    const first = await materializeBookAuthority({
      source: "openLibrary",
      authorityStatus: "canonical",
      providerExternalId: "OLLOCK1W",
      rawBook: {
        title: "Pride and Prejudice",
        author: "Jane Austen",
        authorEn: "Jane Austen",
        authors: ["Jane Austen"],
        language: "en",
        openLibraryEditionId: "OLLOCK1M",
      },
      ingestionKey: "openLibrary:OLLOCK1W:first",
    });

    const second = await materializeBookAuthority({
      source: "openLibrary",
      authorityStatus: "canonical",
      providerExternalId: "OLLOCK1W",
      rawBook: {
        title: "Pride and Prejudice",
        author: "Charlotte Bronte",
        authorEn: "Charlotte Bronte",
        authors: ["Charlotte Bronte"],
        language: "en",
        openLibraryEditionId: "OLLOCK2M",
      },
      ingestionKey: "openLibrary:OLLOCK1W:second",
    });

    expect(second.bookId).not.toBe(first.bookId);
    expect(getDoc(`books/${second.bookId}`)?.author).toBe("Charlotte Bronte");
    expect(getDoc("book_identity/provider:openLibrary:OLLOCK1W")?.bookId).toBe(first.bookId);
  });

  it("still reuses the existing book when provider work id and author both match", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    const first = await materializeBookAuthority({
      source: "openLibrary",
      authorityStatus: "canonical",
      providerExternalId: "OLLOCK2W",
      rawBook: {
        title: "Pride and Prejudice",
        author: "Jane Austen",
        authorEn: "Jane Austen",
        authors: ["Jane Austen"],
        language: "en",
        openLibraryEditionId: "OLLOCK3M",
      },
      ingestionKey: "openLibrary:OLLOCK2W:first",
    });

    const second = await materializeBookAuthority({
      source: "openLibrary",
      authorityStatus: "canonical",
      providerExternalId: "OLLOCK2W",
      rawBook: {
        title: "Pride & Prejudice",
        author: "Jane Austen",
        authorEn: "Jane Austen",
        authors: ["Jane Austen"],
        language: "en",
        openLibraryEditionId: "OLLOCK4M",
      },
      ingestionKey: "openLibrary:OLLOCK2W:second",
    });

    expect(second.bookId).toBe(first.bookId);
    expect(getDoc("book_identity/provider:openLibrary:OLLOCK2W")?.bookId).toBe(first.bookId);
  });

  it("rejects manual isbn fallback reuse when the isbn matches but the author differs", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    const first = await materializeBookAuthority({
      source: "booktown_canonical",
      authorityStatus: "canonical",
      rawBook: {
        title: "Collected Poems",
        author: "Author One",
        authorEn: "Author One",
        authors: ["Author One"],
        language: "en",
        isbn13: "9780307474728",
      },
      createEdition: true,
      ingestionKey: "canonical:isbn-lock:first",
    });

    const second = await materializeBookAuthority({
      source: "booktown_canonical",
      authorityStatus: "canonical",
      rawBook: {
        title: "Collected Poems",
        author: "Author Two",
        authorEn: "Author Two",
        authors: ["Author Two"],
        language: "en",
        isbn13: "9780307474728",
      },
      createEdition: true,
      ingestionKey: "canonical:isbn-lock:second",
    });

    expect(second.bookId).not.toBe(first.bookId);
    expect(getDoc(`books/${second.bookId}`)?.author).toBe("Author Two");
  });

  it("still attaches through manual isbn fallback when the isbn and author both match", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    const first = await materializeBookAuthority({
      source: "booktown_canonical",
      authorityStatus: "canonical",
      rawBook: {
        title: "Collected Poems",
        author: "Author One",
        authorEn: "Author One",
        authors: ["Author One"],
        language: "en",
        isbn13: "9780307474728",
      },
      createEdition: true,
      ingestionKey: "canonical:isbn-attach:first",
    });

    const second = await materializeBookAuthority({
      source: "booktown_canonical",
      authorityStatus: "canonical",
      rawBook: {
        title: "Collected Poems Anniversary Edition",
        author: "Author One",
        authorEn: "Author One",
        authors: ["Author One"],
        language: "en",
        isbn13: "9780307474728",
      },
      createEdition: true,
      ingestionKey: "canonical:isbn-attach:second",
    });

    expect(second.bookId).toBe(first.bookId);
  });

  it("rejects originalTitle reuse when the translation candidate has a different author", async () => {
    const callable = await getAdminSeedCanonicalBatchCallable();

    setDoc(
      "books/solitude-original-title-lock-1",
      {
        bookId: "solitude-original-title-lock-1",
        canonicalBookId: "solitude-original-title-lock-1",
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        normalizedTitle: "cien anos de soledad",
        titleEnNormalized: "cien anos de soledad",
        canonicalTitle: "Cien años de soledad",
        originalTitle: "Cien años de soledad",
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        authorEn: "Gabriel García Márquez",
        authorNamesNormalized: ["gabriel garcia marquez"],
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        source: "openLibrary",
        workIdentity: {
          canonicalKey: "gabriel garcia marquez::cien anos de soledad",
          mergeKeys: ["gabriel garcia marquez::cien anos de soledad"],
          providerWorkId: "openLibrary:OL27448W",
        },
      },
      false
    );

    unifiedSearchMock.mockResolvedValueOnce({
      results: [
        {
          id: "ol-solitude-original-title-mismatch",
          editionId: "ol-solitude-original-title-mismatch",
          bookId: "ol-solitude-original-title-mismatch",
          workId: null,
          externalId: "OL99998W",
          source: "openLibrary",
          resultType: "external",
          workType: "edition",
          editionPresence: "edition",
          ebookClass: "unavailable",
          sourceClass: "external_provider",
          languageTruth: "match",
          title: "One Hundred Years of Solitude",
          titleEn: "One Hundred Years of Solitude",
          titleAr: "",
          authors: ["Isabel Allende"],
          authorEn: "Isabel Allende",
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
          confidence: 95,
          rank: 1,
          rawBook: {
            key: "/works/OL99998W",
            openLibraryWorkId: "OL99998W",
            title: "One Hundred Years of Solitude",
            originalTitle: "Cien años de soledad",
            author: "Isabel Allende",
          },
        },
      ],
    });

    ingestBookServerSideMock.mockResolvedValueOnce({
      canonicalBookId: "solitude-original-title-lock-2",
      bookId: "solitude-original-title-lock-2",
      editionId: "openLibrary:OL99998W",
      status: "CREATED",
    });

    const result = await callable.run({
      auth: { uid: "superadmin-1" },
      data: {
        rows: "One Hundred Years of Solitude | Isabel Allende",
      },
    });

    const response = result as {
      rows: Array<{
        row: number;
        status: "created" | "existing" | "failed";
        canonicalBookId?: string;
      }>;
    };

    expect(ingestBookServerSideMock).toHaveBeenCalledTimes(1);
    expect(response.rows[0]).toEqual(
      expect.objectContaining({
        row: 1,
        status: "created",
        canonicalBookId: "solitude-original-title-lock-2",
      })
    );
  });

  it("LOC enriches missing restricted fields on an existing canonical record", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/loc-canonical-1",
      {
        bookId: "loc-canonical-1",
        canonicalBookId: "loc-canonical-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "franz kafka::the trial",
        canonicalTitle: "The Trial",
        title: "The Trial",
        titleEn: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        authorNamesNormalized: ["franz kafka"],
        editionId: "loc-edition-1",
        canonicalRelations: {
          primaryEditionId: "loc-edition-1",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/loc-edition-1",
      {
        editionId: "loc-edition-1",
        bookId: "loc-canonical-1",
        workId: "loc-canonical-1",
        title: "The Trial",
        authors: ["Franz Kafka"],
        authorEn: "Franz Kafka",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    const result = await materializeBookAuthority({
      source: "loc" as any,
      authorityStatus: "canonical",
      preferredBookId: "loc-canonical-1",
      providerExternalId: "loc-control-1",
      rawBook: {
        title: "The Trial",
        originalTitle: "Der Process",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        language: "de",
        publicationYear: 1925,
        publisher: "Schocken Books",
      },
      ingestionKey: "loc:loc-control-1",
    });

    const book = getDoc("books/loc-canonical-1");
    const edition = getDoc("editions/loc-edition-1");
    const ingestion = getDoc("book_ingestions/loc:loc-control-1");

    expect(result.bookId).toBe("loc-canonical-1");
    expect(book?.originalTitle).toBe("Der Process");
    expect(book?.locControlNumber).toBe("loc-control-1");
    expect(book?.publicationYear).toBe(1925);
    expect(book?.language).toBe("de");
    expect(edition?.publisher).toBe("Schocken Books");
    expect(edition?.publicationYear).toBe(1925);
    expect(ingestion?.bookId).toBe("loc-canonical-1");
    expect(ingestion?.source).toBe("loc");
  });

  it("LOC does not create a canonical work when no survivor exists", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    await expect(
      materializeBookAuthority({
        source: "loc" as any,
        authorityStatus: "canonical",
        providerExternalId: "loc-missing-1",
        rawBook: {
          title: "Authority Test",
          originalTitle: "Authority Test Original",
          author: "BookTown",
          authorEn: "BookTown",
          authors: ["BookTown"],
          language: "en",
        },
      })
    ).rejects.toThrow("[PROVIDER_ROLE] loc may enrich only an existing canonical book.");
  });

  it("LOC cannot override stronger Open Library fields", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/loc-canonical-strong",
      {
        bookId: "loc-canonical-strong",
        canonicalBookId: "loc-canonical-strong",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "gabriel garcia marquez::cien anos de soledad",
        canonicalTitle: "One Hundred Years of Solitude",
        originalTitle: "Cien años de soledad",
        title: "One Hundred Years of Solitude",
        titleEn: "One Hundred Years of Solitude",
        author: "Gabriel Garcia Marquez",
        authorEn: "Gabriel Garcia Marquez",
        authors: ["Gabriel Garcia Marquez"],
        authorNamesNormalized: ["gabriel garcia marquez"],
        language: "es",
        publicationYear: 1967,
        editionId: "loc-edition-strong",
        canonicalRelations: {
          primaryEditionId: "loc-edition-strong",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/loc-edition-strong",
      {
        editionId: "loc-edition-strong",
        bookId: "loc-canonical-strong",
        workId: "loc-canonical-strong",
        title: "One Hundred Years of Solitude",
        authors: ["Gabriel Garcia Marquez"],
        authorEn: "Gabriel Garcia Marquez",
        publisher: "Editorial Sudamericana",
        publicationYear: 1967,
        language: "es",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "loc" as any,
      authorityStatus: "canonical",
      preferredBookId: "loc-canonical-strong",
      providerExternalId: "loc-strong-1",
      rawBook: {
        title: "One Hundred Years of Solitude",
        originalTitle: "One Hundred Years of Solitude",
        author: "Gabriel Garcia Marquez",
        authorEn: "Gabriel Garcia Marquez",
        authors: ["Gabriel Garcia Marquez"],
        language: "en",
        publicationYear: 1970,
        publisher: "Another Publisher",
      },
    });

    const book = getDoc("books/loc-canonical-strong");
    const edition = getDoc("editions/loc-edition-strong");

    expect(book?.originalTitle).toBe("Cien años de soledad");
    expect(book?.language).toBe("es");
    expect(book?.publicationYear).toBe(1967);
    expect(book?.locControlNumber).toBe("loc-strong-1");
    expect(edition?.publisher).toBe("Editorial Sudamericana");
    expect(edition?.publicationYear).toBe(1967);
    expect(edition?.language).toBe("es");
  });

  it("LOC cannot bypass author lock", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/loc-canonical-author-lock",
      {
        bookId: "loc-canonical-author-lock",
        canonicalBookId: "loc-canonical-author-lock",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "author one::authority test",
        canonicalTitle: "Authority Test",
        title: "Authority Test",
        titleEn: "Authority Test",
        author: "Author One",
        authorEn: "Author One",
        authors: ["Author One"],
        authorNamesNormalized: ["author one"],
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await expect(
      materializeBookAuthority({
        source: "loc" as any,
        authorityStatus: "canonical",
        preferredBookId: "loc-canonical-author-lock",
        providerExternalId: "loc-author-lock-1",
        rawBook: {
          title: "Authority Test",
          originalTitle: "Authority Test Original",
          author: "Author Two",
          authorEn: "Author Two",
          authors: ["Author Two"],
          language: "en",
        },
      })
    ).rejects.toThrow("[PROVIDER_ROLE] loc author lock failed for restricted enrichment.");
  });

  it("WorldCat adds an OCLC number to an existing canonical record", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/worldcat-canonical-1",
      {
        bookId: "worldcat-canonical-1",
        canonicalBookId: "worldcat-canonical-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "virginia woolf::mrs dalloway",
        canonicalTitle: "Mrs Dalloway",
        title: "Mrs Dalloway",
        titleEn: "Mrs Dalloway",
        author: "Virginia Woolf",
        authorEn: "Virginia Woolf",
        authors: ["Virginia Woolf"],
        authorNamesNormalized: ["virginia woolf"],
        editionId: "worldcat-edition-1",
        canonicalRelations: {
          primaryEditionId: "worldcat-edition-1",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/worldcat-edition-1",
      {
        editionId: "worldcat-edition-1",
        bookId: "worldcat-canonical-1",
        workId: "worldcat-canonical-1",
        title: "Mrs Dalloway",
        authors: ["Virginia Woolf"],
        authorEn: "Virginia Woolf",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    const result = await materializeBookAuthority({
      source: "worldcat" as any,
      authorityStatus: "canonical",
      preferredBookId: "worldcat-canonical-1",
      providerExternalId: "1234567",
      rawBook: {
        title: "Mrs Dalloway",
        author: "Virginia Woolf",
        authorEn: "Virginia Woolf",
        authors: ["Virginia Woolf"],
        oclcNumber: "1234567",
        editionCount: 14,
        format: "paperback",
      },
      ingestionKey: "worldcat:1234567",
    });

    const book = getDoc("books/worldcat-canonical-1");
    const edition = getDoc("editions/worldcat-edition-1");
    const ingestion = getDoc("book_ingestions/worldcat:1234567");

    expect(result.bookId).toBe("worldcat-canonical-1");
    expect(book?.oclcNumber).toBe("1234567");
    expect(book?.editionCount).toBe(14);
    expect(book?.provenance).toMatchObject({
      weightedBookEvidence: {
        worldcat: {
          source: "worldcat",
          confidence: "medium",
          oclcNumber: "1234567",
          editionCount: 14,
          format: "paperback",
        },
      },
    });
    expect(edition?.format).toBe("paperback");
    expect(ingestion?.bookId).toBe("worldcat-canonical-1");
    expect(ingestion?.source).toBe("worldcat");
  });

  it("WorldCat adds missing publicationYear safely", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/worldcat-canonical-2",
      {
        bookId: "worldcat-canonical-2",
        canonicalBookId: "worldcat-canonical-2",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "george orwell::nineteen eighty four",
        canonicalTitle: "Nineteen Eighty-Four",
        title: "Nineteen Eighty-Four",
        titleEn: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        authorNamesNormalized: ["george orwell"],
        editionId: "worldcat-edition-2",
        canonicalRelations: {
          primaryEditionId: "worldcat-edition-2",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/worldcat-edition-2",
      {
        editionId: "worldcat-edition-2",
        bookId: "worldcat-canonical-2",
        workId: "worldcat-canonical-2",
        title: "Nineteen Eighty-Four",
        authors: ["George Orwell"],
        authorEn: "George Orwell",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "worldcat" as any,
      authorityStatus: "canonical",
      preferredBookId: "worldcat-canonical-2",
      providerExternalId: "7654321",
      rawBook: {
        title: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        publicationYear: 1949,
      },
    });

    const book = getDoc("books/worldcat-canonical-2");
    const edition = getDoc("editions/worldcat-edition-2");

    expect(book?.publicationYear).toBe(1949);
    expect(edition?.publicationYear).toBe(1949);
  });

  it("WorldCat does not create a canonical work when no survivor exists", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    await expect(
      materializeBookAuthority({
        source: "worldcat" as any,
        authorityStatus: "canonical",
        providerExternalId: "wc-missing-1",
        rawBook: {
          title: "Authority Test",
          author: "BookTown",
          authorEn: "BookTown",
          authors: ["BookTown"],
          oclcNumber: "5550001",
        },
      })
    ).rejects.toThrow("[PROVIDER_ROLE] worldcat may enrich only an existing canonical book.");
  });

  it("WorldCat cannot override stronger existing fields", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/worldcat-canonical-3",
      {
        bookId: "worldcat-canonical-3",
        canonicalBookId: "worldcat-canonical-3",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "gabriel garcia marquez::one hundred years of solitude",
        canonicalTitle: "One Hundred Years of Solitude",
        title: "One Hundred Years of Solitude",
        titleEn: "One Hundred Years of Solitude",
        author: "Gabriel Garcia Marquez",
        authorEn: "Gabriel Garcia Marquez",
        authors: ["Gabriel Garcia Marquez"],
        authorNamesNormalized: ["gabriel garcia marquez"],
        oclcNumber: "1111111",
        language: "es",
        publicationYear: 1967,
        editionId: "worldcat-edition-3",
        canonicalRelations: {
          primaryEditionId: "worldcat-edition-3",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/worldcat-edition-3",
      {
        editionId: "worldcat-edition-3",
        bookId: "worldcat-canonical-3",
        workId: "worldcat-canonical-3",
        title: "One Hundred Years of Solitude",
        authors: ["Gabriel Garcia Marquez"],
        authorEn: "Gabriel Garcia Marquez",
        publisher: "Editorial Sudamericana",
        publicationYear: 1967,
        language: "es",
        format: "hardcover",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "worldcat" as any,
      authorityStatus: "canonical",
      preferredBookId: "worldcat-canonical-3",
      providerExternalId: "wc-strong-1",
      rawBook: {
        title: "One Hundred Years of Solitude",
        author: "Gabriel Garcia Marquez",
        authorEn: "Gabriel Garcia Marquez",
        authors: ["Gabriel Garcia Marquez"],
        oclcNumber: "2222222",
        language: "en",
        publicationYear: 1970,
        publisher: "Another Publisher",
        format: "paperback",
      },
    });

    const book = getDoc("books/worldcat-canonical-3");
    const edition = getDoc("editions/worldcat-edition-3");

    expect(book?.oclcNumber).toBe("1111111");
    expect(book?.language).toBe("es");
    expect(book?.publicationYear).toBe(1967);
    expect(edition?.publisher).toBe("Editorial Sudamericana");
    expect(edition?.publicationYear).toBe(1967);
    expect(edition?.language).toBe("es");
    expect(edition?.format).toBe("hardcover");
  });

  it("initializes fieldConfidence from restricted book evidence without changing authority behavior", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/ledger-loc-1",
      {
        bookId: "ledger-loc-1",
        canonicalBookId: "ledger-loc-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "franz kafka::the trial",
        canonicalTitle: "The Trial",
        title: "The Trial",
        titleEn: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        authorNamesNormalized: ["franz kafka"],
        editionId: "ledger-loc-edition-1",
        canonicalRelations: {
          primaryEditionId: "ledger-loc-edition-1",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/ledger-loc-edition-1",
      {
        editionId: "ledger-loc-edition-1",
        bookId: "ledger-loc-1",
        workId: "ledger-loc-1",
        title: "The Trial",
        authors: ["Franz Kafka"],
        authorEn: "Franz Kafka",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "loc" as any,
      authorityStatus: "canonical",
      preferredBookId: "ledger-loc-1",
      providerExternalId: "loc-ledger-1",
      rawBook: {
        title: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        language: "de",
        publicationYear: 1925,
      },
    });

    const book = getDoc("books/ledger-loc-1");

    expect(book?.publicationYear).toBe(1925);
    expect(book?.language).toBe("de");
    expect(book?.provenance).toMatchObject({
      fieldConfidence: {
        publicationYear: {
          source: "loc",
          confidence: "restricted",
          supportingSources: [],
        },
        language: {
          source: "loc",
          confidence: "restricted",
          supportingSources: [],
        },
      },
    });
  });

  it("keeps restricted ledger source while direct source adds support for the same value", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/ledger-direct-support-1",
      {
        bookId: "ledger-direct-support-1",
        canonicalBookId: "ledger-direct-support-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "franz kafka::the trial",
        canonicalTitle: "The Trial",
        title: "The Trial",
        titleEn: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        authorNamesNormalized: ["franz kafka"],
        publicationYear: 1925,
        provenance: {
          fieldConfidence: {
            publicationYear: {
              source: "loc",
              confidence: "restricted",
              supportingSources: [],
            },
          },
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "googleBooks" as any,
      authorityStatus: "canonical",
      preferredBookId: "ledger-direct-support-1",
      providerExternalId: "gb-ledger-1",
      rawBook: {
        id: "gb-ledger-1",
        externalId: "gb-ledger-1",
        title: "The Trial",
        author: "Franz Kafka",
        authorEn: "Franz Kafka",
        authors: ["Franz Kafka"],
        publicationYear: 1925,
        language: "de",
      },
    });

    const book = getDoc("books/ledger-direct-support-1");

    expect(book?.provenance).toMatchObject({
      fieldConfidence: {
        publicationYear: {
          source: "loc",
          confidence: "restricted",
          supportingSources: ["googleBooks"],
        },
      },
    });
  });

  it("adds weighted supportingSources only when the weighted value matches the surviving field", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/ledger-weighted-support-1",
      {
        bookId: "ledger-weighted-support-1",
        canonicalBookId: "ledger-weighted-support-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "george orwell::nineteen eighty four",
        canonicalTitle: "Nineteen Eighty-Four",
        title: "Nineteen Eighty-Four",
        titleEn: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        authorNamesNormalized: ["george orwell"],
        publicationYear: 1949,
        provenance: {
          fieldConfidence: {
            publicationYear: {
              source: "openLibrary",
              confidence: "direct",
              supportingSources: [],
            },
          },
        },
        editionId: "ledger-weighted-edition-1",
        canonicalRelations: {
          primaryEditionId: "ledger-weighted-edition-1",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/ledger-weighted-edition-1",
      {
        editionId: "ledger-weighted-edition-1",
        bookId: "ledger-weighted-support-1",
        workId: "ledger-weighted-support-1",
        title: "Nineteen Eighty-Four",
        authors: ["George Orwell"],
        authorEn: "George Orwell",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "worldcat" as any,
      authorityStatus: "canonical",
      preferredBookId: "ledger-weighted-support-1",
      providerExternalId: "wc-ledger-1",
      rawBook: {
        title: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        publicationYear: 1949,
      },
    });

    const book = getDoc("books/ledger-weighted-support-1");

    expect(book?.provenance).toMatchObject({
      fieldConfidence: {
        publicationYear: {
          source: "openLibrary",
          confidence: "direct",
          supportingSources: ["worldcat"],
        },
      },
    });
  });

  it("leaves stronger fieldConfidence untouched when weaker evidence conflicts", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    setDoc(
      "books/ledger-weighted-conflict-1",
      {
        bookId: "ledger-weighted-conflict-1",
        canonicalBookId: "ledger-weighted-conflict-1",
        authorityStatus: "canonical",
        workType: "canonical",
        canonicalLocked: true,
        canonicalKey: "george orwell::nineteen eighty four",
        canonicalTitle: "Nineteen Eighty-Four",
        title: "Nineteen Eighty-Four",
        titleEn: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        authorNamesNormalized: ["george orwell"],
        publicationYear: 1949,
        provenance: {
          fieldConfidence: {
            publicationYear: {
              source: "openLibrary",
              confidence: "direct",
              supportingSources: [],
            },
          },
        },
        editionId: "ledger-weighted-conflict-edition-1",
        canonicalRelations: {
          primaryEditionId: "ledger-weighted-conflict-edition-1",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "editions/ledger-weighted-conflict-edition-1",
      {
        editionId: "ledger-weighted-conflict-edition-1",
        bookId: "ledger-weighted-conflict-1",
        workId: "ledger-weighted-conflict-1",
        title: "Nineteen Eighty-Four",
        authors: ["George Orwell"],
        authorEn: "George Orwell",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );

    await materializeBookAuthority({
      source: "worldcat" as any,
      authorityStatus: "canonical",
      preferredBookId: "ledger-weighted-conflict-1",
      providerExternalId: "wc-ledger-2",
      rawBook: {
        title: "Nineteen Eighty-Four",
        author: "George Orwell",
        authorEn: "George Orwell",
        authors: ["George Orwell"],
        publicationYear: 1950,
      },
    });

    const book = getDoc("books/ledger-weighted-conflict-1");

    expect(book?.publicationYear).toBe(1949);
    expect(book?.provenance).toMatchObject({
      fieldConfidence: {
        publicationYear: {
          source: "openLibrary",
          confidence: "direct",
          supportingSources: [],
        },
      },
    });
  });

  it("blocks VIAF from entering the canonical book write path", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    await expect(
      materializeBookAuthority({
        source: "viaf" as any,
        authorityStatus: "canonical",
        providerExternalId: "viaf-control-1",
        rawBook: {
          title: "Authority Test",
          author: "BookTown",
          authorEn: "BookTown",
          authors: ["BookTown"],
          language: "en",
        },
      })
    ).rejects.toThrow("[PROVIDER_ROLE] viaf may not enter canonical book write path.");
  });

  it("blocks ebook-only providers from altering canonical work identity", async () => {
    const materializeBookAuthority = await getMaterializeBookAuthorityFn();

    await expect(
      materializeBookAuthority({
        source: "gutenberg" as any,
        authorityStatus: "canonical",
        providerExternalId: "gut-control-1",
        rawBook: {
          title: "Authority Test",
          author: "BookTown",
          authorEn: "BookTown",
          authors: ["BookTown"],
          language: "en",
        },
      })
    ).rejects.toThrow("[PROVIDER_ROLE] gutenberg may not enter canonical book write path.");
  });
});
