import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;
const store = new Map<string, DocData>();
let autoId = 0;
let nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);

class MockTimestamp {
  constructor(private readonly millis: number) {}
  toMillis(): number { return this.millis; }
  toDate(): Date { return new Date(this.millis); }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getNested(data: DocData, field: string): unknown {
  return field.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as DocData)[part];
  }, data);
}

function compare(left: unknown, op: string, right: unknown): boolean {
  const leftMillis = left instanceof MockTimestamp ? left.toMillis() : Number(left);
  const rightMillis = right instanceof MockTimestamp ? right.toMillis() : Number(right);
  if (op === "==") return left === right;
  if (op === ">=") return leftMillis >= rightMillis;
  if (op === "<=") return leftMillis <= rightMillis;
  throw new Error(`Unsupported operator: ${op}`);
}

function listCollection(path: string): Array<{ id: string; path: string; data: DocData }> {
  const base = path.split("/").filter(Boolean);
  return Array.from(store.entries())
    .filter(([docPath]) => {
      const parts = docPath.split("/").filter(Boolean);
      return parts.length === base.length + 1 && parts.slice(0, base.length).join("/") === path;
    })
    .map(([docPath, data]) => {
      const parts = docPath.split("/").filter(Boolean);
      return { id: parts[parts.length - 1] || "", path: docPath, data };
    });
}

class MockDocSnapshot {
  constructor(public readonly id: string, private readonly docData?: DocData) {}
  get exists(): boolean { return Boolean(this.docData); }
  data(): DocData | undefined { return this.docData ? { ...this.docData } : undefined; }
}

class MockDocRef {
  constructor(public readonly path: string) {}
  get id(): string { return this.path.split("/").pop() || ""; }
  async get(): Promise<MockDocSnapshot> { return new MockDocSnapshot(this.id, store.get(this.path)); }
  collection(name: string): MockCollectionRef { return new MockCollectionRef(`${this.path}/${name}`); }
}

class MockQuerySnapshot {
  constructor(public readonly docs: MockDocSnapshot[]) {}
}

class MockCollectionRef {
  constructor(
    private readonly path: string,
    private readonly filters: Array<{ field: string; op: string; value: unknown }> = [],
    private readonly limitCount: number | null = null,
    private readonly cursor: { createdAtMillis: number; id: string } | null = null
  ) {}

  doc(id?: string): MockDocRef {
    return new MockDocRef(`${this.path}/${id || `activity-${++autoId}`}`);
  }

  where(field: string, op: string, value: unknown): MockCollectionRef {
    return new MockCollectionRef(this.path, [...this.filters, { field, op, value }], this.limitCount, this.cursor);
  }

  orderBy(): MockCollectionRef {
    return this;
  }

  startAfter(createdAt: MockTimestamp, id: string): MockCollectionRef {
    return new MockCollectionRef(this.path, this.filters, this.limitCount, { createdAtMillis: createdAt.toMillis(), id });
  }

  limit(count: number): MockCollectionRef {
    return new MockCollectionRef(this.path, this.filters, count, this.cursor);
  }

  async get(): Promise<MockQuerySnapshot> {
    let docs = listCollection(this.path)
      .filter(({ data }) => this.filters.every(({ field, op, value }) => compare(getNested(data, field), op, value)))
      .sort((a, b) => {
        const timeDelta = (b.data.createdAt as MockTimestamp).toMillis() - (a.data.createdAt as MockTimestamp).toMillis();
        return timeDelta || b.id.localeCompare(a.id);
      });

    if (this.cursor) {
      docs = docs.filter(({ id, data }) => {
        const millis = (data.createdAt as MockTimestamp).toMillis();
        return millis < this.cursor!.createdAtMillis || (millis === this.cursor!.createdAtMillis && id < this.cursor!.id);
      });
    }

    if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
    return new MockQuerySnapshot(docs.map(({ id, data }) => new MockDocSnapshot(id, data)));
  }
}

