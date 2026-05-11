import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let autoIdCounter = 0;
let timestampCounter = 0;

type SpecialValue = { __op: "serverTimestamp" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSpecial(value: unknown): SpecialValue | null {
  return isRecord(value) && value.__op === "serverTimestamp"
    ? (value as SpecialValue)
    : null;
}

function materialize(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };

  for (const [key, raw] of Object.entries(incoming)) {
    const special = asSpecial(raw);
    if (special?.__op === "serverTimestamp") {
      timestampCounter += 1;
      next[key] = `ts-${timestampCounter}`;
      continue;
    }

    if (isRecord(raw)) {
      const existingChild = isRecord(existing[key])
        ? (existing[key] as Record<string, unknown>)
        : {};
      next[key] = materialize(raw, existingChild);
      continue;
    }

    next[key] = raw;
  }

  return next;
}

function setDoc(path: string, data: Record<string, unknown>, merge = false): void {
  const existing = store.get(path) || {};
  store.set(path, materialize(data, merge ? existing : {}));
}

function updateDoc(path: string, data: Record<string, unknown>): void {
  const existing = store.get(path);
  if (!existing) {
    throw new Error(`Document does not exist: ${path}`);
  }
  store.set(path, materialize(data, existing));
}

function getDocData(path: string): Record<string, unknown> | undefined {
  const value = store.get(path);
  return value ? clone(value) : undefined;
}

function listCollectionDocs(collectionPath: string): Array<{ path: string; id: string; data: DocData }> {
  const baseSegments = collectionPath.split("/").filter(Boolean);
  const targetLength = baseSegments.length + 1;

  return Array.from(store.entries())
    .filter(([path]) => {
      const segments = path.split("/").filter(Boolean);
      return (
        segments.length === targetLength &&
        segments.slice(0, baseSegments.length).join("/") === collectionPath
      );
    })
    .map(([path, data]) => {
      const parts = path.split("/").filter(Boolean);
      return {
        path,
        id: parts[parts.length - 1] || "",
        data: clone(data),
      };
    });
}

class MockDocSnapshot {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  get exists(): boolean {
    return store.has(this.path);
  }

  data(): Record<string, unknown> | undefined {
    return getDocData(this.path);
  }
}

class MockDocRef {
  constructor(public readonly path: string) {}

  get id(): string {
    const parts = this.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.path);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
  }

  async update(data: Record<string, unknown>): Promise<void> {
    updateDoc(this.path, data);
  }
}

class MockQuerySnapshot {
  constructor(public readonly docs: MockDocSnapshot[]) {}
}

class MockQuery {
  constructor(
    protected readonly collectionPath: string,
    protected readonly filters: Array<{
      field: string;
      op: "==" | ">=" | "<=";
      value: unknown;
    }> = [],
    protected readonly orderByField: string | null = null,
    protected readonly limitCount: number | null = null
  ) {}

  where(field: string, op: string, value: unknown): MockQuery {
    if (op !== "==" && op !== ">=" && op !== "<=") {
      throw new Error(`Unsupported operator: ${op}`);
    }
    return new MockQuery(
      this.collectionPath,
      [...this.filters, { field, op: op as "==" | ">=" | "<=", value }],
      this.orderByField,
      this.limitCount
    );
  }

  orderBy(field: string): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, field, this.limitCount);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.collectionPath, this.filters, this.orderByField, count);
  }

  async get(): Promise<MockQuerySnapshot> {
    let docs = listCollectionDocs(this.collectionPath).filter(({ data }) =>
      this.filters.every(({ field, op, value }) => {
        const fieldValue = data[field];
        if (op === "==") return fieldValue === value;
        if (op === ">=") return String(fieldValue ?? "") >= String(value ?? "");
        return String(fieldValue ?? "") <= String(value ?? "");
      })
    );

    if (this.orderByField) {
      docs = docs.sort((a, b) =>
        String(a.data[this.orderByField!] ?? "").localeCompare(
          String(b.data[this.orderByField!] ?? "")
        )
      );
    }

    if (typeof this.limitCount === "number") {
      docs = docs.slice(0, this.limitCount);
    }

    return new MockQuerySnapshot(docs.map((entry) => new MockDocSnapshot(entry.path)));
  }
}

