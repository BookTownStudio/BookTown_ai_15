import { beforeEach, describe, expect, it, vi } from "vitest";

type JsonMap = Record<string, any>;
type WhereClause = { field: string; op: string; value: any };
type OrderClause = { field: string; direction: "asc" | "desc" };

class FakeDocSnapshot {
  constructor(private readonly value: JsonMap | null) {}
  get exists(): boolean { return this.value !== null; }
  data(): JsonMap { return this.value ? { ...this.value } : {}; }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeQueryDocumentSnapshot[]) {}
  get empty(): boolean { return this.docs.length === 0; }
  get size(): number { return this.docs.length; }
}

class FakeQueryDocumentSnapshot {
  constructor(readonly id: string, private readonly value: JsonMap) {}
  data(): JsonMap { return { ...this.value }; }
}

class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
    readonly id: string
  ) {}
  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.store.readPath(this.path));
  }
  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }
}

class FakeCollectionRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
    private readonly whereClauses: WhereClause[] = [],
    private readonly orderClauses: OrderClause[] = [],
    private readonly limitValue: number | null = null,
    private readonly cursor: unknown[] | null = null
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.store, `${this.path}/${id}`, id);
  }

  where(field: string, op: string, value: any): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "where", payload: { field, op, value } });
    return new FakeCollectionRef(this.store, this.path, [...this.whereClauses, { field, op, value }], this.orderClauses, this.limitValue, this.cursor);
  }

  orderBy(field: string, direction: "asc" | "desc"): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "orderBy", payload: { field, direction } });
    return new FakeCollectionRef(this.store, this.path, this.whereClauses, [...this.orderClauses, { field, direction }], this.limitValue, this.cursor);
  }

  limit(value: number): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "limit", payload: { value } });
    return new FakeCollectionRef(this.store, this.path, this.whereClauses, this.orderClauses, value, this.cursor);
  }

  startAfter(...values: unknown[]): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "startAfter", payload: { values } });
    return new FakeCollectionRef(this.store, this.path, this.whereClauses, this.orderClauses, this.limitValue, values);
  }

  async get(): Promise<FakeQuerySnapshot> {
    let rows = this.store.rowsForCollection(this.path);
    for (const clause of this.whereClauses) {
      rows = rows.filter((row) => row.data[clause.field] === clause.value);
    }
    for (const order of [...this.orderClauses].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = String(a.data[order.field] ?? "");
        const bv = String(b.data[order.field] ?? "");
        return order.direction === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.cursor && this.orderClauses.length >= 2) {
      const [addedAt, bookId] = this.cursor;
      rows = rows.filter((row) => {
        const rowAddedAt = String(row.data.addedAt ?? "");
        const rowBookId = String(row.data.bookId ?? "");
        return rowAddedAt > String(addedAt) || (rowAddedAt === String(addedAt) && rowBookId > String(bookId));
      });
    }
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    return new FakeQuerySnapshot(rows.map((row) => new FakeQueryDocumentSnapshot(row.id, row.data)));
  }
}

class FakeFirestore {
  private docs = new Map<string, JsonMap>();
  readonly queryLog: Array<{ collection: string; action: string; payload: JsonMap }> = [];

  reset(): void {
    this.docs.clear();
    this.queryLog.length = 0;
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this, name);
  }

  seed(path: string, value: JsonMap): void {
    this.docs.set(path, { ...value });
  }

  readPath(path: string): JsonMap | null {
    const value = this.docs.get(path);
    return value ? { ...value } : null;
  }

  rowsForCollection(path: string): Array<{ id: string; data: JsonMap }> {
    const prefix = `${path}/`;
    return Array.from(this.docs.entries())
      .filter(([docPath]) => docPath.startsWith(prefix) && !docPath.slice(prefix.length).includes("/"))
      .map(([docPath, data]) => ({
        id: docPath.slice(prefix.length),
        data: { ...data },
      }));
  }
}

const fakeDb = new FakeFirestore();

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

describe("listShelfEntries", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeDb.seed("shelves/shelf_1", {
      ownerId: "user_1",
      visibility: "private",
      titleEn: "Shelf",
    });
  });

  it("lists canonical shelf_books entries with bounded pagination", async () => {
    const { listShelfEntriesHandler } = await import("./listShelfEntries");
    fakeDb.seed("shelf_books/shelf_1_book_b", {
      shelfId: "shelf_1",
      ownerId: "user_1",
      bookId: "book_b",
      addedAt: "2026-01-02T00:00:00.000Z",
      snapshot: { titleEn: "B" },
    });
    fakeDb.seed("shelf_books/shelf_1_book_a", {
      shelfId: "shelf_1",
      ownerId: "user_1",
      bookId: "book_a",
      addedAt: "2026-01-01T00:00:00.000Z",
      snapshot: { titleEn: "A" },
    });

    const result = await listShelfEntriesHandler({
      auth: { uid: "user_1" },
      data: { shelfId: "shelf_1", limit: 1 },
    });

    expect(result.items.map((entry: JsonMap) => entry.bookId)).toEqual(["book_a"]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual({
      addedAt: "2026-01-01T00:00:00.000Z",
      bookId: "book_a",
    });
    expect(result.membershipAuthority).toBe("shelf_books");
    expect(fakeDb.queryLog).toEqual(expect.arrayContaining([
      { collection: "shelf_books", action: "where", payload: { field: "shelfId", op: "==", value: "shelf_1" } },
      { collection: "shelf_books", action: "where", payload: { field: "ownerId", op: "==", value: "user_1" } },
      { collection: "shelf_books", action: "orderBy", payload: { field: "addedAt", direction: "asc" } },
      { collection: "shelf_books", action: "orderBy", payload: { field: "bookId", direction: "asc" } },
      { collection: "shelf_books", action: "limit", payload: { value: 2 } },
    ]));
  });

  it("does not depend on legacy nested projection documents", async () => {
    const { listShelfEntriesHandler } = await import("./listShelfEntries");
    fakeDb.seed("users/user_1/shelves/shelf_1/books/legacy_book", {
      bookId: "legacy_book",
      addedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await listShelfEntriesHandler({
      auth: { uid: "user_1" },
      data: { shelfId: "shelf_1", limit: 10 },
    });

    expect(result.items).toEqual([]);
    expect(result.source).toBe("shelf_books");
    expect(fakeDb.queryLog.some((entry) => entry.collection === "users/user_1/shelves/shelf_1/books")).toBe(true);
  });
});
