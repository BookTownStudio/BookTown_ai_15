import { beforeEach, describe, expect, it, vi } from "vitest";

type JsonMap = Record<string, any>;

class FakeDocSnapshot {
  constructor(
    readonly id: string,
    private readonly value: JsonMap | null
  ) {}

  get exists(): boolean {
    return this.value !== null;
  }

  data(): JsonMap {
    return this.value ? { ...this.value } : {};
  }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}
}

class FakeQuery {
  constructor(
    private readonly store: FakeFirestore,
    private readonly collectionName: string,
    private readonly lowerBound: string | null = null,
    private readonly upperBound: string | null = null,
    private readonly limitCount: number | null = null
  ) {}

  where(field: unknown, op: string, value: string): FakeQuery {
    const isDocumentIdField =
      field &&
      typeof field === "object" &&
      "kind" in (field as Record<string, unknown>) &&
      (field as { kind?: unknown }).kind === "documentId";
    if (!isDocumentIdField) {
      throw new Error("FakeQuery only supports documentId filters.");
    }
    if (op === ">=") {
      return new FakeQuery(this.store, this.collectionName, value, this.upperBound, this.limitCount);
    }
    if (op === "<") {
      return new FakeQuery(this.store, this.collectionName, this.lowerBound, value, this.limitCount);
    }
    throw new Error(`Unsupported operator ${op}`);
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.store, this.collectionName, this.lowerBound, this.upperBound, count);
  }

  async get(): Promise<FakeQuerySnapshot> {
    let docs = this.store.list(this.collectionName);
    if (this.lowerBound !== null) {
      docs = docs.filter((entry) => entry.id >= this.lowerBound!);
    }
    if (this.upperBound !== null) {
      docs = docs.filter((entry) => entry.id < this.upperBound!);
    }
    docs.sort((left, right) => left.id.localeCompare(right.id));
    if (typeof this.limitCount === "number") {
      docs = docs.slice(0, this.limitCount);
    }
    return new FakeQuerySnapshot(
      docs.map((entry) => new FakeDocSnapshot(entry.id, entry.value))
    );
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(
    store: FakeFirestore,
    readonly name: string
  ) {
    super(store, name);
  }
}

class FakeFirestore {
  private data = new Map<string, Map<string, JsonMap>>();

  reset(): void {
    this.data.clear();
  }

  collection(name: string): FakeCollectionRef {
    if (!this.data.has(name)) {
      this.data.set(name, new Map<string, JsonMap>());
    }
    return new FakeCollectionRef(this, name);
  }

  write(collection: string, id: string, value: JsonMap): void {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map<string, JsonMap>());
    }
    (this.data.get(collection) as Map<string, JsonMap>).set(id, { ...value });
  }

  list(collection: string): Array<{ id: string; value: JsonMap }> {
    const bucket = this.data.get(collection);
    if (!bucket) return [];
    return Array.from(bucket.entries()).map(([id, value]) => ({
      id,
      value: { ...value },
    }));
  }
}

const fakeDb = new FakeFirestore();

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

vi.mock("firebase-admin/firestore", async () => {
  const actual = await vi.importActual("firebase-admin/firestore");
  return {
    ...actual,
    FieldPath: {
      documentId: () => ({ kind: "documentId" }),
    },
  };
});

describe("getReaderBookmarks", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeDb.write("reader_bookmarks", "user_reader_book_1_page_10", {
      bookmarkId: "page_10",
      bookId: "book_1",
      label: "Page 10",
      page: 10,
      updatedAt: { toDate: () => new Date("2026-03-08T10:00:00.000Z") },
    });
    fakeDb.write("reader_bookmarks", "user_reader_book_1_page_3", {
      bookmarkId: "page_3",
      bookId: "book_1",
      label: "Page 3",
      page: 3,
      updatedAt: { toDate: () => new Date("2026-03-08T09:00:00.000Z") },
    });
    fakeDb.write("reader_bookmarks", "other_user_book_1_page_5", {
      bookmarkId: "page_5",
      bookId: "book_1",
      label: "Page 5",
      page: 5,
      updatedAt: { toDate: () => new Date("2026-03-08T11:00:00.000Z") },
    });
  });

  it("returns only the caller bookmarks for a specific book", async () => {
    const { getReaderBookmarksHandler } = await import("../getReaderBookmarks");

    const result = await getReaderBookmarksHandler({
      auth: { uid: "user_reader", token: {} },
      data: { bookId: "book_1" },
    });

    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks[0].bookmarkId).toBe("page_10");
    expect(result.bookmarks[1].bookmarkId).toBe("page_3");
    expect(result.bookmarks.every((bookmark: { bookId: string }) => bookmark.bookId === "book_1")).toBe(true);
  });
});
