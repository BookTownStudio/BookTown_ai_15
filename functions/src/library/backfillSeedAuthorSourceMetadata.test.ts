import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;
type SpecialValue = { __op: "serverTimestamp" };

const store = new Map<string, DocData>();
let timestampCounter = 0;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSpecial(value: unknown): SpecialValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return (value as { __op?: string }).__op === "serverTimestamp"
    ? (value as SpecialValue)
    : null;
}

function setDoc(path: string, data: Record<string, unknown>, merge = false): void {
  const existing = store.get(path) || {};
  const next = { ...(merge ? existing : {}) };

  for (const [key, raw] of Object.entries(clone(data))) {
    const special = asSpecial(raw);
    if (special?.__op === "serverTimestamp") {
      timestampCounter += 1;
      next[key] = `ts-${timestampCounter}`;
      continue;
    }

    next[key] = raw;
  }

  store.set(path, next);
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

  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
    return Promise.resolve();
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

const firestoreMock = {
  collection(path: string): MockCollectionRef {
    return new MockCollectionRef(path);
  },
};

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
  },
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

async function getBackfillCallable() {
  const mod = await import("./backfillSeedAuthorSourceMetadata");
  return mod.backfillSeedAuthorSourceMetadata as any;
}

describe("backfillSeedAuthorSourceMetadata", () => {
  beforeEach(() => {
    store.clear();
    timestampCounter = 0;
    vi.clearAllMocks();
  });

  it("dry-run previews seed authors missing source state", async () => {
    setDoc("authors/seed-author-1", {
      id: "seed-author-1",
      nameEn: "Seed Author One",
      seedNamespace: "seed_alpha",
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
    expect(result.updated).toBe(1);
    expect(result.previewAuthorIds).toEqual(["seed-author-1"]);
    expect(getDoc("authors/seed-author-1")?.sourceRecordType).toBeUndefined();
  });

  it("write mode marks synthetic seed authors and preserves provider-backed authors", async () => {
    setDoc("authors/seed-author-1", {
      id: "seed-author-1",
      nameEn: "Seed Author One",
      seedNamespace: "seed_alpha",
    });
    setDoc("authors/provider-author-1", {
      id: "provider-author-1",
      nameEn: "Provider Author",
      seedNamespace: "seed_alpha",
      sourceIds: {
        openLibrary: "OL1A",
      },
      sourceRecordType: "provider",
      enrichmentEligible: true,
    });

    const callable = await getBackfillCallable();
    const result = await callable.run({
      auth: { uid: "admin-1", token: {} as never },
      rawRequest: {} as never,
      data: {
        dryRun: false,
        maxDocs: 10,
      },
    });

    expect(result.updated).toBe(1);
    expect(result.skippedHasProviderIds).toBe(1);
    expect(getDoc("authors/seed-author-1")?.sourceRecordType).toBe("synthetic_seed");
    expect(getDoc("authors/seed-author-1")?.enrichmentEligible).toBe(false);
    expect(getDoc("authors/seed-author-1")?.sourceIds).toEqual({});
    expect(getDoc("authors/provider-author-1")?.sourceRecordType).toBe("provider");
    expect(getDoc("authors/provider-author-1")?.sourceIds).toEqual({
      openLibrary: "OL1A",
    });
  });
});