class MockTransaction {
  async get(refOrQuery: MockDocRef | MockCollectionRef): Promise<MockDocSnapshot | MockQuerySnapshot> {
    return refOrQuery.get();
  }
  update(ref: MockDocRef, data: DocData): void {
    store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
  }
  set(ref: MockDocRef, data: DocData): void {
    store.set(ref.path, data);
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef { return new MockCollectionRef(path); },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    return handler(new MockTransaction());
  },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  Timestamp: {
    now: () => new MockTimestamp(nowMillis),
    fromMillis: (millis: number) => new MockTimestamp(millis),
  },
  FieldPath: {
    documentId: () => "__name__",
  },
});

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (optsOrHandler: unknown, maybeHandler?: unknown) => {
    const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
    return { run: handler as (request: unknown) => Promise<unknown> };
  },
}));
vi.mock("../firebaseAdmin", () => ({ admin: { firestore: firestoreFn } }));

function request(uid: string | null, role: string, data: Record<string, unknown>) {
  return { auth: uid ? { uid, token: { role } } : null, data };
}

function seedReport(id: string, overrides: DocData = {}): void {
  store.set(`feedback_reports/${id}`, {
    id,
    uid: "user-1",
    source: "drawer",
    intentType: "bug",
    status: "new",
    text: `Report ${id}`,
    contactEmail: null,
    clientContext: null,
    serverContext: { authRole: "user", callableRegion: "default", correlationId: id, schemaVersion: 1 },
    createdAt: new MockTimestamp(nowMillis - Number(id.replace(/\D/g, "")) * 1000),
    updatedAt: new MockTimestamp(nowMillis - Number(id.replace(/\D/g, "")) * 1000),
    ...overrides,
  });
}

