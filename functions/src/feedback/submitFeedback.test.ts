import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let autoIdCounter = 0;
let nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);

class MockTimestamp {
  constructor(private readonly millis: number) {}

  toMillis(): number {
    return this.millis;
  }

  toDate(): Date {
    return new Date(this.millis);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getField(data: DocData, field: string): unknown {
  return field.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, data);
}

function compare(value: unknown, op: string, expected: unknown): boolean {
  if (op === "==") return value === expected;
  if (op === ">") {
    const left = value instanceof MockTimestamp ? value.toMillis() : Number(value);
    const right = expected instanceof MockTimestamp ? expected.toMillis() : Number(expected);
    return left > right;
  }
  throw new Error(`Unsupported operator: ${op}`);
}

function listCollectionDocs(collectionPath: string): Array<{ id: string; path: string; data: DocData }> {
  const base = collectionPath.split("/").filter(Boolean);
  return Array.from(store.entries())
    .filter(([docPath]) => {
      const parts = docPath.split("/").filter(Boolean);
      return parts.length === base.length + 1 && parts.slice(0, base.length).join("/") === collectionPath;
    })
    .map(([docPath, data]) => {
      const parts = docPath.split("/").filter(Boolean);
      return { id: parts[parts.length - 1] || "", path: docPath, data };
    });
}

class MockDocRef {
  constructor(public readonly path: string, public readonly id: string) {}
}

class MockCollectionRef {
  constructor(
    private readonly collectionPath: string,
    private readonly filters: Array<{ field: string; op: string; value: unknown }> = []
  ) {}

  doc(id?: string): MockDocRef {
    const resolvedId = id || `feedback-${++autoIdCounter}`;
    return new MockDocRef(`${this.collectionPath}/${resolvedId}`, resolvedId);
  }

  where(field: string, op: string, value: unknown): MockCollectionRef {
    return new MockCollectionRef(this.collectionPath, [...this.filters, { field, op, value }]);
  }

  async get(): Promise<{ size: number; docs: Array<{ id: string; data: () => DocData }> }> {
    const docs = listCollectionDocs(this.collectionPath)
      .filter(({ data }) => this.filters.every(({ field, op, value }) => compare(getField(data, field), op, value)))
      .map(({ id, data }) => ({ id, data: () => clone(data) }));
    return { size: docs.length, docs };
  }
}

class MockTransaction {
  async get(query: { get: () => Promise<{ size: number; docs: unknown[] }> }) {
    return query.get();
  }

  set(ref: MockDocRef, data: DocData): void {
    store.set(ref.path, data);
  }
}

const firestoreMock = {
  collection(pathName: string): MockCollectionRef {
    return new MockCollectionRef(pathName);
  },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    return handler(new MockTransaction());
  },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  Timestamp: Object.assign(
    {
      now: () => new MockTimestamp(nowMillis),
      fromMillis: (millis: number) => new MockTimestamp(millis),
    },
    MockTimestamp
  ),
});

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (optsOrHandler: unknown, maybeHandler?: unknown) => {
    const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
    return {
      run: handler as (request: unknown) => Promise<unknown>,
      __endpoint: typeof optsOrHandler === "object" ? optsOrHandler : undefined,
    };
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: firestoreFn,
  },
}));

function request(uid: string | null, data: Record<string, unknown>) {
  return {
    auth: uid ? { uid, token: { role: "user" } } : null,
    data,
    rawRequest: {
      headers: {
        "x-correlation-id": "corr-test",
      },
    },
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    source: "drawer",
    intentType: "bug",
    text: "The reader froze when opening a book.",
    contactEmail: "Beta@Example.com",
    clientContext: {
      route: "/reader/book-1",
      viewId: "reader",
      entity: { type: "book", id: "book-1" },
    },
    ...overrides,
  };
}

