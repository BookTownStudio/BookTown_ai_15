import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, any>;

const store = new Map<string, DocData>();
let autoId = 0;
let readAfterWriteViolations = 0;

class MockTimestamp {
  constructor(private readonly millis: number) {}
  toMillis(): number {
    return this.millis;
  }
  toDate(): Date {
    return new Date(this.millis);
  }
}

class MockFieldValue {
  constructor(
    readonly kind: "serverTimestamp" | "increment",
    readonly value?: number
  ) {}
}

class MockDocSnapshot {
  constructor(
    readonly id: string,
    readonly ref: MockDocRef,
    private readonly value?: DocData
  ) {}
  get exists(): boolean {
    return this.value !== undefined;
  }
  data(): DocData | undefined {
    return this.value === undefined ? undefined : { ...this.value };
  }
}

class MockDocRef {
  constructor(readonly path: string) {}
  get id(): string {
    return this.path.split("/").pop() || "";
  }
  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.id, this, store.get(this.path));
  }
  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(`${this.path}/${name}`);
  }
}

class MockQuerySnapshot {
  constructor(readonly docs: MockDocSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
}

class MockCollectionRef {
  constructor(
    readonly path: string,
    private readonly filters: Array<{ field: string; value: unknown }> = [],
    private readonly limitCount: number | null = null
  ) {}
  doc(id?: string): MockDocRef {
    return new MockDocRef(`${this.path}/${id || `auto_${++autoId}`}`);
  }
  where(field: string, op: string, value: unknown): MockCollectionRef {
    if (op !== "==") throw new Error(`Unsupported operator ${op}`);
    return new MockCollectionRef(this.path, [...this.filters, { field, value }], this.limitCount);
  }
  limit(count: number): MockCollectionRef {
    return new MockCollectionRef(this.path, this.filters, count);
  }
  async get(): Promise<MockQuerySnapshot> {
    const base = this.path.split("/").filter(Boolean);
    let docs = Array.from(store.entries())
      .filter(([docPath]) => {
        const parts = docPath.split("/").filter(Boolean);
        return parts.length === base.length + 1 && parts.slice(0, base.length).join("/") === this.path;
      })
      .filter(([, data]) => this.filters.every(({ field, value }) => data[field] === value))
      .map(([docPath, data]) => {
        const ref = new MockDocRef(docPath);
        return new MockDocSnapshot(ref.id, ref, data);
      });
    if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
    return new MockQuerySnapshot(docs);
  }
}

function materializeFieldValues(value: unknown): unknown {
  if (value instanceof MockFieldValue) {
    if (value.kind === "serverTimestamp") {
      return new MockTimestamp(Date.UTC(2026, 5, 9, 12, 0, 0));
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(materializeFieldValues);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as DocData).map(([key, entry]) => [
        key,
        materializeFieldValues(entry),
      ])
    );
  }
  return value;
}

function mergeData(existing: DocData, patch: DocData): DocData {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof MockFieldValue && value.kind === "increment") {
      const current = typeof next[key] === "number" ? next[key] : 0;
      next[key] = current + (value.value || 0);
      continue;
    }
    next[key] = materializeFieldValues(value);
  }
  return next;
}

class MockTransaction {
  private hasWritten = false;

  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    if (this.hasWritten) {
      readAfterWriteViolations += 1;
      throw new Error(`READ_AFTER_WRITE:${ref.path}`);
    }
    return ref.get();
  }

  set(ref: MockDocRef, data: DocData, options?: { merge?: boolean }): void {
    this.hasWritten = true;
    const existing = options?.merge ? store.get(ref.path) || {} : {};
    store.set(ref.path, mergeData(existing, data));
  }
  update(ref: MockDocRef, data: DocData): void {
    this.hasWritten = true;
    store.set(ref.path, mergeData(store.get(ref.path) || {}, data));
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef {
    return new MockCollectionRef(path);
  },
  batch(): { update: (ref: MockDocRef, data: DocData) => void; set: (ref: MockDocRef, data: DocData, options?: { merge?: boolean }) => void; commit: () => Promise<void> } {
    const writes: Array<() => void> = [];
    return {
      update(ref: MockDocRef, data: DocData): void {
        writes.push(() => {
          store.set(ref.path, mergeData(store.get(ref.path) || {}, data));
        });
      },
      set(ref: MockDocRef, data: DocData, options?: { merge?: boolean }): void {
        writes.push(() => {
          const existing = options?.merge ? store.get(ref.path) || {} : {};
          store.set(ref.path, mergeData(existing, data));
        });
      },
      async commit(): Promise<void> {
        writes.forEach((write) => write());
      },
    };
  },
  async runTransaction<T>(handler: (transaction: MockTransaction) => Promise<T>): Promise<T> {
    return handler(new MockTransaction());
  },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  FieldValue: {
    serverTimestamp: () => new MockFieldValue("serverTimestamp"),
    increment: (value: number) => new MockFieldValue("increment", value),
  },
  Timestamp: MockTimestamp,
});

