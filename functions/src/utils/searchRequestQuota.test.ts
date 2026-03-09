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

describe("enforceSearchRequestQuota", () => {
  it("records usage below limit", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;
    const nowMs = 1_700_000_000_000;
    const windowStartMs = nowMs - (nowMs % (60 * 1000));

    await enforceSearchRequestQuota({
      db,
      actorKey: "actor_a",
      nowMs,
    });

    const stored = (db as unknown as FakeFirestore).read(
      "_request_quota",
      `book_search_actor_a_${windowStartMs}`
    );
    expect(stored?.count).toBe(1);
    expect(stored?.limit).toBe(60);
  });

  it("throws resource exhausted after limit is reached inside one window", async () => {
    const db = new FakeFirestore() as unknown as FirebaseFirestore.Firestore;
    const nowMs = 1_700_000_000_000;

    for (let i = 0; i < 60; i += 1) {
      await enforceSearchRequestQuota({
        db,
        actorKey: "actor_b",
        nowMs,
      });
    }

    await expect(
      enforceSearchRequestQuota({
        db,
        actorKey: "actor_b",
        nowMs,
      })
    ).rejects.toMatchObject({
      code: "resource-exhausted",
      message: "BOOK_SEARCH_RATE_LIMIT_EXCEEDED",
    });
  });
});
