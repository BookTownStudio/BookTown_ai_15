import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;
const store = new Map<string, DocData>();
const files = new Map<string, { contentType: string; size: number; deleted?: boolean }>();
let autoId = 0;
let nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);

class MockTimestamp {
  constructor(private readonly millis: number) {}
  toMillis(): number { return this.millis; }
  toDate(): Date { return new Date(this.millis); }
}

const serverTimestamp = () => new MockTimestamp(nowMillis);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectionDocs(path: string): Array<{ id: string; path: string; data: DocData }> {
  const base = path.split("/").filter(Boolean);
  return Array.from(store.entries())
    .filter(([docPath]) => {
      const parts = docPath.split("/").filter(Boolean);
      return parts.length === base.length + 1 && parts.slice(0, base.length).join("/") === path;
    })
    .map(([docPath, data]) => ({ id: docPath.split("/").pop() || "", path: docPath, data }));
}

class MockDocSnapshot {
  constructor(public readonly id: string, private readonly value?: DocData) {}
  get exists(): boolean { return Boolean(this.value); }
  data(): DocData | undefined { return this.value ? { ...this.value } : undefined; }
}

class MockDocRef {
  constructor(public readonly path: string) {}
  get id(): string { return this.path.split("/").pop() || ""; }
  async get(): Promise<MockDocSnapshot> { return new MockDocSnapshot(this.id, store.get(this.path)); }
  async set(data: DocData): Promise<void> { store.set(this.path, materialize(data)); }
  async update(data: DocData): Promise<void> { store.set(this.path, { ...(store.get(this.path) ?? {}), ...materialize(data) }); }
  collection(name: string): MockCollectionRef { return new MockCollectionRef(`${this.path}/${name}`); }
}

function materialize(data: DocData): DocData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value && typeof value === "object" && (value as any).__serverTimestamp ? serverTimestamp() : value]));
}

class MockCollectionRef {
  constructor(private readonly path: string, private readonly filters: Array<{ field: string; value: unknown }> = [], private readonly limitCount: number | null = null) {}
  doc(id?: string): MockDocRef { return new MockDocRef(`${this.path}/${id || `auto-${++autoId}`}`); }
  where(field: string, op: string, value: unknown): MockCollectionRef {
    if (op !== "==" && op !== "in") throw new Error(`Unsupported op ${op}`);
    return new MockCollectionRef(this.path, [...this.filters, { field, value }], this.limitCount);
  }
  orderBy(): MockCollectionRef { return this; }
  limit(count: number): MockCollectionRef { return new MockCollectionRef(this.path, this.filters, count); }
  async get(): Promise<{ size: number; docs: MockDocSnapshot[] }> {
    let docs = collectionDocs(this.path).filter(({ data }) => this.filters.every(({ field, value }) => {
      const current = data[field];
      return Array.isArray(value) ? value.includes(current) : current === value;
    }));
    if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
    return { size: docs.length, docs: docs.map(({ id, data }) => new MockDocSnapshot(id, data)) };
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef { return new MockCollectionRef(path); },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  Timestamp: {
    fromMillis: (millis: number) => new MockTimestamp(millis),
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
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
  Timestamp: Object.assign(MockTimestamp, {
    fromMillis: (millis: number) => new MockTimestamp(millis),
  }),
}));
vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: firestoreFn,
    storage: () => ({
      bucket: () => ({
        file: (path: string) => ({
          getSignedUrl: async () => [`https://storage.test/${encodeURIComponent(path)}`],
          exists: async () => [files.has(path) && !files.get(path)?.deleted],
          getMetadata: async () => [{ contentType: files.get(path)?.contentType, size: files.get(path)?.size }],
          delete: async () => {
            const file = files.get(path);
            if (file) file.deleted = true;
          },
        }),
      }),
    }),
  },
}));

function request(uid: string | null, role: string, data: DocData) {
  return { auth: uid ? { uid, token: { role } } : null, data, rawRequest: { headers: {} }, acceptsStreaming: false };
}

describe("feedback attachment lifecycle", () => {
  beforeEach(() => {
    store.clear();
    files.clear();
    autoId = 0;
    nowMillis = Date.UTC(2026, 4, 20, 12, 0, 0);
    store.set("feedback_reports/report-1", {
      id: "report-1",
      uid: "user-1",
      source: "drawer",
      intentType: "bug",
      status: "new",
      text: "Report with screenshot",
      contactEmail: null,
      clientContext: null,
      serverContext: { authRole: "user", callableRegion: "default", correlationId: "corr", schemaVersion: 1 },
      createdAt: new MockTimestamp(nowMillis),
      updatedAt: new MockTimestamp(nowMillis),
    });
  });

  it("rejects unauthenticated upload creation", async () => {
    const { createFeedbackAttachmentUpload } = await import("../domains/feedback");
    const result = await createFeedbackAttachmentUpload.run(request(null, "user", {
      feedbackId: "report-1",
      fileName: "shot.png",
      contentType: "image/png",
      size: 100,
    })) as DocData;
    expect(result).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("rejects unsupported mime types and oversized images", async () => {
    const { createFeedbackAttachmentUpload } = await import("../domains/feedback");
    const badMime = await createFeedbackAttachmentUpload.run(request("user-1", "user", {
      feedbackId: "report-1",
      fileName: "shot.gif",
      contentType: "image/gif",
      size: 100,
    })) as DocData;
    const tooLarge = await createFeedbackAttachmentUpload.run(request("user-1", "user", {
      feedbackId: "report-1",
      fileName: "shot.png",
      contentType: "image/png",
      size: 6 * 1024 * 1024,
    })) as DocData;
    expect(badMime).toMatchObject({ success: false, error: { code: "INVALID_REQUEST_SCHEMA" } });
    expect(tooLarge).toMatchObject({ success: false, error: { code: "INVALID_REQUEST_SCHEMA" } });
  });

  it("creates, finalizes, lists, and admin-deletes evidence attachments", async () => {
    const {
      createFeedbackAttachmentUpload,
      finalizeFeedbackAttachment,
      adminGetFeedbackReport,
      adminDeleteFeedbackAttachment,
    } = await import("../domains/feedback");

    const created = await createFeedbackAttachmentUpload.run(request("user-1", "user", {
      feedbackId: "report-1",
      fileName: "shot.png",
      contentType: "image/png",
      size: 100,
    })) as { success: true; data: { attachmentId: string; storagePath: string } };
    expect(created).toEqual(expect.objectContaining({ success: true }));
    files.set(created.data.storagePath, { contentType: "image/png", size: 100 });

    const finalized = await finalizeFeedbackAttachment.run(request("user-1", "user", {
      feedbackId: "report-1",
      attachmentId: created.data.attachmentId,
    })) as DocData;
    expect(finalized).toEqual(expect.objectContaining({ success: true }));

    const detail = await adminGetFeedbackReport.run(request("mod-1", "moderator", { feedbackId: "report-1" })) as {
      success: true;
      data: { attachments: Array<{ attachmentId: string; downloadUrl: string }> };
    };
    expect(detail.data.attachments).toHaveLength(1);
    expect(detail.data.attachments[0].downloadUrl).toContain("https://storage.test/");

    const deleted = await adminDeleteFeedbackAttachment.run(request("mod-1", "moderator", {
      feedbackId: "report-1",
      attachmentId: created.data.attachmentId,
    })) as DocData;
    expect(deleted).toMatchObject({ success: true, data: { deleted: true } });
    expect(store.get(`feedback_reports/report-1/attachments/${created.data.attachmentId}`)).toMatchObject({
      status: "deleted",
      deletedBy: "mod-1",
    });
  });
});