class MockHttpsError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (_opts: unknown, handler: unknown) => ({ run: handler }),
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: firestoreFn,
  },
}));

function seedUsers(): void {
  store.set("users/user_a", {
    name: "A Reader",
    avatarUrl: "",
    handle: "reader-a",
  });
  store.set("users/user_b", {
    name: "B Reader",
    avatarUrl: "",
    handle: "reader-b",
  });
}

function seedConversation(overrides: DocData = {}): void {
  seedUsers();
  store.set("conversations/dm_user_a__user_b", {
    kind: "direct",
    participantIds: ["user_a", "user_b"],
    participantSet: { user_a: true, user_b: true },
    participantProfiles: {
      user_a: { name: "A Reader", avatarUrl: "", handle: "reader-a" },
      user_b: { name: "B Reader", avatarUrl: "", handle: "reader-b" },
    },
    lastMessageText: "",
    lastMessageAt: null,
    lastMessageSenderId: null,
    unreadCounts: { user_a: 0, user_b: 0 },
    lastReadAtByUser: {},
    createdAt: new MockTimestamp(Date.UTC(2026, 5, 9, 11, 0, 0)),
    updatedAt: new MockTimestamp(Date.UTC(2026, 5, 9, 11, 0, 0)),
    version: 1,
    ...overrides,
  });
  store.set("notification_preferences/user_b", {
    uid: "user_b",
    channels: { in_app: true },
    categories: { messages: true },
  });
  store.set("notification_preferences/user_a", {
    uid: "user_a",
    channels: { in_app: true },
    categories: { messages: true },
  });
}

async function send(uid: "user_a" | "user_b", text: string, key: string): Promise<{ conversationId: string; messageId: string }> {
  const { sendDirectMessage } = await import("./directMessages");
  return sendDirectMessage.run({
    auth: { uid, token: {} },
    data: {
      conversationId: "dm_user_a__user_b",
      text,
      idempotencyKey: key,
    },
  }) as Promise<{ conversationId: string; messageId: string }>;
}