describe("submitFeedback callable", () => {
  beforeEach(() => {
    store.clear();
    autoIdCounter = 0;
    nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);
  });

  it("creates a canonical feedback report with backend-owned operational fields", async () => {
    const { submitFeedback } = await import("../domains/feedback");

    const result = await submitFeedback.run(request("user-1", validPayload())) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      data: {
        feedbackId: "feedback-1",
        status: "new",
        correlationId: "corr-test",
      },
    });

    const stored = listCollectionDocs("feedback_reports")[0]?.data;
    expect(stored).toMatchObject({
      id: "feedback-1",
      uid: "user-1",
      source: "drawer",
      intentType: "bug",
      status: "new",
      text: "The reader froze when opening a book.",
      contactEmail: "beta@example.com",
      serverContext: {
        authRole: "user",
        callableRegion: "default",
        correlationId: "corr-test",
        schemaVersion: 1,
      },
    });
    expect(stored?.createdAt).toBeInstanceOf(MockTimestamp);
  });

  it("accepts appnav beta contextual telemetry as advisory client context", async () => {
    const { submitFeedback } = await import("../domains/feedback");

    const result = await submitFeedback.run(request("user-1", validPayload({
      source: "appnav_beta",
      intentType: "ux_confusion",
      clientContext: {
        route: "/books/book-1",
        viewId: "bookDetails",
        navigationType: "immersive",
        immersiveView: "bookDetails",
        entity: { type: "book", id: "book-1" },
        activeFilters: { status: "open" },
        layoutMode: "compact",
        openModalIds: [],
        viewportClass: "mobile",
        appVersion: "1.0.0",
        platform: "MacIntel",
      },
    }))) as Record<string, unknown>;

    expect(result).toMatchObject({ success: true });
    expect(listCollectionDocs("feedback_reports")[0]?.data).toMatchObject({
      source: "appnav_beta",
      intentType: "ux_confusion",
      clientContext: {
        route: "/books/book-1",
        entity: { type: "book", id: "book-1" },
        appVersion: "1.0.0",
        platform: "MacIntel",
      },
    });
  });

  it("rejects unauthenticated submissions", async () => {
    const { submitFeedback } = await import("../domains/feedback");

    const result = await submitFeedback.run(request(null, validPayload())) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
      },
    });
    expect(listCollectionDocs("feedback_reports")).toHaveLength(0);
  });

  it("rejects malformed context payloads before writing", async () => {
    const { submitFeedback } = await import("../domains/feedback");

    const result = await submitFeedback.run(
      request("user-1", validPayload({ clientContext: { route: "/x", unsafe: "blocked" } }))
    ) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "INVALID_REQUEST_SCHEMA",
      },
    });
    expect(listCollectionDocs("feedback_reports")).toHaveLength(0);
  });

  it("enforces the 60-second soft cooldown per user", async () => {
    const { submitFeedback } = await import("../domains/feedback");
    store.set("feedback_reports/existing-1", {
      uid: "user-1",
      createdAt: new MockTimestamp(nowMillis - 30_000),
    });

    const result = await submitFeedback.run(request("user-1", validPayload())) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "RESOURCE_EXHAUSTED",
      },
    });
    expect(listCollectionDocs("feedback_reports")).toHaveLength(1);
  });

  it("allows another submission after the 60-second soft cooldown expires", async () => {
    const { submitFeedback } = await import("../domains/feedback");
    store.set("feedback_reports/existing-1", {
      uid: "user-1",
      createdAt: new MockTimestamp(nowMillis - 61_000),
    });

    const result = await submitFeedback.run(request("user-1", validPayload())) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      data: {
        feedbackId: "feedback-1",
        status: "new",
      },
    });
    expect(listCollectionDocs("feedback_reports")).toHaveLength(2);
  });

  it("keeps direct client writes blocked in Firestore rules", () => {
    const repoRoot = path.resolve(process.cwd(), "..");
    const rules = fs.readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
    const start = rules.indexOf("match /feedback_reports/{feedbackId}");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = rules.slice(start, start + 400);
    expect(block).toContain("allow read, create, update, delete: if false");
  });
});
