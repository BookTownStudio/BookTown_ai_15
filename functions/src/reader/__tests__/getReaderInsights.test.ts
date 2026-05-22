import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

type JsonMap = Record<string, any>;
type WhereClause = { field: string; op: string; value: any };
type OrderClause = { field: string; direction: "asc" | "desc" };

class FakeQuerySnapshot {
  constructor(private readonly rows: JsonMap[]) {}

  forEach(callback: (doc: { data: () => JsonMap }) => void): void {
    for (const row of this.rows) {
      callback({ data: () => ({ ...row }) });
    }
  }
}

class FakeCountSnapshot {
  constructor(private readonly countValue: number) {}

  data(): { count: number } {
    return { count: this.countValue };
  }
}

class FakeQuery {
  constructor(
    private readonly store: FakeFirestore,
    private readonly collectionName: string,
    private readonly whereClauses: WhereClause[] = [],
    private readonly orderClauses: OrderClause[] = [],
    private readonly limitValue: number | null = null
  ) {}

  where(field: string, op: string, value: any): FakeQuery {
    this.store.recordQuery(this.collectionName, "where", { field, op, value });
    return new FakeQuery(
      this.store,
      this.collectionName,
      [...this.whereClauses, { field, op, value }],
      this.orderClauses,
      this.limitValue
    );
  }

  orderBy(field: string, direction: "asc" | "desc"): FakeQuery {
    this.store.recordQuery(this.collectionName, "orderBy", { field, direction });
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.whereClauses,
      [...this.orderClauses, { field, direction }],
      this.limitValue
    );
  }

  limit(value: number): FakeQuery {
    this.store.recordQuery(this.collectionName, "limit", { value });
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.whereClauses,
      this.orderClauses,
      value
    );
  }

  count(): { get: () => Promise<FakeCountSnapshot> } {
    this.store.recordQuery(this.collectionName, "count", {});
    return {
      get: async () => new FakeCountSnapshot(this.apply().length),
    };
  }

  async get(): Promise<FakeQuerySnapshot> {
    return new FakeQuerySnapshot(this.apply());
  }

  private apply(): JsonMap[] {
    let rows = this.store.rows(this.collectionName);

    for (const clause of this.whereClauses) {
      rows = rows.filter((row) => {
        if (clause.op === "==") return row[clause.field] === clause.value;
        if (clause.op === "in" && Array.isArray(clause.value)) {
          return clause.value.includes(row[clause.field]);
        }
        throw new Error(`Unsupported where op: ${clause.op}`);
      });
    }

    for (const order of [...this.orderClauses].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = toMillis(a[order.field]);
        const bv = toMillis(b[order.field]);
        return order.direction === "desc" ? bv - av : av - bv;
      });
    }

    return this.limitValue === null ? rows : rows.slice(0, this.limitValue);
  }
}

class FakeFirestore {
  private data = new Map<string, JsonMap[]>();
  readonly queryLog: Array<{ collection: string; action: string; payload: JsonMap }> = [];

  reset(): void {
    this.data.clear();
    this.queryLog.length = 0;
  }

  seed(collection: string, rows: JsonMap[]): void {
    this.data.set(collection, rows.map((row) => ({ ...row })));
  }

  rows(collection: string): JsonMap[] {
    return (this.data.get(collection) ?? []).map((row) => ({ ...row }));
  }

  collection(name: string): FakeQuery {
    return new FakeQuery(this, name);
  }

  recordQuery(collection: string, action: string, payload: JsonMap): void {
    this.queryLog.push({ collection, action, payload });
  }
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

const fakeDb = new FakeFirestore();

vi.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: () => fakeDb,
  },
}));

describe("getReaderInsights", () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it("returns a bounded active reading projection from reading_progress only", async () => {
    const { getReaderInsightsHandler } = await import("../getReaderInsights");
    const uid = "user_insights";

    fakeDb.seed("reading_progress", [
      {
        uid,
        bookId: "paused_newer",
        status_state: "paused",
        progress: 0.4,
        continuityLevel: "manual",
        sourceType: "physical",
        lastActiveAt: Timestamp.fromMillis(5_000),
      },
      {
        uid,
        bookId: "reading_older",
        status_state: "reading",
        progress: 0.2,
        continuityLevel: "full_runtime",
        sourceType: "in_app_epub",
        lastActiveAt: Timestamp.fromMillis(4_000),
      },
      {
        uid,
        bookId: "rereading_newest",
        status_state: "rereading",
        progress: 0.15,
        continuityLevel: "manual",
        sourceType: "physical",
        lastActiveAt: Timestamp.fromMillis(9_000),
      },
      {
        uid,
        bookId: "abandoned",
        status_state: "abandoned",
        progress: 0.3,
        lastActiveAt: Timestamp.fromMillis(6_000),
      },
      {
        uid,
        bookId: "completed",
        status_state: "completed",
        progress: 1,
        lastActiveAt: Timestamp.fromMillis(7_000),
      },
      {
        uid: "other",
        bookId: "other_reading",
        status_state: "reading",
        progress: 0.8,
        lastActiveAt: Timestamp.fromMillis(8_000),
      },
    ]);
    fakeDb.seed("reader_events", []);

    const result = await getReaderInsightsHandler({
      auth: { uid },
      data: { limit: 10 },
    });

    expect(result.currentlyReading.map((row: JsonMap) => row.bookId)).toEqual([
      "reading_older",
      "rereading_newest",
      "paused_newer",
    ]);
    expect(result.currentlyReading[0]).toMatchObject({
      status_state: "reading",
      continuityLevel: "full_runtime",
      sourceType: "in_app_epub",
    });
    expect(result.currentlyReading[1]).toMatchObject({
      status_state: "rereading",
      continuityLevel: "manual",
      sourceType: "physical",
    });
    expect(result.currentlyReading[2]).toMatchObject({
      status_state: "paused",
      continuityLevel: "manual",
      sourceType: "physical",
    });
    expect(result.finishedCount).toBe(1);

    expect(fakeDb.queryLog).toEqual(
      expect.arrayContaining([
        {
          collection: "reading_progress",
          action: "where",
          payload: { field: "uid", op: "==", value: uid },
        },
        {
          collection: "reading_progress",
          action: "where",
          payload: { field: "status_state", op: "in", value: ["reading", "paused", "rereading"] },
        },
        {
          collection: "reading_progress",
          action: "orderBy",
          payload: { field: "lastActiveAt", direction: "desc" },
        },
        {
          collection: "reading_progress",
          action: "limit",
          payload: { value: 10 },
        },
      ])
    );
  });

  it("caps active projection requests at the server maximum", async () => {
    const { getReaderInsightsHandler } = await import("../getReaderInsights");
    const uid = "user_insights";
    fakeDb.seed("reading_progress", []);
    fakeDb.seed("reader_events", []);

    await getReaderInsightsHandler({
      auth: { uid },
      data: { limit: 5000 },
    });

    expect(fakeDb.queryLog).toContainEqual({
      collection: "reading_progress",
      action: "limit",
      payload: { value: 50 },
    });
  });
});
