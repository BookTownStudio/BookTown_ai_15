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
    if (typeof (value as { toMillis?: unknown }).toMillis === "function") {
      return value;
    }
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

  it("accepts abandoned progress state through backend-authoritative sync", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const start = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_start",
            idempotencyKey: "idem_progress_start",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: Date.now(),
            payload: {
              percentage: 0.2,
              lastPosition: { page: 20, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(start.rejected).toBe(0);

    const abandoned = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_abandon",
            idempotencyKey: "idem_progress_abandon",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: Date.now() + 1,
            payload: {
              percentage: 0.2,
              lastPosition: { page: 20, totalPages: 100 },
              status_state: "abandoned",
            },
          },
        ],
      },
    });

    expect(abandoned.accepted).toBe(1);
    expect(abandoned.applied).toBe(1);
    expect(abandoned.rejected).toBe(0);

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.status_state).toBe("abandoned");
    expect(progress?.schemaVersion).toBe(2);
  });

  it("preserves distinct queued progress operations with operation-level idempotency", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const result = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_older",
            idempotencyKey: "progress:book_sync:1000:op_progress_older",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 1_000,
            payload: {
              percentage: 0.2,
              lastPosition: { page: 20, totalPages: 100 },
              status_state: "reading",
            },
          },
          {
            opId: "op_progress_newer",
            idempotencyKey: "progress:book_sync:2000:op_progress_newer",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 2_000,
            payload: {
              percentage: 0.35,
              lastPosition: { page: 35, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(result.accepted).toBe(2);
    expect(result.applied).toBe(2);
    expect(result.rejected).toBe(0);

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.progress).toBe(0.35);
    expect(progress?.lastPosition?.page).toBe(35);
    expect(progress?.lastClientTimestampMs).toBe(2_000);
    expect(progress?.continuityLevel).toBe("full_runtime");
  });

  it("rejects stale replay so older device progress cannot overwrite newer continuity", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const newer = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_newer",
            idempotencyKey: "progress:book_sync:3000:op_progress_newer",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 3_000,
            payload: {
              percentage: 0.6,
              lastPosition: { page: 60, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(newer.rejected).toBe(0);

    const stale = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_stale",
            idempotencyKey: "progress:book_sync:2000:op_progress_stale",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 2_000,
            payload: {
              percentage: 0.4,
              lastPosition: { page: 40, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(stale.applied).toBe(0);
    expect(stale.rejected).toBe(1);
    expect(stale.errors[0].code).toBe("failed-precondition");

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.progress).toBe(0.6);
    expect(progress?.lastPosition?.page).toBe(60);
  });

  it("converges equal-timestamp runtime conflicts by operation id", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const first = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_a",
            idempotencyKey: "progress:book_sync:5000:op_progress_a",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 5_000,
            payload: {
              percentage: 0.5,
              lastPosition: { page: 50, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });
    expect(first.rejected).toBe(0);

    const winner = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_b",
            idempotencyKey: "progress:book_sync:5000:op_progress_b",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 5_000,
            payload: {
              percentage: 0.55,
              lastPosition: { page: 55, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });
    expect(winner.rejected).toBe(0);

    const loser = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_a0",
            idempotencyKey: "progress:book_sync:5000:op_progress_a0",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 5_000,
            payload: {
              percentage: 0.52,
              lastPosition: { page: 52, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(loser.rejected).toBe(1);
    expect(loser.errors[0].code).toBe("already-exists");

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.progress).toBe(0.55);
    expect(progress?.lastSyncedOperationId).toBe("op_progress_b");
  });

  it("protects completed continuity from delayed reading replay", async () => {
    const { syncReaderOperationsHandler } = await import("../syncReaderOperations");
    const auth = { uid: "user_sync", token: {} };

    const completed = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_before_complete",
            idempotencyKey: "progress:book_sync:3500:op_progress_before_complete",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 3_500,
            payload: {
              percentage: 0.75,
              lastPosition: { page: 75, totalPages: 100 },
              status_state: "reading",
            },
          },
          {
            opId: "op_progress_complete",
            idempotencyKey: "progress:book_sync:4000:op_progress_complete",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 4_000,
            payload: {
              percentage: 1,
              lastPosition: { page: 100, totalPages: 100 },
              status_state: "completed",
            },
          },
        ],
      },
    });

    expect(completed.rejected).toBe(0);

    const stale = await syncReaderOperationsHandler({
      auth,
      data: {
        operations: [
          {
            opId: "op_progress_after_complete_stale",
            idempotencyKey: "progress:book_sync:3000:op_progress_after_complete_stale",
            type: "upsert_progress",
            bookId: "book_sync",
            clientTimestampMs: 3_000,
            payload: {
              percentage: 0.75,
              lastPosition: { page: 75, totalPages: 100 },
              status_state: "reading",
            },
          },
        ],
      },
    });

    expect(stale.applied).toBe(0);
    expect(stale.rejected).toBe(1);

    const progress = fakeDb.read("reading_progress", "user_sync_book_sync");
    expect(progress?.status_state).toBe("completed");
    expect(progress?.progress).toBe(1);
  });
});