describe("admin feedback operations", () => {
  beforeEach(() => {
    store.clear();
    autoId = 0;
    nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);
  });

  it("enforces moderator access for admin list", async () => {
    const { adminListFeedbackReports } = await import("../domains/feedback");
    const result = await adminListFeedbackReports.run(request("user-1", "user", { limit: 10 })) as DocData;
    expect(result).toMatchObject({ success: false, error: { code: "PERMISSION_DENIED" } });
  });

  it("returns bounded cursor pagination in createdAt desc order", async () => {
    const { adminListFeedbackReports } = await import("../domains/feedback");
    seedReport("report-1");
    seedReport("report-2");
    seedReport("report-3");

    const first = await adminListFeedbackReports.run(request("mod-1", "moderator", { limit: 2 })) as { success: true; data: { reports: Array<{ id: string }>; nextCursor: string | null } };
    expect(first.data.reports.map((report) => report.id)).toEqual(["report-1", "report-2"]);
    expect(first.data.nextCursor).toEqual(expect.any(String));

    const second = await adminListFeedbackReports.run(request("mod-1", "moderator", { limit: 2, cursor: first.data.nextCursor })) as { success: true; data: { reports: Array<{ id: string }> } };
    expect(second.data.reports.map((report) => report.id)).toEqual(["report-3"]);
  });

  it("enforces status transitions and writes activity", async () => {
    const { adminUpdateFeedbackStatus } = await import("../domains/feedback");
    seedReport("report-1");

    const result = await adminUpdateFeedbackStatus.run(request("mod-1", "moderator", { feedbackId: "report-1", status: "triaged" })) as DocData;
    expect(result).toMatchObject({ success: true, data: { report: { status: "triaged", updatedBy: "mod-1" } } });
    expect(store.get("feedback_reports/report-1")).toMatchObject({ status: "triaged", updatedBy: "mod-1" });
    expect(listCollection("feedback_reports/report-1/activity")[0]?.data).toMatchObject({
      type: "status_changed",
      actorUid: "mod-1",
      payload: { fromStatus: "new", toStatus: "triaged" },
    });
  });

  it("rejects invalid status transitions without activity", async () => {
    const { adminUpdateFeedbackStatus } = await import("../domains/feedback");
    seedReport("report-1");

    const result = await adminUpdateFeedbackStatus.run(request("mod-1", "moderator", { feedbackId: "report-1", status: "closed" })) as DocData;
    expect(result).toMatchObject({ success: false, error: { code: "FAILED_PRECONDITION" } });
    expect(listCollection("feedback_reports/report-1/activity")).toHaveLength(0);
  });

  it("adds internal notes to the activity timeline", async () => {
    const { adminAddFeedbackNote } = await import("../domains/feedback");
    seedReport("report-1");

    const result = await adminAddFeedbackNote.run(request("mod-1", "moderator", { feedbackId: "report-1", note: "Follow up with beta user." })) as DocData;
    expect(result).toMatchObject({ success: true, data: { activity: { type: "note_added", actorUid: "mod-1" } } });
    expect(listCollection("feedback_reports/report-1/activity")[0]?.data).toMatchObject({
      type: "note_added",
      payload: { note: "Follow up with beta user." },
    });
  });

  it("enforces moderator access for CSV export", async () => {
    const { adminExportFeedbackCsv } = await import("../domains/feedback");
    seedReport("report-1");

    const result = await adminExportFeedbackCsv.run(request("user-1", "user", {})) as DocData;

    expect(result).toMatchObject({ success: false, error: { code: "PERMISSION_DENIED" } });
  });

  it("exports stable escaped CSV rows", async () => {
    const { adminExportFeedbackCsv } = await import("../domains/feedback");
    seedReport("report-1", {
      text: "Line one,\n\"quoted\" line",
      contactEmail: "reader@example.com",
      clientContext: {
        route: "/reader/book-1",
        appVersion: "1.0.0",
        platform: "web",
        entity: { type: "book", id: "book-1" },
      },
    });

    const result = await adminExportFeedbackCsv.run(request("mod-1", "moderator", { feedbackId: "report-1" })) as {
      success: true;
      data: { csv: string; rowCount: number };
    };

    expect(result.data.rowCount).toBe(1);
    expect(result.data.csv.split("\n")[0]).toBe("feedbackId,createdAt,updatedAt,status,source,intentType,text,contactEmail,route,entityType,entityId,appVersion,platform,assignedTo");
    expect(result.data.csv).toContain('"Line one,\n""quoted"" line"');
    expect(result.data.csv).toContain("/reader/book-1,book,book-1,1.0.0,web");
  });

  it("exports machine-readable JSON with stable schema", async () => {
    const { adminExportFeedbackJson } = await import("../domains/feedback");
    seedReport("report-1", { status: "triaged" });

    const result = await adminExportFeedbackJson.run(request("mod-1", "moderator", { status: "triaged" })) as {
      success: true;
      data: { export: { schemaVersion: number; rows: Array<{ feedbackId: string; status: string }>; filters: DocData } };
    };

    expect(result.data.export.schemaVersion).toBe(1);
    expect(result.data.export.filters).toMatchObject({ status: "triaged" });
    expect(result.data.export.rows).toEqual([
      expect.objectContaining({ feedbackId: "report-1", status: "triaged" }),
    ]);
  });

  it("exports filtered result sets only", async () => {
    const { adminExportFeedbackJson } = await import("../domains/feedback");
    seedReport("report-1", { intentType: "bug" });
    seedReport("report-2", { intentType: "praise" });

    const result = await adminExportFeedbackJson.run(request("mod-1", "moderator", { intentType: "praise" })) as {
      success: true;
      data: { rowCount: number; export: { rows: Array<{ feedbackId: string }> } };
    };

    expect(result.data.rowCount).toBe(1);
    expect(result.data.export.rows.map((row) => row.feedbackId)).toEqual(["report-2"]);
  });

  it("bounds export result size", async () => {
    const { adminExportFeedbackJson } = await import("../domains/feedback");
    for (let index = 1; index <= 3; index += 1) {
      seedReport(`report-${index}`);
    }

    const result = await adminExportFeedbackJson.run(request("mod-1", "moderator", { limit: 2 })) as {
      success: true;
      data: { rowCount: number; export: { rows: unknown[] } };
    };

    expect(result.data.rowCount).toBe(2);
    expect(result.data.export.rows).toHaveLength(2);
  });
});
