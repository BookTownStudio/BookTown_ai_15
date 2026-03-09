import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeSnapshot {
  constructor(private readonly docsInternal: Array<{ id: string; data: Record<string, unknown> }>) {}

  get docs() {
    return this.docsInternal.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
    }));
  }
}

class FakeQuery {
  constructor(
    private readonly records: Map<string, Record<string, unknown>>,
    private readonly constraints: Array<{ op: string; value: string }> = []
  ) {}

  where(_fieldPath: unknown, op: string, value: string) {
    return new FakeQuery(this.records, [...this.constraints, { op, value }]);
  }

  limit(_value: number) {
    return this;
  }

  async get() {
    const lowerBound = this.constraints.find((entry) => entry.op === ">=")?.value || "";
    const upperBound = this.constraints.find((entry) => entry.op === "<")?.value || "\uf8ff";

    const docs = Array.from(this.records.entries())
      .filter(([id]) => id >= lowerBound && id < upperBound)
      .map(([id, data]) => ({ id, data }));

    return new FakeSnapshot(docs);
  }
}

class FakeFirestore {
  private readonly collections = new Map<string, Map<string, Record<string, unknown>>>();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }

    return new FakeQuery(this.collections.get(name)!);
  }

  write(collectionName: string, id: string, data: Record<string, unknown>) {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, new Map());
    }
    this.collections.get(collectionName)!.set(id, data);
  }

  clear() {
    this.collections.clear();
  }
}

const fakeDb = new FakeFirestore();

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  },
  onCall: (_options: unknown, handler: unknown) => handler,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => "__name__",
  },
  Timestamp: class Timestamp {
    private readonly millis: number;

    constructor(millis: number) {
      this.millis = millis;
    }

    toMillis() {
      return this.millis;
    }
  },
}));

describe("getReaderHighlightsHandler", () => {
  beforeEach(() => {
    fakeDb.clear();

    fakeDb.write("reader_highlights", "user_reader_book_1_page_10", {
      highlightId: "page_10",
      bookId: "book_1",
      quote: "Quote 10",
      color: "yellow",
      page: 10,
      updatedAt: { toDate: () => new Date("2025-01-10T00:00:00.000Z") },
    });
    fakeDb.write("reader_highlights", "user_reader_book_1_page_3", {
      highlightId: "page_3",
      bookId: "book_1",
      quote: "Quote 3",
      color: "yellow",
      page: 3,
      updatedAt: { toDate: () => new Date("2025-01-09T00:00:00.000Z") },
    });
    fakeDb.write("reader_highlights", "other_user_book_1_page_5", {
      highlightId: "page_5",
      bookId: "book_1",
      quote: "Other user",
      color: "yellow",
      page: 5,
      updatedAt: { toDate: () => new Date("2025-01-08T00:00:00.000Z") },
    });
  });

  it("returns only the caller highlights for a specific book", async () => {
    const { getReaderHighlightsHandler } = await import("../getReaderHighlights");

    const result = await getReaderHighlightsHandler({
      auth: { uid: "user_reader" },
      data: { bookId: "book_1" },
    });

    expect(result.highlights).toHaveLength(2);
    expect(result.highlights[0].highlightId).toBe("page_10");
    expect(result.highlights[1].highlightId).toBe("page_3");
    expect(
      result.highlights.every((highlight: { bookId: string }) => highlight.bookId === "book_1")
    ).toBe(true);
  });
});
