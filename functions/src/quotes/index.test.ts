import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let autoIdCounter = 0;
let timestampCounter = 0;

type SpecialValue = { __op: "serverTimestamp" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSpecial(value: unknown): SpecialValue | null {
  if (!isRecord(value)) return null;
  return value.__op === "serverTimestamp" ? (value as SpecialValue) : null;
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

    if (isRecord(raw)) {
      const existingChild = isRecord(existing[key])
        ? (existing[key] as Record<string, unknown>)
        : {};
      next[key] = materialize(raw, existingChild);
      continue;
    }

    next[key] = raw;
  }

  return next;
}

function setDoc(path: string, data: Record<string, unknown>, merge = false): void {
  const existing = store.get(path) || {};
  const resolved = materialize(data, merge ? existing : {});
  store.set(path, merge ? materialize(resolved, existing) : resolved);
}

function deleteDoc(path: string): void {
  store.delete(path);
}

function getDocData(path: string): Record<string, unknown> | undefined {
  const value = store.get(path);
  return value ? clone(value) : undefined;
}

function listCollectionDocs(collectionPath: string): Array<{ path: string; id: string; data: DocData }> {
  const baseSegments = collectionPath.split("/").filter(Boolean);
  const targetLength = baseSegments.length + 1;

  return Array.from(store.entries())
    .filter(([path]) => {
      const segments = path.split("/").filter(Boolean);
      return (
        segments.length === targetLength &&
        segments.slice(0, baseSegments.length).join("/") === collectionPath
      );
    })
    .map(([path, data]) => ({
      path,
      id: (() => {
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1] || "";
      })(),
      data: clone(data),
    }));
}

class MockDocSnapshot {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  get exists(): boolean {
    return store.has(this.path);
  }

  data(): Record<string, unknown> | undefined {
    return getDocData(this.path);
  }
}

class MockDocRef {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(`${this.path}/${name}`);
  }

  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.path);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
  }

  async delete(): Promise<void> {
    deleteDoc(this.path);
  }
}

class MockQuerySnapshot {
  constructor(public readonly docs: MockDocSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

class MockQuery {
  constructor(
    protected readonly collectionPath: string,
    protected readonly filters: Array<{ field: string; value: unknown }> = [],
    protected readonly orderByField = "updatedAt",
    protected readonly orderDirection: "asc" | "desc" = "desc",
    protected readonly limitCount: number | null = null,
    protected readonly startAfterId: string | null = null
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    if (op !== "==") {
      throw new Error(`Unsupported operator: ${op}`);
    }

    return new MockQuery(
      this.collectionPath,
      [...this.filters, { field, value }],
      this.orderByField,
      this.orderDirection,
      this.limitCount,
      this.startAfterId
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): MockQuery {
    return new MockQuery(
      this.collectionPath,
      this.filters,
      field,
      direction,
      this.limitCount,
      this.startAfterId
    );
  }

  limit(count: number): MockQuery {
    return new MockQuery(
      this.collectionPath,
      this.filters,
      this.orderByField,
      this.orderDirection,
      count,
      this.startAfterId
    );
  }

  startAfter(snapshot: { id: string }): MockQuery {
    return new MockQuery(
      this.collectionPath,
      this.filters,
      this.orderByField,
      this.orderDirection,
      this.limitCount,
      snapshot.id
    );
  }

  async get(): Promise<MockQuerySnapshot> {
    let docs = listCollectionDocs(this.collectionPath).filter(({ data }) =>
      this.filters.every(({ field, value }) => data[field] === value)
    );

    docs.sort((a, b) => {
      const left = a.data[this.orderByField];
      const right = b.data[this.orderByField];

      if (left === right) {
        return a.id.localeCompare(b.id);
      }

      const compare = String(left ?? "").localeCompare(String(right ?? ""));
      return this.orderDirection === "desc" ? -compare : compare;
    });

    if (this.startAfterId) {
      const index = docs.findIndex((entry) => entry.id === this.startAfterId);
      if (index >= 0) {
        docs = docs.slice(index + 1);
      }
    }

    if (typeof this.limitCount === "number") {
      docs = docs.slice(0, this.limitCount);
    }

    return new MockQuerySnapshot(docs.map((entry) => new MockDocSnapshot(entry.path)));
  }
}

class MockCollectionRef extends MockQuery {
  constructor(collectionPath: string) {
    super(collectionPath);
  }

  doc(id?: string): MockDocRef {
    const resolvedId = id || `quote-${++autoIdCounter}`;
    return new MockDocRef(`${this.collectionPath}/${resolvedId}`);
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef {
    return new MockCollectionRef(path);
  },
  doc(path: string): MockDocRef {
    return new MockDocRef(path);
  },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
  },
});

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

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
    firestore: firestoreFn,
  },
}));

