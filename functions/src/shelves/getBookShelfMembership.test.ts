import { beforeEach, describe, expect, it, vi } from "vitest";

type JsonMap = Record<string, any>;
type WhereClause = { field: string; value: any };
type OrderClause = { field: string; direction: "asc" | "desc" };

class FakeDocSnapshot {
  constructor(private readonly value: JsonMap | null) {}
  get exists(): boolean { return this.value !== null; }
  data(): JsonMap { return this.value ? { ...this.value } : {}; }
}

class FakeQueryDocumentSnapshot {
  constructor(readonly id: string, private readonly value: JsonMap) {}
  data(): JsonMap { return { ...this.value }; }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeQueryDocumentSnapshot[]) {}
}

class FakeDocRef {
  constructor(private readonly store: FakeFirestore, readonly path: string) {}
  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.store.readPath(this.path));
  }
}

class FakeCollectionRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
    private readonly whereClauses: WhereClause[] = [],
    private readonly orderClauses: OrderClause[] = [],
    private readonly limitValue: number | null = null
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.store, `${this.path}/${id}`);
  }

  where(field: string, _op: string, value: any): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "where", payload: { field, value } });
    return new FakeCollectionRef(this.store, this.path, [...this.whereClauses, { field, value }], this.orderClauses, this.limitValue);
  }

  orderBy(field: string, direction: "asc" | "desc"): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "orderBy", payload: { field, direction } });
    return new FakeCollectionRef(this.store, this.path, this.whereClauses, [...this.orderClauses, { field, direction }], this.limitValue);
  }

  limit(value: number): FakeCollectionRef {
    this.store.queryLog.push({ collection: this.path, action: "limit", payload: { value } });
    return new FakeCollectionRef(this.store, this.path, this.whereClauses, this.orderClauses, value);
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

describe("getBookShelfMembership", () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it("returns bounded membership from shelf_books without reading all shelves", async () => {
    const { getBookShelfMembershipHandler } = await import("./getBookShelfMembership");
    fakeDb.seed("shelves/shelf_a", { ownerId: "user_1", titleEn: "Favorites" });
    fakeDb.seed("shelves/shelf_b", { ownerId: "user_1", titleEn: "To Study" });
    fakeDb.seed("shelf_books/shelf_a_book_1", {
      ownerId: "user_1",
      shelfId: "shelf_a",
      bookId: "book_1",
      addedAt: "2026-01-02T00:00:00.000Z",
    });
    fakeDb.seed("shelf_books/shelf_b_book_1", {
      ownerId: "user_1",
      shelfId: "shelf_b",
      bookId: "book_1",
      addedAt: "2026-01-01T00:00:00.000Z",
    });
    fakeDb.seed("shelf_books/shelf_other_book_2", {
      ownerId: "user_1",
      shelfId: "shelf_other",
      bookId: "book_2",
      addedAt: "2026-01-03T00:00:00.000Z",
    });
    fakeDb.seed("reading_progress/user_1_book_1", {
      status_state: "reading",
      updatedAtIso: "2026-01-04T00:00:00.000Z",
    });

    const result = await getBookShelfMembershipHandler({
      auth: { uid: "user_1" },
      data: { uid: "user_1", bookId: "book_1" },
    });

    expect(result.membershipAuthority).toBe("shelf_books");
    expect(result.shelfIds).toEqual(["shelf_a", "shelf_b"]);
    expect(result.shelfNames).toEqual(["Favorites", "To Study"]);
    expect(result.readingState).toMatchObject({ exists: true, status_state: "reading" });
    expect(fakeDb.queryLog).toEqual(expect.arrayContaining([
      { collection: "shelf_books", action: "where", payload: { field: "ownerId", value: "user_1" } },
      { collection: "shelf_books", action: "where", payload: { field: "bookId", value: "book_1" } },
      { collection: "shelf_books", action: "limit", payload: { value: 51 } },
    ]));
  });
});
