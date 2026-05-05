import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { enforceSearchRequestQuota } from "./searchRequestQuota";

type JsonMap = Record<string, unknown>;

class FakeDocSnapshot {
  constructor(private readonly value: JsonMap | null) {}

  get exists(): boolean {
    return this.value !== null;
  }

  data(): JsonMap {
    return this.value ? { ...this.value } : {};
  }
}

class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly collectionName: string,
    readonly id: string
  ) {}
}

class FakeCollectionRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly name: string
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.store, this.name, id);
  }
}

class FakeFirestore {
  private readonly data = new Map<string, Map<string, JsonMap>>();

  collection(name: string): FakeCollectionRef {
    if (!this.data.has(name)) {
      this.data.set(name, new Map<string, JsonMap>());
    }
    return new FakeCollectionRef(this, name);
  }

  read(collection: string, id: string): JsonMap | null {
    return this.data.get(collection)?.get(id) || null;
  }

  async runTransaction(
    runner: (transaction: {
      get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
      set: (ref: FakeDocRef, value: JsonMap, options?: { merge?: boolean }) => void;
    }) => Promise<void>
  ): Promise<void> {
    const writes: Array<{ ref: FakeDocRef; value: JsonMap; merge: boolean }> = [];

    await runner({
      get: async (ref) => new FakeDocSnapshot(this.read(ref.collectionName, ref.id)),
      set: (ref, value, options) => {
        writes.push({
          ref,
          value,
          merge: options?.merge === true,
        });
      },
    });

    for (const write of writes) {
      const bucket = this.data.get(write.ref.collectionName) || new Map<string, JsonMap>();
      this.data.set(write.ref.collectionName, bucket);
      const current = bucket.get(write.ref.id);
      bucket.set(
        write.ref.id,
        write.merge && current ? { ...current, ...write.value } : { ...write.value }
      );
    }
  }
}

const NOW_MS = 1_700_000_000_000;
const WINDOW_MS = 60 * 1000;
const BUCKET_MS = WINDOW_MS / 4;
const windowStartMs = NOW_MS - (NOW_MS % WINDOW_MS);
const bucketIndex = Math.floor((NOW_MS % WINDOW_MS) / BUCKET_MS);
const BUCKET_LIMIT = 15;

describe("enforceSearchRequestQuota", () => {
  it("records usage below limit in the correct sub-bucket document", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;

    await enforceSearchRequestQuota({
      db,
      actorKey: "actor_a",
      nowMs: NOW_MS,
    });

    const expectedDocId = `book_search_actor_a_${windowStartMs}_b${bucketIndex}`;
    const stored = (db as unknown as FakeFirestore).read("_request_quota", expectedDocId);
    expect(stored?.count).toBe(1);
    expect(stored?.limit).toBe(60);
    expect(stored?.bucketLimit).toBe(BUCKET_LIMIT);
    expect(stored?.bucketIndex).toBe(bucketIndex);
    expect(stored?.windowStartMs).toBe(windowStartMs);
  });

  it("throws resource-exhausted after bucket limit is reached within one sub-bucket", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;

    for (let i = 0; i < BUCKET_LIMIT; i += 1) {
      await enforceSearchRequestQuota({
        db,
        actorKey: "actor_b",
        nowMs: NOW_MS,
      });
    }

    await expect(
      enforceSearchRequestQuota({
        db,
        actorKey: "actor_b",
        nowMs: NOW_MS,
      })
    ).rejects.toMatchObject({
      code: "resource-exhausted",
      message: "BOOK_SEARCH_RATE_LIMIT_EXCEEDED",
    });
  });

  it("allows up to bucket limit across separate sub-buckets in the same window", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;

    const bucket0Ms = windowStartMs + 1;
    const bucket1Ms = windowStartMs + BUCKET_MS + 1;

    for (let i = 0; i < BUCKET_LIMIT; i += 1) {
      await enforceSearchRequestQuota({ db, actorKey: "actor_c", nowMs: bucket0Ms });
    }
    for (let i = 0; i < BUCKET_LIMIT; i += 1) {
      await enforceSearchRequestQuota({ db, actorKey: "actor_c", nowMs: bucket1Ms });
    }

    const expectedDoc0 = `book_search_actor_c_${windowStartMs}_b0`;
    const expectedDoc1 = `book_search_actor_c_${windowStartMs}_b1`;
    const stored0 = (db as unknown as FakeFirestore).read("_request_quota", expectedDoc0);
    const stored1 = (db as unknown as FakeFirestore).read("_request_quota", expectedDoc1);
    expect(stored0?.count).toBe(BUCKET_LIMIT);
    expect(stored1?.count).toBe(BUCKET_LIMIT);
  });

  it("treats different actor keys as independent buckets", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;

    for (let i = 0; i < BUCKET_LIMIT; i += 1) {
      await enforceSearchRequestQuota({ db, actorKey: "actor_x", nowMs: NOW_MS });
    }

    await expect(
      enforceSearchRequestQuota({ db, actorKey: "actor_x", nowMs: NOW_MS })
    ).rejects.toMatchObject({ code: "resource-exhausted" });

    await expect(
      enforceSearchRequestQuota({ db, actorKey: "actor_y", nowMs: NOW_MS })
    ).resolves.toBeUndefined();
  });
});
