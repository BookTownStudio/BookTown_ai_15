import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setDoc(path: string, data: Record<string, unknown>, merge = false): void {
  const existing = store.get(path) || {};
  store.set(path, merge ? { ...existing, ...clone(data) } : clone(data));
}

function getDoc(path: string): Record<string, unknown> | undefined {
  const value = store.get(path);
  return value ? clone(value) : undefined;
}

class MockDocSnapshot {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  data(): Record<string, unknown> {
    return clone(store.get(this.path) || {});
  }
}

class MockDocRef {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
}

class MockQuery {
  constructor(
    private readonly collectionPath: string,
    private readonly limitCount: number | null = null,
    private readonly startAfterId: string | null = null
  ) {}

  orderBy(): MockQuery {
    return this;
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.collectionPath, count, this.startAfterId);
  }

  startAfter(docId: string): MockQuery {
    return new MockQuery(this.collectionPath, this.limitCount, docId);
  }

  async get(): Promise<{ docs: MockDocSnapshot[]; empty: boolean }> {
    const docs = Array.from(store.entries())
      .filter(([path]) => path.startsWith(`${this.collectionPath}/`))
      .filter(([path]) => path.split("/").filter(Boolean).length === 2)
      .map(([path]) => new MockDocSnapshot(path))
      .sort((a, b) => a.id.localeCompare(b.id));

    const sliced =
      this.startAfterId
        ? docs.slice(docs.findIndex((doc) => doc.id === this.startAfterId) + 1)
        : docs;
    const limited = typeof this.limitCount === "number" ? sliced.slice(0, this.limitCount) : sliced;

    return {
      docs: limited,
      empty: limited.length === 0,
    };
  }
}

class MockCollectionRef extends MockQuery {
  constructor(private readonly path: string) {
    super(path);
  }

  doc(id: string): MockDocRef {
    return new MockDocRef(`${this.path}/${id}`);
  }
}

class MockTransaction {
  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    setDoc(ref.path, data, Boolean(options?.merge));
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef {
    return new MockCollectionRef(path);
  },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    const tx = new MockTransaction();
    return handler(tx);
  },
};

const materializeCanonicalAuthorInTransactionMock = vi.fn();
const resolveAuthorProviderPayloadMock = vi.fn();

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: unknown, maybeHandler?: unknown) => {
    const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
    return {
      run: handler as (request: unknown) => Promise<unknown>,
    };
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: Object.assign(() => firestoreMock, {
      FieldPath: {
        documentId: () => "__name__",
      },
    }),
  },
}));

vi.mock("../shared/auth", () => ({
  assertActiveAuthenticatedUser: vi.fn(async () => ({
    uid: "admin-1",
    token: { role: "superadmin" },
  })),
  assertRoleFromClaims: vi.fn(),
}));

vi.mock("./authors/providerSources", () => ({
  resolveAuthorProviderPayload: resolveAuthorProviderPayloadMock,
}));

vi.mock("./authors/authorCatalog", () => ({
  materializeCanonicalAuthorInTransaction: materializeCanonicalAuthorInTransactionMock,
}));

async function getBackfillCallable() {
  const mod = await import("./backfillAuthorMetadata");
  return mod.backfillAuthorMetadata as any;
}

describe("backfillAuthorMetadata", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    resolveAuthorProviderPayloadMock.mockResolvedValue({});
    materializeCanonicalAuthorInTransactionMock.mockImplementation(
      async ({ tx, providerExternalId, rawAuthor }: any) => {
        const authorId = String(rawAuthor.id || "author-1");
        tx.set(
          firestoreMock.collection("authors").doc(authorId),
          {
            bioEn: rawAuthor.bioEn,
            sourceIds: {
              ...(rawAuthor.sourceIds || {}),
              openLibrary: providerExternalId,
            },
          },
          { merge: true }
        );

        return {
          canonicalAuthorId: authorId,
          authorId,
          canonicalKey: "author one::unknown",
          status: "MERGED",
          source: "openLibrary",
          providerExternalId,
        };
      }
    );
  });

  it("dryRun previews enrichable authors without writing", async () => {
    setDoc("authors/author-1", {
      id: "author-1",
      nameEn: "Author One",
      sourceIds: {
        openLibrary: "OL1A",
      },
    });

    resolveAuthorProviderPayloadMock.mockResolvedValue({
      id: "author-1",
      nameEn: "Author One",
      bioEn: "Fresh bio",
      sourceIds: {
        openLibrary: "OL1A",
        wikidata: "Q1",
      },
      workCount: 10,
      topWorks: [{ workId: "W1", title: "Top Work" }],
    });

    const callable = await getBackfillCallable();
    const result = await callable.run({
      auth: { uid: "admin-1", token: {} as never },
      rawRequest: {} as never,
      data: {
        dryRun: true,
        maxDocs: 10,
      },
    });

    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.enriched).toBe(1);
    expect(result.previews[0]?.authorId).toBe("author-1");
    expect(result.previews[0]?.changedFields).toContain("bioEn");
    expect(materializeCanonicalAuthorInTransactionMock).not.toHaveBeenCalled();
    expect(getDoc("authors/author-1")?.bioEn).toBeUndefined();
  });

  it("write mode enriches sourced authors and skips authors without source ids", async () => {
    setDoc("authors/author-1", {
      id: "author-1",
      nameEn: "Author One",
      sourceIds: {
        openLibrary: "OL1A",
      },
    });
    setDoc("authors/author-2", {
      id: "author-2",
      nameEn: "Unsourced Author",
    });

    resolveAuthorProviderPayloadMock.mockImplementation(async (params: any) => ({
      id: "author-1",
      nameEn: "Author One",
      bioEn: "Fresh bio",
      sourceIds: {
        openLibrary: params.providerExternalId,
      },
    }));

    const callable = await getBackfillCallable();
    const result = await callable.run({
      auth: { uid: "admin-1", token: {} as never },
      rawRequest: {} as never,
      data: {
        dryRun: false,
        maxDocs: 10,
      },
    });

    expect(result.dryRun).toBe(false);
    expect(result.processed).toBe(2);
    expect(result.enriched).toBe(1);
    expect(result.skippedNoSource).toBe(1);
    expect(result.updatedAuthorIds).toEqual(["author-1"]);
    expect(getDoc("authors/author-1")?.bioEn).toBe("Fresh bio");
  });
});
