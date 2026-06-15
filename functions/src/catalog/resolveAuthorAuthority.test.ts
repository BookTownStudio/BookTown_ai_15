import { describe, expect, it, vi } from "vitest";

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

type JsonMap = Record<string, unknown>;

class FakeDocSnap {
  constructor(readonly id: string, private readonly row: JsonMap | undefined) {}
  get exists(): boolean {
    return Boolean(this.row);
  }
  data(): JsonMap | undefined {
    return this.row;
  }
}

class FakeDocRef {
  constructor(private readonly db: FakeDb, private readonly collectionName: string, readonly id: string) {}
  async get(): Promise<FakeDocSnap> {
    return new FakeDocSnap(this.id, this.db.read(this.collectionName, this.id));
  }
}

class FakeDb {
  private rows = new Map<string, Map<string, JsonMap>>();
  reset(): void {
    this.rows = new Map();
  }
  collection(name: string): { doc: (id: string) => FakeDocRef } {
    return {
      doc: (id: string) => new FakeDocRef(this, name, id),
    };
  }
  set(collection: string, id: string, data: JsonMap): void {
    const bucket = this.rows.get(collection) ?? new Map<string, JsonMap>();
    bucket.set(id, data);
    this.rows.set(collection, bucket);
  }
  read(collection: string, id: string): JsonMap | undefined {
    return this.rows.get(collection)?.get(id);
  }
}

const fakeDb = new FakeDb();

describe("resolveAuthorAuthority", () => {
  it("returns canonical authors without redirect", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_survivor", {
      nameEn: "Franz Kafka",
      lifecycleState: "canonical",
    });

    const { resolveAuthorAuthorityHandler } = await import("./resolveAuthorAuthority");
    const result = await resolveAuthorAuthorityHandler(
      { authorId: "author_survivor" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result).toMatchObject({
      requestedAuthorId: "author_survivor",
      resolvedAuthorId: "author_survivor",
      state: "canonical",
      author: {
        id: "author_survivor",
        nameEn: "Franz Kafka",
      },
      redirect: {
        required: false,
        targetAuthorId: null,
      },
    });
  });

  it("resolves merged authors to their survivor", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_old", {
      nameEn: "Franz Kafka",
      lifecycleState: "merged",
      mergeTargetAuthorId: "author_survivor",
    });
    fakeDb.set("authors", "author_survivor", {
      nameEn: "Franz Kafka",
      lifecycleState: "canonical",
    });

    const { resolveAuthorAuthorityHandler } = await import("./resolveAuthorAuthority");
    const result = await resolveAuthorAuthorityHandler(
      { authorId: "author_old" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result).toMatchObject({
      requestedAuthorId: "author_old",
      resolvedAuthorId: "author_survivor",
      state: "merged",
      author: {
        id: "author_survivor",
        nameEn: "Franz Kafka",
      },
      redirect: {
        required: true,
        targetAuthorId: "author_survivor",
        reason: "merged_author_redirect",
      },
    });
  });

  it("resolves superseded authors to current authority", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_old", {
      nameEn: "Old",
      lifecycleState: "superseded",
      supersededByAuthorId: "author_current",
    });
    fakeDb.set("authors", "author_current", {
      nameEn: "Current",
      lifecycleState: "canonical",
    });

    const { resolveAuthorAuthorityHandler } = await import("./resolveAuthorAuthority");
    const result = await resolveAuthorAuthorityHandler(
      { authorId: "author_old" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result).toMatchObject({
      resolvedAuthorId: "author_current",
      state: "superseded",
      redirect: {
        required: true,
        reason: "superseded_author_redirect",
      },
    });
  });
});
