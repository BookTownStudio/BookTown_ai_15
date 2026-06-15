import { describe, expect, it, vi } from "vitest";

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => "SERVER_TIMESTAMP",
      },
    },
  },
}));

type JsonMap = Record<string, unknown>;

class FakeDocRef {
  constructor(readonly collectionName: string, readonly id: string) {}

  async set(data: JsonMap, options?: { merge?: boolean }): Promise<void> {
    fakeDb.write(this.collectionName, this.id, data, options?.merge === true);
  }
}

class FakeCollectionRef {
  constructor(readonly name: string) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.name, id);
  }
}

class FakeDb {
  private readonly rows = new Map<string, Map<string, JsonMap>>();

  reset(): void {
    this.rows.clear();
  }

  collection(name: string): FakeCollectionRef {
    if (!this.rows.has(name)) {
      this.rows.set(name, new Map<string, JsonMap>());
    }
    return new FakeCollectionRef(name);
  }

  write(collection: string, id: string, data: JsonMap, merge: boolean): void {
    const bucket = this.rows.get(collection) ?? new Map<string, JsonMap>();
    const existing = bucket.get(id);
    bucket.set(id, merge && existing ? { ...existing, ...data } : data);
    this.rows.set(collection, bucket);
  }

  read(collection: string, id: string): JsonMap | undefined {
    return this.rows.get(collection)?.get(id);
  }

  count(collection: string): number {
    return this.rows.get(collection)?.size ?? 0;
  }
}

const fakeDb = new FakeDb();

describe("userEntityInteractionRuntime", () => {
  it("creates deterministic book interaction ids and preserves idempotency", async () => {
    const { toReadingInteraction } = await import("./userEntityInteractionRuntime");

    const first = toReadingInteraction({
      uid: "user_1",
      bookId: "book_1",
      progress: 0.5,
      occurredAt: "2026-06-14T00:00:00.000Z",
    });
    const second = toReadingInteraction({
      uid: "user_1",
      bookId: "book_1",
      progress: 0.75,
      occurredAt: "2026-06-14T00:01:00.000Z",
    });

    expect(first.interactionId).toBe("reader:user_1:book_1:reading");
    expect(second.interactionId).toBe(first.interactionId);
    expect(first.entityRef).toMatchObject({
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
    });
  });

  it("represents withdrawals as governed lifecycle records", async () => {
    const { toShelfInteraction } = await import("./userEntityInteractionRuntime");

    const interaction = toShelfInteraction({
      uid: "user_1",
      shelfId: "shelf_1",
      bookId: "book_1",
      occurredAt: "2026-06-14T00:00:00.000Z",
      lifecycleState: "withdrawn",
    });

    expect(interaction.lifecycleState).toBe("withdrawn");
    expect(interaction.interactionId).toBe("shelf:user_1:shelf_1_book_1:shelving:withdrawn");
  });

  it("rejects non-canonical Tier-1 refs before persistence", async () => {
    const { createWorkEntityRef } = await import("../contracts/shared/entityPlatform");
    const { isIdentityGraphEligibleTier1Ref } = await import("./userEntityInteractionRuntime");

    const merged = createWorkEntityRef("book_old", {
      authorityState: "merged",
      mergeTarget: createWorkEntityRef("book_new"),
    });

    expect(isIdentityGraphEligibleTier1Ref(merged)).toBe(false);
  });

  it("persists interactions into the supplemental canonical collection idempotently", async () => {
    fakeDb.reset();
    const {
      USER_ENTITY_INTERACTIONS_COLLECTION,
      toAuthorFollowInteraction,
      writeUserEntityInteractionDirect,
    } = await import("./userEntityInteractionRuntime");

    const interaction = toAuthorFollowInteraction({
      uid: "user_1",
      authorId: "author_1",
      occurredAt: "2026-06-14T00:00:00.000Z",
    });

    await writeUserEntityInteractionDirect(fakeDb as unknown as FirebaseFirestore.Firestore, interaction);
    await writeUserEntityInteractionDirect(fakeDb as unknown as FirebaseFirestore.Firestore, {
      ...interaction,
      occurredAt: "2026-06-14T00:01:00.000Z",
    });

    expect(fakeDb.count(USER_ENTITY_INTERACTIONS_COLLECTION)).toBe(1);
    expect(fakeDb.read(USER_ENTITY_INTERACTIONS_COLLECTION, interaction.interactionId)).toMatchObject({
      interactionId: "author_follow:user_1:author_1:following",
      uid: "user_1",
      lifecycleState: "recorded",
      version: 1,
    });
  });
});
