import { beforeEach, describe, expect, it, vi } from "vitest";

type JsonMap = Record<string, any>;

class FakeDocSnapshot {
  constructor(private readonly value: JsonMap | null) {}

  get exists(): boolean {
    return this.value !== null;
  }

  data(): JsonMap {
    return this.value ? deepClone(this.value) : {};
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
    bucket.set(id, merge && current ? { ...deepClone(current), ...deepClone(value) } : deepClone(value));
  }

  rows(collection: string): JsonMap[] {
    return Array.from(this.data.get(collection)?.values() ?? []).map((row) => deepClone(row));
  }

  async runTransaction(runner: (tx: {
    get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
    set: (ref: FakeDocRef, value: JsonMap, options?: { merge?: boolean }) => void;
  }) => Promise<void>): Promise<void> {
    const writes: Array<{ ref: FakeDocRef; value: JsonMap; merge: boolean }> = [];
    await runner({
      get: async (ref) => ref.get(),
      set: (ref, value, options) => {
        writes.push({ ref, value, merge: options?.merge === true });
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
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepClone(nested);
    }
    return out as T;
  }
  return value;
}

const fakeDb = new FakeFirestore();

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

describe("recordManualReadingProgress", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeDb.write("books", "book_manual", { title: "Manual Book" }, false);
  });

  it("creates physical-book continuity in reading_progress through the canonical state machine", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");

    const result = await recordManualReadingProgressHandler({
      auth: { uid: "user_manual" },
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        currentPage: 25,
        totalPages: 100,
        status_state: "reading",
      },
    });

    expect(result).toEqual({ ok: true });

    const progress = fakeDb.read("reading_progress", "user_manual_book_manual");
    expect(progress).toMatchObject({
      uid: "user_manual",
      userId: "user_manual",
      bookId: "book_manual",
      status_state: "reading",
      progress: 0.25,
      continuityLevel: "manual",
      continuitySource: "manual",
      sourceType: "physical",
      schemaVersion: 2,
    });
    expect(progress?.lastPosition).toMatchObject({
      page: 25,
      totalPages: 100,
      format: "physical",
      mode: "manual",
    });

    const eventNames = fakeDb.rows("reader_events").map((row) => row.event).sort();
    expect(eventNames).toEqual(["manual_progress_update", "read_start"]);
  });

  it("creates partial-runtime external ebook continuity", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");

    await recordManualReadingProgressHandler({
      auth: { uid: "user_manual" },
      data: {
        bookId: "book_manual",
        sourceType: "external_ebook",
        progress: 0.4,
        chapter: "Chapter 4",
      },
    });

    const progress = fakeDb.read("reading_progress", "user_manual_book_manual");
    expect(progress).toMatchObject({
      status_state: "reading",
      progress: 0.4,
      continuityLevel: "partial_runtime",
      continuitySource: "manual",
      sourceType: "external_ebook",
    });
    expect(progress?.lastPosition).toMatchObject({
      chapter: "Chapter 4",
      format: "external_ebook",
      mode: "manual",
    });
  });

  it("supports unknown manual continuity without assuming a reading source", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");

    await recordManualReadingProgressHandler({
      auth: { uid: "user_manual" },
      data: {
        bookId: "book_manual",
        sourceType: "unknown",
        progress: 0,
        status_state: "reading",
      },
    });

    const progress = fakeDb.read("reading_progress", "user_manual_book_manual");
    expect(progress).toMatchObject({
      status_state: "reading",
      progress: 0,
      continuityLevel: "manual",
      continuitySource: "manual",
      sourceType: "unknown",
    });
    expect(progress?.lastPosition).toBeNull();
  });

  it("supports manual completion and abandonment through canonical transitions", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");
    const auth = { uid: "user_manual" };

    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        progress: 0.5,
        status_state: "reading",
      },
    });
    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        progress: 0.5,
        status_state: "abandoned",
      },
    });

    expect(fakeDb.read("reading_progress", "user_manual_book_manual")?.status_state).toBe("abandoned");

    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        status_state: "reading",
      },
    });
    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        status_state: "completed",
      },
    });

    const progress = fakeDb.read("reading_progress", "user_manual_book_manual");
    expect(progress?.status_state).toBe("completed");
    expect(progress?.progress).toBe(1);
    expect(fakeDb.rows("reader_events").map((row) => row.event)).toContain("read_complete");
    expect(fakeDb.rows("reader_events").map((row) => row.event)).toContain("read_abandon");
  });

  it("supports explicit rereading after completion", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");
    const auth = { uid: "user_manual" };

    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        status_state: "reading",
      },
    });
    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        status_state: "completed",
      },
    });
    await recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        status_state: "rereading",
      },
    });

    const progress = fakeDb.read("reading_progress", "user_manual_book_manual");
    expect(progress?.status_state).toBe("rereading");
    expect(progress?.sessionStartedAt).toBeTruthy();
    expect(fakeDb.rows("reader_events").map((row) => row.event)).toContain("reread_start");
  });

  it("rejects runtime-owned precision fields and invalid page/progress payloads", async () => {
    const { recordManualReadingProgressHandler } = await import("../recordManualReadingProgress");
    const auth = { uid: "user_manual" };

    await expect(recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        progress: 0.1,
        cfi: "epubcfi(/6/2)",
      },
    })).rejects.toThrow("cfi is runtime-owned");

    await expect(recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        progress: 0.1,
        manifestVersion: 1,
      },
    })).rejects.toThrow("manifestVersion is runtime-owned");

    await expect(recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        progress: 2,
      },
    })).rejects.toThrow("progress must be between 0 and 1");

    await expect(recordManualReadingProgressHandler({
      auth,
      data: {
        bookId: "book_manual",
        sourceType: "physical",
        currentPage: 101,
        totalPages: 100,
      },
    })).rejects.toThrow("currentPage must not exceed totalPages");
  });
});