describe("direct messaging send transaction", () => {
  beforeEach(() => {
    store.clear();
    autoId = 0;
    readAfterWriteViolations = 0;
    seedConversation();
  });

  it("sends a direct message and commits message, conversation, idempotency, and notification writes", async () => {
    const { sendDirectMessage } = await import("./directMessages");

    const result = await sendDirectMessage.run({
      auth: { uid: "user_a", token: {} },
      data: {
        conversationId: "dm_user_a__user_b",
        text: "Hello from BookTown",
        idempotencyKey: "send_key_001",
      },
    }) as { conversationId: string; messageId: string };

    expect(readAfterWriteViolations).toBe(0);
    expect(result.conversationId).toBe("dm_user_a__user_b");
    expect(result.messageId).toMatch(/^auto_/);

    expect(store.get(`conversations/dm_user_a__user_b/messages/${result.messageId}`)).toMatchObject({
      senderId: "user_a",
      text: "Hello from BookTown",
      idempotencyKey: "send_key_001",
      version: 1,
    });
    expect(store.get("conversations/dm_user_a__user_b")).toMatchObject({
      lastMessageText: "Hello from BookTown",
      lastMessageSenderId: "user_a",
      unreadCounts: { user_a: 0, user_b: 1 },
    });
    expect(store.get("conversations/dm_user_a__user_b/idempotency/user_a_send_key_001")).toMatchObject({
      senderId: "user_a",
      messageId: result.messageId,
    });
    expect(store.get(`notifications/dm_dm_user_a__user_b_${result.messageId}_user_b`)).toMatchObject({
      uid: "user_b",
      type: "dm",
      entityId: "dm_user_a__user_b",
      message: "A Reader: Hello from BookTown",
    });
  });

  it("does not perform transaction reads after the first transaction write", async () => {
    const { sendDirectMessage } = await import("./directMessages");

    await sendDirectMessage.run({
      auth: { uid: "user_a", token: {} },
      data: {
        conversationId: "dm_user_a__user_b",
        text: "Read order guard",
        idempotencyKey: "send_key_002",
      },
    });

    expect(readAfterWriteViolations).toBe(0);
  });

  it("marks the conversation read and clears all unread DM notifications for that conversation", async () => {
    const { markDirectConversationRead } = await import("./directMessages");
    store.set("notifications/dm_one", {
      uid: "user_b",
      type: "dm",
      entityId: "dm_user_a__user_b",
      read: false,
    });
    store.set("notifications/dm_two", {
      uid: "user_b",
      type: "dm",
      entityId: "dm_user_a__user_b",
      read: false,
    });
    store.set("notifications/other_conversation", {
      uid: "user_b",
      type: "dm",
      entityId: "dm_other__user_b",
      read: false,
    });
    store.set("notification_summary/user_b", {
      unreadCount: 3,
    });
    store.set("users/user_b/meta/unread", {
      notificationsCount: 3,
    });

    const result = await markDirectConversationRead.run({
      auth: { uid: "user_b", token: {} },
      data: {
        conversationId: "dm_user_a__user_b",
      },
    }) as { clearedNotificationCount: number };

    expect(result.clearedNotificationCount).toBe(2);
    expect(store.get("notifications/dm_one")).toMatchObject({ read: true });
    expect(store.get("notifications/dm_two")).toMatchObject({ read: true });
    expect(store.get("notifications/other_conversation")).toMatchObject({ read: false });
    expect(store.get("notification_summary/user_b")).toMatchObject({ unreadCount: 1 });
    expect(store.get("users/user_b/meta/unread")).toMatchObject({ notificationsCount: 1 });
  });

  it("allows requester to reply after the recipient explicitly accepts a non-mutual request", async () => {
    const { acceptDirectMessageRequest } = await import("./directMessages");
    store.set("conversations/dm_user_a__user_b", {
      ...store.get("conversations/dm_user_a__user_b"),
      status: "request_pending",
      requestedByUid: "user_a",
    });

    await acceptDirectMessageRequest.run({
      auth: { uid: "user_b", token: {} },
      data: { conversationId: "dm_user_a__user_b" },
    });
    const reply = await send("user_a", "Thanks for accepting", "send_key_after_accept");

    expect(reply.messageId).toMatch(/^auto_/);
    expect(store.get("conversations/dm_user_a__user_b")).toMatchObject({
      status: "active",
      requestedByUid: "user_a",
      lastMessageSenderId: "user_a",
    });
  });

  it("auto-accepts a pending non-mutual request when the recipient replies, then allows requester reply", async () => {
    store.set("conversations/dm_user_a__user_b", {
      ...store.get("conversations/dm_user_a__user_b"),
      status: "request_pending",
      requestedByUid: "user_a",
    });

    const recipientReply = await send("user_b", "I can talk here", "send_key_auto_accept");
    const requesterReply = await send("user_a", "Great", "send_key_after_auto_accept");

    expect(recipientReply.messageId).toMatch(/^auto_/);
    expect(requesterReply.messageId).toMatch(/^auto_/);
    expect(store.get("conversations/dm_user_a__user_b")).toMatchObject({
      status: "active",
      requestedByUid: "user_a",
      lastMessageSenderId: "user_a",
    });
  });

  it("blocks replies after the recipient declines a non-mutual request", async () => {
    const { declineDirectMessageRequest } = await import("./directMessages");
    store.set("conversations/dm_user_a__user_b", {
      ...store.get("conversations/dm_user_a__user_b"),
      status: "request_pending",
      requestedByUid: "user_a",
    });

    await declineDirectMessageRequest.run({
      auth: { uid: "user_b", token: {} },
      data: { conversationId: "dm_user_a__user_b" },
    });

    await expect(send("user_a", "Can I still reply?", "send_key_declined")).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(store.get("conversations/dm_user_a__user_b")).toMatchObject({
      status: "request_declined",
    });
  });

  it("blocks replies when a participant blocks the peer even if the conversation exists", async () => {
    store.set("users/user_b/blocks/user_a", {
      blockedUid: "user_a",
    });

    await expect(send("user_a", "Blocked reply", "send_key_blocked")).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("creates an active conversation directly when mutual follows exist", async () => {
    const { createDirectConversation } = await import("./directMessages");
    store.delete("conversations/dm_user_a__user_b");
    store.set("notification_preferences/user_b", {
      uid: "user_b",
      dmPrivacyMode: "mutual_follows",
    });
    store.set("users/user_b/followers/user_a", {
      followerUid: "user_a",
      targetUid: "user_b",
    });
    store.set("users/user_a/followers/user_b", {
      followerUid: "user_b",
      targetUid: "user_a",
    });

    const result = await createDirectConversation.run({
      auth: { uid: "user_a", token: {} },
      data: { peerUid: "user_b" },
    }) as { conversationId: string };

    expect(result.conversationId).toBe("dm_user_a__user_b");
    expect(store.get("conversations/dm_user_a__user_b")).toMatchObject({
      status: "active",
      requestedByUid: null,
    });
  });
});
