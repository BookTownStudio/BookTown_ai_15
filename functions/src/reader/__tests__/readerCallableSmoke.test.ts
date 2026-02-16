import { beforeEach, describe, expect, it, vi } from "vitest";

type JsonMap = Record<string, any>;

class FakeDocSnapshot {
  constructor(private readonly value: JsonMap | null) {}

  get exists(): boolean {
    return this.value !== null;
  }

  data(): JsonMap {
    if (!this.value) return {};
    return deepClone(this.value);
  }
}

class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly collectionName: string,
    readonly id: string
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.store.read(this.collectionName, this.id));
  }

  async set(data: JsonMap, options?: { merge?: boolean }): Promise<void> {
    this.store.write(this.collectionName, this.id, data, options?.merge === true);
  }
}

class FakeCollectionRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly name: string
  ) {}

  doc(id?: string): FakeDocRef {
    const nextId = id ?? `${this.name}_auto_${this.store.nextId(this.name)}`;
    return new FakeDocRef(this.store, this.name, nextId);
  }
}

class FakeFirestore {
  private data = new Map<string, Map<string, JsonMap>>();
  private ids = new Map<string, number>();

  reset(): void {
    this.data.clear();
    this.ids.clear();
  }

  collection(name: string): FakeCollectionRef {
    if (!this.data.has(name)) {
      this.data.set(name, new Map<string, JsonMap>());
    }
    return new FakeCollectionRef(this, name);
  }

  nextId(name: string): number {
    const current = this.ids.get(name) ?? 0;
    const next = current + 1;
    this.ids.set(name, next);
    return next;
  }

  read(collection: string, id: string): JsonMap | null {
    const bucket = this.data.get(collection);
    if (!bucket) return null;
    return bucket.has(id) ? deepClone(bucket.get(id) as JsonMap) : null;
  }

  write(collection: string, id: string, value: JsonMap, merge: boolean): void {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map<string, JsonMap>());
    }
    const bucket = this.data.get(collection) as Map<string, JsonMap>;
    const current = bucket.get(id) ?? null;
    if (merge && current) {
      bucket.set(id, { ...deepClone(current), ...deepClone(value) });
      return;
    }
    bucket.set(id, deepClone(value));
  }

  async runTransaction(
    runner: (tx: {
      get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
      set: (ref: FakeDocRef, value: JsonMap, options?: { merge?: boolean }) => void;
    }) => Promise<void>
  ): Promise<void> {
    const writes: Array<{
      ref: FakeDocRef;
      value: JsonMap;
      merge: boolean;
    }> = [];

    await runner({
      get: async (ref) => ref.get(),
      set: (ref, value, options) => {
        writes.push({
          ref,
          value,
          merge: options?.merge === true,
        });
      },
    });

    for (const write of writes) {
      this.write(write.ref.collectionName, write.ref.id, write.value, write.merge);
    }
  }
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepClone(v);
    }
    return out as T;
  }
  return value;
}

const fakeDb = new FakeFirestore();
const resolveAttachmentMock = vi.fn(async (bookId: string) => ({
  id: `att_${bookId}`,
  storagePath: `ebooks/${bookId}/canonical.epub`,
  visibility: "public",
}));

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
    storage: () => ({
      bucket: () => ({
        name: "booktown-test-bucket",
        file: (storagePath: string) => ({
          exists: async () => [true],
          getMetadata: async () => [{ contentType: "application/epub+zip" }],
          getSignedUrl: async () => [`https://signed.example/${encodeURIComponent(storagePath)}`],
        }),
      }),
    }),
  },
}));

vi.mock("../../attachments/resolveBookToEbookAttachment", () => ({
  resolveBookToEbookAttachment: resolveAttachmentMock,
}));

describe("Reader callable smoke", () => {
  beforeEach(() => {
    fakeDb.reset();
    resolveAttachmentMock.mockClear();
    fakeDb.write("books", "book_smoke", { title: "Smoke Book" }, false);
  });

  it("opens session, records progress, fetches progress, and resumes deterministically", async () => {
    const { getOrCreateReadingSessionHandler } = await import("../getOrCreateReadingSession");
    const { recordReadingProgressHandler } = await import("../recordReadingProgress");
    const { getReaderProgressHandler } = await import("../getReaderProgress");

    const auth = { uid: "user_smoke", token: { admin: true } };

    const firstSession = await getOrCreateReadingSessionHandler({
      auth,
      data: { bookId: "book_smoke" },
    });

    expect(typeof firstSession.signedUrl).toBe("string");
    expect(firstSession.resumePage).toBe(1);
    expect(firstSession.format).toBe("epub");

    const writeResult = await recordReadingProgressHandler({
      auth,
      data: {
        bookId: "book_smoke",
        currentPage: 5,
        totalPages: 100,
        percentage: 0.05,
        lastPosition: {
          page: 5,
          totalPages: 100,
          format: "epub",
          mode: "page",
        },
      },
    });

    expect(writeResult).toEqual({ ok: true });

    const progress = await getReaderProgressHandler({
      auth,
      data: { bookId: "book_smoke" },
    });

    expect(progress.exists).toBe(true);
    expect(progress.bookId).toBe("book_smoke");
    expect(progress.progress).toBe(0.05);
    expect(progress.lastPosition?.page).toBe(5);

    const secondSession = await getOrCreateReadingSessionHandler({
      auth,
      data: { bookId: "book_smoke" },
    });

    expect(secondSession.resumePage).toBe(5);
    expect(typeof secondSession.signedUrl).toBe("string");
    expect(secondSession.format).toBe("epub");
  });
});
