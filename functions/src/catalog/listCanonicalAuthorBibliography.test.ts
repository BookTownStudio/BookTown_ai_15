import { describe, expect, it, vi } from "vitest";

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
    storage: () => ({ bucket: () => ({ name: "test-bucket" }) }),
  },
}));

vi.mock("../attachments/storageSignedUrl", () => ({
  getSignedUrl: vi.fn(async () => ""),
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

class FakeQuerySnap {
  constructor(readonly docs: FakeDocSnap[]) {}
  get size(): number {
    return this.docs.length;
  }
}

class FakeDocRef {
  constructor(private readonly db: FakeDb, private readonly collectionName: string, readonly id: string) {}
  async get(): Promise<FakeDocSnap> {
    return new FakeDocSnap(this.id, this.db.read(this.collectionName, this.id));
  }
}

class FakeQuery {
  private limitValue = Number.POSITIVE_INFINITY;
  constructor(
    private readonly db: FakeDb,
    private readonly collectionName: string,
    private readonly filters: Array<{ field: string; value: unknown }> = []
  ) {}
  where(field: string, operator: string, value: unknown): FakeQuery {
    if (operator !== "==") throw new Error(`Unsupported operator ${operator}`);
    return new FakeQuery(this.db, this.collectionName, [...this.filters, { field, value }]);
  }
  limit(value: number): FakeQuery {
    this.limitValue = value;
    return this;
  }
  async get(): Promise<FakeQuerySnap> {
    const rows = this.db.list(this.collectionName)
      .filter(({ data }) => this.filters.every((filter) => data[filter.field] === filter.value))
      .slice(0, this.limitValue)
      .map(({ id, data }) => new FakeDocSnap(id, data));
    return new FakeQuerySnap(rows);
  }
}

class FakeDb {
  private rows = new Map<string, Map<string, JsonMap>>();
  reset(): void {
    this.rows = new Map();
  }
  collection(name: string): FakeQuery & { doc: (id: string) => FakeDocRef } {
    const query = new FakeQuery(this, name) as FakeQuery & { doc: (id: string) => FakeDocRef };
    query.doc = (id: string) => new FakeDocRef(this, name, id);
    return query;
  }
  set(collection: string, id: string, data: JsonMap): void {
    const bucket = this.rows.get(collection) ?? new Map<string, JsonMap>();
    bucket.set(id, data);
    this.rows.set(collection, bucket);
  }
  read(collection: string, id: string): JsonMap | undefined {
    return this.rows.get(collection)?.get(id);
  }
  list(collection: string): Array<{ id: string; data: JsonMap }> {
    return Array.from(this.rows.get(collection)?.entries() ?? []).map(([id, data]) => ({ id, data }));
  }
}

const fakeDb = new FakeDb();

function publicBook(data: JsonMap): JsonMap {
  return {
    titleEn: "Untitled",
    titleAr: "Untitled",
    authorEn: "Franz Kafka",
    authorAr: "Franz Kafka",
    descriptionEn: "",
    descriptionAr: "",
    genresEn: [],
    genresAr: [],
    rating: 0,
    ratingsCount: 0,
    visibility: "public",
    rightsMode: "public_free",
    ...data,
  };
}

describe("listCanonicalAuthorBibliography", () => {
  it("returns canonical authorId-linked works only", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_kafka", { nameEn: "Franz Kafka", lifecycleState: "canonical" });
    fakeDb.set("books", "trial", publicBook({ titleEn: "The Trial", authorId: "author_kafka", publicationDate: "1925" }));
    fakeDb.set("books", "legacy", publicBook({ titleEn: "Legacy Kafka", authorId: "legacy_kafka" }));

    const { listCanonicalAuthorBibliographyHandler } = await import("./listCanonicalAuthorBibliography");
    const result = await listCanonicalAuthorBibliographyHandler(
      { authorId: "author_kafka" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result.canonicalWorks.map((book) => book.id)).toEqual(["trial"]);
    expect(result.repairWorks).toEqual([]);
    expect(result.bibliographyAuthority).toBe("canonical_author_id");
    expect(result.audit.unlinkedNameMatches.map((book) => book.bookId)).toEqual(["legacy"]);
  });

  it("reports unlinked name matches without promoting them to canon", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_kafka", { nameEn: "Franz Kafka", lifecycleState: "canonical" });
    fakeDb.set("books", "trial", publicBook({ titleEn: "The Trial", authorId: "author_franz_kafka" }));

    const { listCanonicalAuthorBibliographyHandler } = await import("./listCanonicalAuthorBibliography");
    const result = await listCanonicalAuthorBibliographyHandler(
      { authorId: "author_kafka" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result.canonicalWorks).toEqual([]);
    expect(result.totalCanonicalCount).toBe(0);
    expect(result.audit).toMatchObject({
      mode: "dry_run",
      unlinkedNameMatchCount: 1,
      unlinkedNameMatches: [
        {
          bookId: "trial",
          title: "The Trial",
          currentAuthorId: "author_franz_kafka",
          reason: "author_name_match_author_id_mismatch",
        },
      ],
    });
  });

  it("filters non-public canonical matches server-side", async () => {
    fakeDb.reset();
    fakeDb.set("authors", "author_kafka", { nameEn: "Franz Kafka", lifecycleState: "canonical" });
    fakeDb.set("books", "private_trial", publicBook({
      titleEn: "Private Trial",
      authorId: "author_kafka",
      visibility: "private",
    }));

    const { listCanonicalAuthorBibliographyHandler } = await import("./listCanonicalAuthorBibliography");
    const result = await listCanonicalAuthorBibliographyHandler(
      { authorId: "author_kafka" },
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    expect(result.canonicalWorks).toEqual([]);
    expect(result.totalCanonicalCount).toBe(0);
  });
});