class MockCollectionRef extends MockQuery {
  constructor(collectionPath: string) {
    super(collectionPath);
  }

  doc(id?: string): MockDocRef {
    const prefix = this.collectionPath.split("/").pop() || "doc";
    const resolvedId = id || `${prefix}-${++autoIdCounter}`;
    return new MockDocRef(`${this.collectionPath}/${resolvedId}`);
  }
}

class MockTransaction {
  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(ref.path);
  }

  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    setDoc(ref.path, data, Boolean(options?.merge));
  }

  update(ref: MockDocRef, data: Record<string, unknown>): void {
    updateDoc(ref.path, data);
  }
}

const firestoreMock = {
  collection(path: string): MockCollectionRef {
    return new MockCollectionRef(path);
  },
  doc(path: string): MockDocRef {
    return new MockDocRef(path);
  },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    return handler(new MockTransaction());
  },
};

const firestoreFn = Object.assign(() => firestoreMock, {
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
  },
});

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
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
    };
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: firestoreFn,
  },
}));

function activeUser(uid: string, extra: Record<string, unknown> = {}): void {
  setDoc(`users/${uid}`, {
    uid,
    status: "active",
    ...extra,
  });
}

function auth(uid: string, role = "user"): Record<string, unknown> {
  return {
    uid,
    token: { role },
    rawToken: {},
  };
}

function callableRequest(
  uid: string,
  data: Record<string, unknown>,
  role = "user"
): Record<string, unknown> {
  return {
    auth: auth(uid, role),
    rawRequest: { headers: {} },
    acceptsStreaming: false,
    data,
  };
}

function getStored(path: string): Record<string, unknown> {
  const data = getDocData(path);
  if (!data) {
    throw new Error(`Missing stored document: ${path}`);
  }
  return data;
}

async function createVenueForUser(uid = "user-1"): Promise<{ id: string; doc: Record<string, unknown> }> {
  const { createUserSpace } = await import("./userSpaceMutations");
  const result = (await createUserSpace.run(
    callableRequest(uid, {
      spaceType: "venue",
      spaceSubtype: "bookstore",
      displayName: "The Quiet Shelf",
      imageUrl: "https://cdn.booktown.test/quiet-shelf.jpg",
      address: "12 Library Lane",
      descriptionEn: "A calm literary space.",
      openingSchedule: {
        mon: { closed: false, open: "09:00", close: "18:00" },
      },
      location: {
        latitude: 25.2854,
        longitude: 51.531,
        city: "Doha",
        country: "Qatar",
      },
    })
  )) as { spaceId: string };

  return {
    id: result.spaceId,
    doc: getStored(`venues/${result.spaceId}`),
  };
}

