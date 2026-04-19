import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let uuidCounter = 0;
let timestampCounter = 0;

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
  doc(id: string): MockDocRef {
    return new MockDocRef(this.name, id);
  }
}

class MockTransaction {
  private hasWritten = false;

  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    if (this.hasWritten) {
      throw new Error("Firestore transactions require all reads to be executed before all writes.");
    }
    return new MockDocSnapshot(ref.path);
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
    firestore: () => firestoreMock,
    storage: () => ({
      bucket: () => ({
        name: "booktown-test.appspot.com",
      }),
    }),
  },
}));

async function getIngestBookCallable() {
  const mod = await import("./ingestBook");
  return mod.ingestBook as any;
}

async function callIngest(overrides: Record<string, unknown> = {}) {
  const ingestBookCallable = await getIngestBookCallable();
  const result = await ingestBookCallable.run({
    auth: { uid: "test-user" },
    data: {
      providerExternalId: "gb_abc123",
      source: "googleBooks",
      rawBook: {
        id: "abc123",
        externalId: "abc123",
        source: "googleBooks",
        title: "The Deterministic Book",
        authors: ["Author One"],
        language: "en",
        industryIdentifiers: [
          {
            type: "ISBN_13",
            identifier: "9780747532743",
          },
        ],
        imageLinks: {
          thumbnail: "https://example.com/cover.jpg",
        },
        ...overrides,
      },
    },
  });

  return result as {
    canonicalBookId: string;
    bookId: string;
    editionId: string;
    status: string;
  };
}

describe("ingestBook v2 smoke", () => {
  beforeEach(() => {
    store.clear();
    uuidCounter = 0;
    timestampCounter = 0;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("identity-lock idempotency: same provider+externalId yields same bookId across calls", async () => {
    const first = await callIngest();
    const second = await callIngest({
      title: "The Deterministic Book (Updated Metadata)",
    });

    expect(first.canonicalBookId).toBe(first.bookId);
    expect(second.canonicalBookId).toBe(second.bookId);
    expect(first.bookId).toBe(second.bookId);
    expect(first.editionId).toBe(second.editionId);

    const providerIdentity = getDoc("book_identity/provider:googleBooks:abc123");
    const isbnIdentity = getDoc("book_identity/isbn13:9780747532743");
    const ingestion = getDoc("book_ingestions/googleBooks:abc123");
    const book = getDoc(`books/${first.bookId}`);

    expect(providerIdentity?.bookId).toBe(first.bookId);
    expect(isbnIdentity).toBeNull();
    expect(ingestion?.bookId).toBe(first.bookId);
    expect(ingestion?.state).toBe("COMPLETE");
    expect(book?.canonicalTitle).toBe("The Deterministic Book");
    expect(book?.originalTitle).toBe("The Deterministic Book");
    expect(book?.originalLanguage).toBe("en");
    expect(book?.titleAuthority).toMatchObject({
      source: "googleBooks",
      confidence: "medium",
    });
    expect(book?.canonicalRelations).toMatchObject({
      primaryEditionId: first.editionId,
    });
    expect(book?.workIdentity).toMatchObject({
      canonicalKey: "author one::the deterministic book",
    });
  });

  it("ingestion writes coverState PENDING when cover candidates exist", async () => {
    const result = await callIngest();

    const book = getDoc(`books/${result.bookId}`);
    const coverJob = getDoc(`cover_jobs/${result.bookId}`);

    expect(["PENDING", "READY", "FAILED"]).toContain(book?.coverState);
    expect(book?.coverState).toBe("PENDING");
    if (book?.coverState !== "READY") {
      expect(coverJob).not.toBeNull();
      expect(Array.isArray(coverJob?.candidateUrls)).toBe(true);
      expect((coverJob?.candidateUrls as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("materializes and links a canonical author record for the primary author", async () => {
    const result = await callIngest();

    const book = getDoc(`books/${result.bookId}`);
    const authorId = typeof book?.authorId === "string" ? book.authorId : "";
    const author = authorId ? getDoc(`authors/${authorId}`) : null;
    const authorIdentity = getDoc("author_identity/canonical:author one::unknown");

    expect(authorId).toBeTruthy();
    expect(book?.authorCanonicalKey).toBe("author one::unknown");
    expect(author?.nameEn).toBe("Author One");
    expect(authorIdentity?.authorId).toBe(authorId);
  });

  it("hydrates provider metadata on the server when rawBook is omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: "direct_google_id",
          volumeInfo: {
            title: "Direct Route Title",
            authors: ["Direct Route Author"],
            language: "en",
          },
        }),
      })) as any
    );

    const ingestBookCallable = await getIngestBookCallable();
    const result = await ingestBookCallable.run({
      auth: { uid: "test-user" },
      data: {
        providerExternalId: "direct_google_id",
        source: "googleBooks",
      },
    });

    const book = getDoc(`books/${result.bookId}`);

    expect(book?.titleEn).toBe("Direct Route Title");
    expect(book?.authorEn).toBe("Direct Route Author");
    expect(book?.providerExternalIds).toContain("googleBooks:direct_google_id");
  });

  it("ignores provider-supplied canonical author ids when provider identity matches but author text differs", async () => {
    const ingestBookCallable = await getIngestBookCallable();

    const first = await ingestBookCallable.run({
      auth: { uid: "test-user" },
      data: {
        providerExternalId: "gb_author_lock_1",
        source: "googleBooks",
        rawBook: {
          id: "author_lock_1",
          externalId: "author_lock_1",
          source: "googleBooks",
          title: "Authority Lock",
          authors: ["Author One"],
          language: "en",
        },
      },
    });

    const firstBook = getDoc(`books/${first.bookId}`);
    const firstAuthorId =
      typeof firstBook?.authorId === "string" ? firstBook.authorId : "";

    const second = await ingestBookCallable.run({
      auth: { uid: "test-user" },
      data: {
        providerExternalId: "gb_author_lock_1",
        source: "googleBooks",
        rawBook: {
          id: "author_lock_1",
          externalId: "author_lock_1",
          source: "googleBooks",
          title: "Authority Lock",
          authors: ["Author Two"],
          authorId: firstAuthorId,
          canonicalAuthorIds: [firstAuthorId],
          authorNamesNormalized: ["author one"],
          language: "en",
        },
      },
    });

    expect(second.bookId).not.toBe(first.bookId);
    expect(getDoc(`books/${second.bookId}`)?.author).toBe("Author Two");
    expect(getDoc("book_identity/provider:googleBooks:author_lock_1")?.bookId).toBe(first.bookId);
  });
});
