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

  async get(): Promise<{ exists: boolean; data: () => JsonMap | undefined }> {
    const row = fakeDb.read(this.collectionName, this.id);
    return {
      exists: Boolean(row),
      data: () => row,
    };
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

describe("graphRelationshipAuthority", () => {
  it("admits a canonical relationship with governed evidence and deterministic identity", async () => {
    const { createAuthorEntityRef, createWorkEntityRef } = await import("../contracts/shared/entityPlatform");
    const { admitCanonicalGraphRelationship } = await import("./graphRelationshipAuthority");

    const relationship = await admitCanonicalGraphRelationship({
      source: { ref: createAuthorEntityRef("author_1"), graphEligible: true },
      target: { ref: createWorkEntityRef("work_1"), graphEligible: true },
      relationshipType: "authored",
      direction: "directional",
      lifecycleState: "canonical",
      provenanceClass: "editorial",
      admittedBy: "literary_graph_authority",
      admittedAt: "2026-06-14T00:00:00.000Z",
      evidence: [
        {
          evidenceId: "evidence_1",
          provenanceClass: "editorial",
          provenance: {
            sourceClass: "editorial",
            sourceSystem: "catalog_curation",
            sourceId: "evidence_1",
          },
          confidence: 0.98,
          observedAt: "2026-06-14T00:00:00.000Z",
          claim: "Author 1 authored Work 1.",
        },
      ],
    });

    expect(relationship).toMatchObject({
      relationshipId: "author:author_1:authored:work:work_1:directional",
      lifecycleState: "canonical",
      provenanceClass: "editorial",
      confidence: 0.98,
      eligibility: {
        eligible: true,
        reason: "active_canonical_tier1_endpoints",
      },
      contractVersion: 1,
    });
  });

  it("rejects noncanonical endpoints before relationship authority can write truth", async () => {
    const { createAuthorEntityRef, createWorkEntityRef } = await import("../contracts/shared/entityPlatform");
    const { admitCanonicalGraphRelationship } = await import("./graphRelationshipAuthority");

    await expect(
      admitCanonicalGraphRelationship({
        source: {
          ref: createAuthorEntityRef("author_merged", {
            authorityState: "merged",
            mergeTarget: createAuthorEntityRef("author_canonical"),
          }),
          graphEligible: true,
        },
        target: { ref: createWorkEntityRef("work_1"), graphEligible: true },
        relationshipType: "authored",
        direction: "directional",
        lifecycleState: "canonical",
        provenanceClass: "editorial",
        admittedBy: "literary_graph_authority",
        admittedAt: "2026-06-14T00:00:00.000Z",
        evidence: [
          {
            evidenceId: "evidence_1",
            provenanceClass: "editorial",
            provenance: { sourceClass: "editorial", sourceSystem: "catalog", sourceId: "evidence_1" },
            confidence: 1,
            observedAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      })
    ).rejects.toThrow("active canonical Tier-1 endpoints");
  });

  it("uses persisted entity authority when a runtime resolver is supplied", async () => {
    fakeDb.reset();
    fakeDb.write("authors", "author_1", { lifecycleState: "canonical" }, false);
    fakeDb.write("books", "work_1", { status: "archived" }, false);

    const { createAuthorEntityRef, createWorkEntityRef } = await import("../contracts/shared/entityPlatform");
    const {
      admitCanonicalGraphRelationship,
      createFirestoreRuntimeEntityAuthorityResolver,
    } = await import("./graphRelationshipAuthority");
    const resolver = createFirestoreRuntimeEntityAuthorityResolver(
      fakeDb as unknown as FirebaseFirestore.Firestore
    );

    await expect(
      admitCanonicalGraphRelationship({
        source: { ref: createAuthorEntityRef("author_1"), graphEligible: true },
        target: { ref: createWorkEntityRef("work_1"), graphEligible: true },
        relationshipType: "authored",
        direction: "directional",
        lifecycleState: "canonical",
        provenanceClass: "editorial",
        sourceAuthorityResolver: resolver,
        targetAuthorityResolver: resolver,
        admittedBy: "literary_graph_authority",
        admittedAt: "2026-06-14T00:00:00.000Z",
        evidence: [
          {
            evidenceId: "evidence_1",
            provenanceClass: "editorial",
            provenance: { sourceClass: "editorial", sourceSystem: "catalog", sourceId: "evidence_1" },
            confidence: 1,
            observedAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      })
    ).rejects.toThrow("entity_authority_document_not_active");
  });

  it("persists canonical relationships idempotently into graph_relationships", async () => {
    fakeDb.reset();
    const { createAuthorEntityRef, createWorkEntityRef } = await import("../contracts/shared/entityPlatform");
    const {
      GRAPH_RELATIONSHIPS_COLLECTION,
      admitCanonicalGraphRelationship,
      writeCanonicalGraphRelationshipDirect,
    } = await import("./graphRelationshipAuthority");

    const relationship = await admitCanonicalGraphRelationship({
      source: { ref: createAuthorEntityRef("author_1"), graphEligible: true },
      target: { ref: createWorkEntityRef("work_1"), graphEligible: true },
      relationshipType: "authored",
      direction: "directional",
      lifecycleState: "accepted",
      provenanceClass: "seeded",
      admittedBy: "literary_graph_authority",
      admittedAt: "2026-06-14T00:00:00.000Z",
      evidence: [
        {
          evidenceId: "seed_1",
          provenanceClass: "seeded",
          provenance: { sourceClass: "system", sourceSystem: "seed", sourceId: "seed_1" },
          confidence: 0.9,
          observedAt: "2026-06-14T00:00:00.000Z",
        },
      ],
    });

    await writeCanonicalGraphRelationshipDirect(fakeDb as unknown as FirebaseFirestore.Firestore, relationship);
    await writeCanonicalGraphRelationshipDirect(fakeDb as unknown as FirebaseFirestore.Firestore, {
      ...relationship,
      admittedAt: "2026-06-14T00:01:00.000Z",
    });

    expect(fakeDb.count(GRAPH_RELATIONSHIPS_COLLECTION)).toBe(1);
    expect(fakeDb.read(GRAPH_RELATIONSHIPS_COLLECTION, relationship.relationshipId)).toMatchObject({
      relationshipId: "author:author_1:authored:work:work_1:directional",
      lifecycleState: "accepted",
      version: 1,
    });
  });
});
