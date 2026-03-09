import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
const searchOpenLibraryAuthorsMock = vi.fn();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setDoc(path: string, data: Record<string, unknown>): void {
  store.set(path, clone(data));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

class MockDocSnapshot {
  constructor(
    public readonly id: string,
    private readonly payload: Record<string, unknown>
  ) {}

  data(): Record<string, unknown> {
    return clone(this.payload);
  }
}

class MockQuery {
  constructor(
    private readonly collectionPath: string,
    private readonly filters: Array<{ field: string; op: string; value: unknown }> = [],
    private readonly orderField: string | null = null,
    private readonly startAtValue: string | null = null,
    private readonly endAtValue: string | null = null,
    private readonly limitCount: number | null = null
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    return new MockQuery(this.collectionPath, [...this.filters, { field, op, value }], this.orderField, this.startAtValue, this.endAtValue, this.limitCount);
  }

  orderBy(field: string): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, field, this.startAtValue, this.endAtValue, this.limitCount);
  }

  startAt(value: string): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, this.orderField, value, this.endAtValue, this.limitCount);
  }

  endAt(value: string): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, this.orderField, this.startAtValue, value, this.limitCount);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, this.orderField, this.startAtValue, this.endAtValue, count);
  }

  async get(): Promise<{ docs: MockDocSnapshot[]; empty: boolean }> {
    let docs = Array.from(store.entries())
      .filter(([path]) => path.startsWith(`${this.collectionPath}/`))
      .filter(([path]) => path.split("/").filter(Boolean).length === 2)
      .map(([path, data]) => {
        const id = path.split("/").filter(Boolean).pop() || "";
        return new MockDocSnapshot(id, data);
      });

    for (const filter of this.filters) {
      docs = docs.filter((doc) => {
        const data = asRecord(doc.data()) || {};
        const fieldValue = data[filter.field];
        if (filter.op === "array-contains") {
          return Array.isArray(fieldValue) && fieldValue.includes(filter.value);
        }
        return false;
      });
    }

    if (this.orderField) {
      docs = docs
        .filter((doc) => {
          const data = asRecord(doc.data()) || {};
          return typeof data[this.orderField as string] === "string";
        })
        .sort((left, right) => {
          const leftData = asRecord(left.data()) || {};
          const rightData = asRecord(right.data()) || {};
          return String(leftData[this.orderField as string]).localeCompare(
            String(rightData[this.orderField as string])
          );
        });
    }

    if (this.startAtValue !== null) {
      docs = docs.filter((doc) => {
        const data = asRecord(doc.data()) || {};
        return String(data[this.orderField as string] || "") >= this.startAtValue!;
      });
    }

    if (this.endAtValue !== null) {
      docs = docs.filter((doc) => {
        const data = asRecord(doc.data()) || {};
        return String(data[this.orderField as string] || "") <= this.endAtValue!;
      });
    }

    if (typeof this.limitCount === "number") {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      docs,
      empty: docs.length === 0,
    };
  }
}

const firestoreMock = {
  collection(path: string): MockQuery {
    return new MockQuery(path);
  },
};

vi.mock("firebase-functions/logger", () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (_options: unknown, handler: unknown) => ({
    run: handler as (request: unknown) => Promise<unknown>,
  }),
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => firestoreMock,
  },
}));

vi.mock("./authors/providerSources", () => ({
  searchOpenLibraryAuthors: searchOpenLibraryAuthorsMock,
}));

async function getDiscoverAuthorsCallable() {
  const mod = await import("./discoverAuthors");
  return mod.discoverAuthors as any;
}

describe("discoverAuthors", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    searchOpenLibraryAuthorsMock.mockResolvedValue([]);
  });

  it("returns provider-backed author candidates when the catalog has no local match", async () => {
    searchOpenLibraryAuthorsMock.mockResolvedValue([
      {
        nameEn: "Franz Kafka",
        nameAr: "Franz Kafka",
        avatarUrl: "https://covers.openlibrary.org/a/olid/OL123A-L.jpg",
        bioEn: "Known for The Trial",
        bioAr: "",
        lifespan: "1883-1924",
        sourceIds: {
          openLibrary: "OL123A",
        },
      },
    ]);

    const discoverAuthors = await getDiscoverAuthorsCallable();
    const result = (await discoverAuthors.run({
      data: {
        query: "kafka",
        limit: 8,
      },
    })) as {
      authors: Array<Record<string, unknown>>;
    };

    expect(result.authors).toHaveLength(1);
    expect(result.authors[0]?.id).toBe("ol_author_OL123A");
    expect(result.authors[0]?.providerSource).toBe("openLibrary");
    expect(result.authors[0]?.providerExternalId).toBe("OL123A");
    expect(result.authors[0]?.requiresCanonicalization).toBe(true);
  });

  it("deduplicates provider hits when the canonical author already exists locally", async () => {
    setDoc("authors/author-kafka", {
      nameEn: "Franz Kafka",
      nameAr: "Franz Kafka",
      avatarUrl: "",
      bioEn: "Local author",
      bioAr: "",
      lifespan: "1883-1924",
      countryEn: "",
      countryAr: "",
      languageEn: "",
      languageAr: "",
      nameEnNormalized: "franz kafka",
      searchPrefixes: ["kafka", "franz kafka"],
      sourceIds: {
        openLibrary: "OL123A",
      },
    });

    searchOpenLibraryAuthorsMock.mockResolvedValue([
      {
        nameEn: "Franz Kafka",
        nameAr: "Franz Kafka",
        avatarUrl: "https://covers.openlibrary.org/a/olid/OL123A-L.jpg",
        bioEn: "Known for The Trial",
        bioAr: "",
        lifespan: "1883-1924",
        sourceIds: {
          openLibrary: "OL123A",
        },
      },
    ]);

    const discoverAuthors = await getDiscoverAuthorsCallable();
    const result = (await discoverAuthors.run({
      data: {
        query: "kafka",
        limit: 8,
      },
    })) as {
      authors: Array<Record<string, unknown>>;
    };

    expect(result.authors).toHaveLength(1);
    expect(result.authors[0]?.id).toBe("author-kafka");
    expect(result.authors[0]?.providerExternalId).toBe("OL123A");
    expect(result.authors[0]?.requiresCanonicalization).toBe(false);
  });
});