describe("Spaces callable authority and governance", () => {
  beforeEach(() => {
    store.clear();
    autoIdCounter = 0;
    timestampCounter = 0;
    vi.clearAllMocks();
    vi.resetModules();
    activeUser("user-1");
    activeUser("user-2");
    activeUser("steward-1");
    activeUser("admin-1");
  });

  it("creates a user venue with canonical identity, governance, stewardship, and lifecycle defaults", async () => {
    const { id, doc } = await createVenueForUser();

    expect(id).toBe("venues-1");
    expect(doc).toMatchObject({
      ownerId: "user-1",
      canonicalOwnerId: "booktown",
      spaceType: "venue",
      spaceSubtype: "bookstore",
      governanceStatus: "published",
      provenance: {
        source: "user_created",
        canonicalAuthority: "user_submitted",
        createdByUid: "user-1",
        schemaVersion: 1,
      },
      authorityProfile: {
        claimState: "unclaimed",
        stewardshipState: "community_created",
        schemaVersion: 1,
      },
      stewardship: {
        canonicalOwnerId: "booktown",
        createdByUid: "user-1",
        managedByUid: "user-1",
        adminUids: [],
        schemaVersion: 1,
      },
      publication: {
        state: "published",
        draftMode: "none",
        schemaVersion: 1,
      },
    });
    expect(doc.identity).toMatchObject({
      canonicalId: "venue_venues-1",
      slug: "the-quiet-shelf-venues1",
      routePath: "/spaces/the-quiet-shelf-venues1",
      schemaVersion: 1,
    });
    expect(doc.openingSchedule).toMatchObject({
      mon: { closed: false, open: "09:00", close: "18:00" },
      tue: { closed: true, open: null, close: null },
    });
    expect(getStored("space_inboxes/space_venues-1")).toMatchObject({
      spaceId: "venues-1",
      spaceType: "venue",
      ownerUid: "user-1",
      status: "disabled",
    });
  });

  it("preserves protected canonical fields when a user attempts governance spoofing during update", async () => {
    const { id, doc: before } = await createVenueForUser();
    const { updateUserSpace } = await import("./userSpaceMutations");

    await updateUserSpace.run(
      callableRequest("user-1", {
        spaceId: id,
        spaceType: "venue",
        spaceSubtype: "library",
        displayName: "The Quiet Shelf Annex",
        imageUrl: "https://cdn.booktown.test/quiet-shelf-annex.jpg",
        address: "14 Library Lane",
        canonicalOwnerId: "attacker",
        governanceStatus: "verified",
        provenance: { source: "system_seeded", canonicalAuthority: "system" },
        stewardship: { managedByUid: "user-2", canonicalOwnerId: "attacker" },
        identity: { slug: "spoofed", canonicalId: "venue_spoofed" },
      })
    );

    const after = getStored(`venues/${id}`);
    expect(after.canonicalOwnerId).toBe("booktown");
    expect(after.ownerId).toBe("user-1");
    expect(after.governanceStatus).toBe("published");
    expect(after.provenance).toEqual(before.provenance);
    expect(after.stewardship).toEqual(before.stewardship);
    expect(after.identity).toMatchObject({
      canonicalId: "venue_venues-1",
      slug: "the-quiet-shelf-venues1",
      displayName: "The Quiet Shelf Annex",
      normalizedName: "the quiet shelf annex",
    });
    expect(after.spaceSubtype).toBe("library");
  });

  it("rejects non-steward updates and allows assigned stewards to update operational fields only", async () => {
    const { id } = await createVenueForUser();
    const { updateUserSpace } = await import("./userSpaceMutations");

    await expect(
      updateUserSpace.run(
        callableRequest("user-2", {
          spaceId: id,
          spaceType: "venue",
          spaceSubtype: "library",
          displayName: "Unauthorized Rename",
          imageUrl: "https://cdn.booktown.test/unauthorized.jpg",
          address: "No Access",
        })
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    updateDoc(`venues/${id}`, {
      stewardship: {
        canonicalOwnerId: "booktown",
        createdByUid: "user-1",
        managedByUid: "steward-1",
        adminUids: [],
        schemaVersion: 1,
      },
    });

    await updateUserSpace.run(
      callableRequest("steward-1", {
        spaceId: id,
        spaceType: "venue",
        spaceSubtype: "library",
        displayName: "Stewarded Shelf",
        imageUrl: "https://cdn.booktown.test/stewarded.jpg",
        address: "16 Library Lane",
      })
    );

    const updated = getStored(`venues/${id}`);
    expect(updated.ownerId).toBe("user-1");
    expect(updated.stewardship).toMatchObject({
      canonicalOwnerId: "booktown",
      createdByUid: "user-1",
      managedByUid: "steward-1",
    });
    expect(updated.name).toBe("Stewarded Shelf");
    expect(updated.spaceSubtype).toBe("library");
  });

  it("supports admin seeded-space stewardship assignment without transferring canonical ownership", async () => {
    const { adminSeedSpace, adminAssignSpaceStewardship } = await import("../admin/spacesAuthority");

    const seedResult = (await adminSeedSpace.run(
      callableRequest(
        "admin-1",
        {
          spaceType: "venue",
          spaceSubtype: "library",
          displayName: "Civic Library",
          imageUrl: "https://cdn.booktown.test/civic-library.jpg",
          address: "1 Archive Square",
        },
        "moderator"
      )
    )) as { spaceId: string };

    expect(getStored(`venues/${seedResult.spaceId}`)).toMatchObject({
      canonicalOwnerId: "booktown",
      governanceStatus: "published",
      provenance: {
        source: "system_seeded",
        canonicalAuthority: "system",
        createdByUid: "admin-1",
      },
      authorityProfile: {
        claimState: "unclaimed",
        stewardshipState: "system_seeded",
      },
    });

    await adminAssignSpaceStewardship.run(
      callableRequest(
        "admin-1",
        {
          spaceId: seedResult.spaceId,
          spaceType: "venue",
          managedByUid: "steward-1",
          institutionId: "institution-1",
        },
        "moderator"
      )
    );

    const assigned = getStored(`venues/${seedResult.spaceId}`);
    expect(assigned).toMatchObject({
      ownerId: "steward-1",
      canonicalOwnerId: "booktown",
      governanceStatus: "verified",
      authorityProfile: {
        claimState: "institutional",
        stewardshipState: "institutional",
        claimedByUid: "steward-1",
        institutionId: "institution-1",
      },
      stewardship: {
        canonicalOwnerId: "booktown",
        managedByUid: "steward-1",
        assignedByUid: "admin-1",
        institutionId: "institution-1",
      },
    });
    expect(getStored(`space_inboxes/space_${seedResult.spaceId}`)).toMatchObject({
      ownerUid: "steward-1",
      participantModel: "space_admins_only",
    });
  });

  it("creates private linked events as historical records and rejects invalid venue linkage", async () => {
    const { id: venueId } = await createVenueForUser();
    const { createUserSpace } = await import("./userSpaceMutations");

    const result = (await createUserSpace.run(
      callableRequest("user-1", {
        spaceType: "event",
        spaceSubtype: "discussion",
        displayName: "Midnight Margins",
        imageUrl: "https://cdn.booktown.test/midnight-margins.jpg",
        dateTime: "2020-01-01T19:00:00.000Z",
        privacy: "private",
        isOnline: false,
        locationId: venueId,
      })
    )) as { spaceId: string };

    const event = getStored(`events/${result.spaceId}`);
    expect(event).toMatchObject({
      ownerId: "user-1",
      canonicalOwnerId: "booktown",
      spaceType: "event",
      spaceSubtype: "discussion",
      privacy: "private",
      eventState: "completed",
      recurrence: { kind: "none", schemaVersion: 1 },
      continuity: {
        historicalRecord: true,
        visibility: "private_record",
        lineageKind: "single_event",
        schemaVersion: 1,
      },
      relationshipRefs: {
        venueId,
      },
      venueName: "The Quiet Shelf",
    });

    await expect(
      createUserSpace.run(
        callableRequest("user-1", {
          spaceType: "event",
          spaceSubtype: "discussion",
          displayName: "Broken Link",
          imageUrl: "https://cdn.booktown.test/broken.jpg",
          dateTime: "2026-01-01T19:00:00.000Z",
          privacy: "public",
          isOnline: false,
          locationId: "missing-venue",
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("validates canonical book and author relationship references before persistence", async () => {
    setDoc("books/book-1", { titleEn: "The Archive Reader" });
    setDoc("authors/author-1", { nameEn: "Author One" });

    const { createUserSpace } = await import("./userSpaceMutations");
    const result = (await createUserSpace.run(
      callableRequest("user-1", {
        spaceType: "venue",
        spaceSubtype: "library",
        displayName: "Relationship Library",
        imageUrl: "https://cdn.booktown.test/relationship-library.jpg",
        address: "18 Graph Lane",
        relationshipRefs: {
          bookIds: ["book-1", "book-1"],
          authorIds: ["author-1"],
        },
      })
    )) as { spaceId: string };

    const venue = getStored(`venues/${result.spaceId}`);
    expect(venue.relationshipRefs).toEqual({
      bookIds: ["book-1"],
      authorIds: ["author-1"],
    });
    expect(venue.relationshipVisibility).toMatchObject({
      books: "public",
      authors: "public",
    });

    await expect(
      createUserSpace.run(
        callableRequest("user-1", {
          spaceType: "venue",
          spaceSubtype: "library",
          displayName: "Broken Relationship Library",
          imageUrl: "https://cdn.booktown.test/broken-relationship-library.jpg",
          address: "19 Graph Lane",
          relationshipRefs: {
            bookIds: ["missing-book"],
          },
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });

    await expect(
      createUserSpace.run(
        callableRequest("user-1", {
          spaceType: "venue",
          spaceSubtype: "library",
          displayName: "Malformed Relationship Library",
          imageUrl: "https://cdn.booktown.test/malformed-relationship-library.jpg",
          address: "20 Graph Lane",
          relationshipRefs: {
            authorIds: "author-1",
          },
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("preserves event continuity lineage across steward-managed updates", async () => {
    const { createUserSpace, updateUserSpace } = await import("./userSpaceMutations");
    const result = (await createUserSpace.run(
      callableRequest("user-1", {
        spaceType: "event",
        spaceSubtype: "lecture",
        displayName: "City of Readers",
        imageUrl: "https://cdn.booktown.test/city-readers.jpg",
        dateTime: "2027-04-01T19:00:00.000Z",
        privacy: "public",
        isOnline: true,
        link: "https://events.booktown.test/city-readers",
      })
    )) as { spaceId: string };

    updateDoc(`events/${result.spaceId}`, {
      continuity: {
        historicalRecord: true,
        visibility: "public_history",
        lineageKind: "series_occurrence",
        seriesId: "series-1",
        schemaVersion: 1,
      },
    });

    await updateUserSpace.run(
      callableRequest("user-1", {
        spaceId: result.spaceId,
        spaceType: "event",
        spaceSubtype: "lecture",
        displayName: "City of Readers: Spring",
        imageUrl: "https://cdn.booktown.test/city-readers-spring.jpg",
        dateTime: "2027-04-02T19:00:00.000Z",
        privacy: "public",
        isOnline: true,
        link: "https://events.booktown.test/city-readers-spring",
        eventState: "archived",
        recurrence: { kind: "weekly" },
      })
    );

    const updated = getStored(`events/${result.spaceId}`);
    expect(updated.eventState).toBe("scheduled");
    expect(updated.recurrence).toEqual({ kind: "none", schemaVersion: 1 });
    expect(updated.continuity).toMatchObject({
      historicalRecord: true,
      visibility: "public_history",
      lineageKind: "series_occurrence",
      seriesId: "series-1",
      schemaVersion: 1,
    });
  });

  it("hydrates legacy owner-managed spaces into canonical fields during update", async () => {
    setDoc("venues/legacy-venue", {
      ownerId: "user-1",
      name: "Legacy Literary Room",
      type: "bookstore",
      imageUrl: "https://cdn.booktown.test/legacy.jpg",
      address: "Old Street",
    });

    const { updateUserSpace } = await import("./userSpaceMutations");
    await updateUserSpace.run(
      callableRequest("user-1", {
        spaceId: "legacy-venue",
        spaceType: "venue",
        spaceSubtype: "archive",
        displayName: "Legacy Literary Archive",
        imageUrl: "https://cdn.booktown.test/legacy-archive.jpg",
        address: "Old Street",
      })
    );

    const updated = getStored("venues/legacy-venue");
    expect(updated).toMatchObject({
      ownerId: "user-1",
      spaceSubtype: "archive",
      publication: {
        state: "published",
        draftMode: "none",
        schemaVersion: 1,
      },
      identity: {
        canonicalId: "venue_legacy-venue",
        displayName: "Legacy Literary Archive",
        normalizedName: "legacy literary archive",
        schemaVersion: 1,
      },
    });
    expect(String((updated.identity as Record<string, unknown>).slug)).toMatch(/^legacy-literary-archive-/);
  });

  it("enforces callable contracts before server mutation logic receives protected fields", async () => {
    const { createUserSpace } = await import("../domains/spaces");

    const result = (await createUserSpace.run(
      callableRequest("user-1", {
        spaceType: "venue",
        spaceSubtype: "mall",
        displayName: "Invalid Space",
        imageUrl: "https://cdn.booktown.test/invalid.jpg",
        address: "Invalid",
        canonicalOwnerId: "attacker",
      })
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "INVALID_REQUEST_SCHEMA",
      },
    });
    expect(listCollectionDocs("venues")).toHaveLength(0);
  });

  it("keeps top-level venue and event direct writes blocked in Firestore rules", () => {
    const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");

    expect(rules).toMatch(/match \/venues\/\{venueId\} \{[\s\S]*?allow create, update: if false;/);
    expect(rules).toMatch(/match \/events\/\{eventId\} \{[\s\S]*?allow create, update: if false;/);
    expect(rules).toContain('allow list: if resource.data.privacy == "public";');
    expect(rules).toContain('|| (isSignedIn() && resource.data.ownerId == request.auth.uid)');
    expect(rules).toContain('|| isAdminUser();');
  });
});
