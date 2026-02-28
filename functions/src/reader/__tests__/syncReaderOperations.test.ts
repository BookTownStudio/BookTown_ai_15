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

  async set(data: JsonMap, options?: { merge?: boolean }): Promise<void> {
    this.store.write(this.collectionName, this.id, data, options?.merge === true);
  }

  async delete(): Promise<void> {
    this.store.delete(this.collectionName, this.id);
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

  delete(collection: string, id: string): void {
    const bucket = this.data.get(collection);
    if (!bucket) return;
    bucket.delete(id);
  }

  async runTransaction(
    runner: (tx: {
      get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
      set: (ref: FakeDocRef, value: JsonMap, options?: { merge?: boolean }) => void;
      delete: (ref: FakeDocRef) => void;
    }) => Promise<"applied" | "deduped">
  ): Promise<"applied" | "deduped"> {
    const writes: Array<{
      type: "set" | "delete";
      ref: FakeDocRef;
      value?: JsonMap;
      merge?: boolean;
    }> = [];

    const result = await runner({
      get: async (ref) => ref.get(),
      set: (ref, value, options) => {
        writes.push({
          type: "set",
          ref,
          value,
          merge: options?.merge === true,
        });
      },
      delete: (ref) => {
        writes.push({
          type: "delete",
          ref,
        });
      },
    });

    for (const write of writes) {
      if (write.type === "set") {
        this.write(write.ref.collectionName, write.ref.id, write.value as JsonMap, write.merge === true);
      } else {
        this.delete(write.ref.collectionName, write.ref.id);
      }
    }

    return result;
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

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

describe("syncReaderOperations", () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it("applies operations once and dedupes retries", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const operations = [
      {
        opId: "op_progress_1",
        idempotencyKey: "idem_progress_1",
        type: "upsert_progress",
        bookId: "book_sync",
        clientTimestampMs: Date.now(),
        payload: {
          percentage: 0.2,
          lastPosition: { page: 20, totalPages: 100 },
        },
      },
      {
        opId: "op_highlight_1",
        idempotencyKey: "idem_highlight_1",
        type: "upsert_highlight",
        bookId: "book_sync",
        clientTimestampMs: Date.now(),
        payload: {
          highlightId: "h1",
          quote: "Hello world",
          page: 20,
        },
      },
      {
        opId: "op_bookmark_1",
        idempotencyKey: "idem_bookmark_1",
        type: "upsert_bookmark",
        bookId: "book_sync",
        clientTimestampMs: Date.now(),
        payload: {
          bookmarkId: "b1",
          page: 20,
        },
      },
    ];

    const first = await syncReaderOperationsHandler({
      auth,
      data: {
        operations,
      },
    });

    expect(first.accepted).toBe(3);
    expect(first.applied).toBe(3);
    expect(first.deduped).toBe(0);
    expect(first.rejected).toBe(0);

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.progress).toBe(0.2);
    expect(progress?.status_state).toBe("reading");
    expect(progress?.lastPosition?.page).toBe(20);

    const highlight = fakeDb.read("reader_highlights", "user_sync_book_sync_h1");
    expect(highlight?.quote).toBe("Hello world");
    expect(highlight?.page).toBe(20);

    const bookmark = fakeDb.read("reader_bookmarks", "user_sync_book_sync_b1");
    expect(bookmark?.page).toBe(20);

    const second = await syncReaderOperationsHandler({
      auth,
      data: {
        operations,
      },
    });

    expect(second.accepted).toBe(3);
    expect(second.applied).toBe(0);
    expect(second.deduped).toBe(3);
    expect(second.rejected).toBe(0);
  });

  it("rejects invalid operation payloads without crashing the batch", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const result = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_invalid_1",
            idempotencyKey: "idem_invalid_1",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: Date.now(),
            payload: {
              percentage: 1.5,
            },
          },
        ],
      },
    });

    expect(result.accepted).toBe(1);
    expect(result.applied).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].opId).toBe("op_invalid_1");
  });
});