vi.mock("../shared/auth", () => ({
  assertActiveAuthenticatedUser: vi.fn(async (auth: { uid?: string } | null | undefined) => {
    if (!auth?.uid) {
      throw new MockHttpsError("unauthenticated", "Authentication required.");
    }

    return {
      uid: auth.uid,
      token: {},
    };
  }),
}));

async function getQuotesModule() {
  return import("./index");
}

describe("quotes callable hardening", () => {
  beforeEach(() => {
    store.clear();
    autoIdCounter = 0;
    timestampCounter = 0;
    vi.clearAllMocks();
  });

  it("createQuote auto-links canonical author from book and persists provenance", async () => {
    setDoc("books/book-1", { authorId: "author-1" });
    setDoc("authors/author-1", { nameEn: "Author One" });

    const { createQuote } = await getQuotesModule();
    const result = (await createQuote.run({
      auth: { uid: "user-1", token: {} as never },
      rawRequest: {} as never,
      data: {
        textEn: "A room of one's own.",
        textAr: "غرفة تخص المرء وحده.",
        sourceEn: "A Room of One's Own",
        sourceAr: "غرفة تخص المرء وحده",
        bookId: "book-1",
      },
    })) as Record<string, unknown>;

    expect(result.authorId).toBe("author-1");
    expect(result.provenance).toMatchObject({
      sourceType: "book",
      verificationStatus: "canonical_linked",
      sourceBookId: "book-1",
      sourceAuthorId: "author-1",
    });

    const stored = listCollectionDocs("users/user-1/quotes")[0]?.data;
    expect(stored?.authorId).toBe("author-1");
    expect(stored?.searchTextNormalized).toContain("room");
    expect(stored?.provenance).toMatchObject({
      sourceType: "book",
      verificationStatus: "canonical_linked",
    });
  });

  it("createQuote rejects mismatched canonical book and author links", async () => {
    setDoc("books/book-1", { authorId: "author-1" });
    setDoc("authors/author-1", { nameEn: "Author One" });
    setDoc("authors/author-2", { nameEn: "Author Two" });

    const { createQuote } = await getQuotesModule();

    await expect(
      createQuote.run({
        auth: { uid: "user-1", token: {} as never },
        rawRequest: {} as never,
        data: {
          textEn: "Mismatch",
          textAr: "تعارض",
          sourceEn: "Source",
          sourceAr: "مصدر",
          bookId: "book-1",
          authorId: "author-2",
        },
      })
    ).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("listUserQuotes scans past recent non-matches to return an older matching quote", async () => {
    setDoc("users/user-1/quotes/q3", {
      ownerId: "user-1",
      textEn: "Latest non match",
      textAr: "أحدث غير مطابق",
      sourceEn: "Book A",
      sourceAr: "الكتاب أ",
      updatedAt: "2026-03-03T00:00:00.000Z",
      createdAt: "2026-03-03T00:00:00.000Z",
      isPublic: true,
      version: 2,
    });
    setDoc("users/user-1/quotes/q2", {
      ownerId: "user-1",
      textEn: "Second non match",
      textAr: "الثاني غير مطابق",
      sourceEn: "Book B",
      sourceAr: "الكتاب ب",
      updatedAt: "2026-03-02T00:00:00.000Z",
      createdAt: "2026-03-02T00:00:00.000Z",
      isPublic: true,
      version: 2,
    });
    setDoc("users/user-1/quotes/q1", {
      ownerId: "user-1",
      textEn: "Needle hidden deeper",
      textAr: "إبرة أعمق",
      sourceEn: "Book C",
      sourceAr: "الكتاب ج",
      updatedAt: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
      isPublic: true,
      version: 2,
    });

    const { listUserQuotes } = await getQuotesModule();
    const result = (await listUserQuotes.run({
      auth: { uid: "user-1", token: {} as never },
      rawRequest: {} as never,
      data: {
        ownerId: "user-1",
        query: "needle",
        limit: 1,
      },
    })) as { quotes: Array<Record<string, unknown>> };

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.id).toBe("q1");
  });
});
