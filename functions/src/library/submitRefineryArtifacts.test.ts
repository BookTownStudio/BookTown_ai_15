import { describe, expect, it, vi } from "vitest";

import {
  processSubmitRefineryArtifacts,
  submitRefineryArtifactsRequestSchema,
} from "./submitRefineryArtifacts";

function fakeDb(book: Record<string, unknown> | null = {
  canonicalKey: "crime-and-punishment::fyodor-dostoevsky",
}) {
  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            size: book ? 1 : 0,
            docs: book
              ? [
                  {
                    id: "book_1",
                    data: () => book,
                  },
                ]
              : [],
          })),
        })),
      })),
    })),
  } as any;
}

const validArtifact = {
  title: "Crime and Punishment",
  canonicalKey: "crime-and-punishment::fyodor-dostoevsky",
  ontology: {
    form: "novel",
    subForm: "philosophical_prose",
    canonicalTradition: "russian_realism",
  },
  literaryQuality: 0.98,
  canonicalPotential: 0.99,
  confidence: "high",
  semanticRefs: {
    schemaVersion: 1,
    movementEntityIds: ["russian_realism"],
  },
  embeddingDescriptor: {
    model: "booktown-refinery-embedding",
    dimensions: 1536,
    vectorRef: "vectors/books/book_1",
    contentHash: "sha256:vector",
    createdAt: "2026-05-23T00:00:00.000Z",
  },
  provenance: {
    source: "booktownRefinery",
    artifactId: "artifact_1",
    factoryVersion: "2026.05.23",
    contentHash: "sha256:artifact",
    generatedAt: "2026-05-23T00:00:00.000Z",
  },
};

describe("submitRefineryArtifacts transport bridge", () => {
  it("accepts a valid artifact and routes it through materializeBookAuthority", async () => {
    const materialize = vi.fn(async () => ({
      canonicalBookId: "book_1",
      bookId: "book_1",
      editionId: null,
      status: "ALREADY_COMPLETE" as const,
      authorityStatus: "canonical" as const,
      canonicalKey: "crime-and-punishment::fyodor-dostoevsky",
    }));

    const result = await processSubmitRefineryArtifacts(
      { artifacts: [validArtifact] },
      { db: fakeDb(), materialize }
    );

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "booktownRefinery",
        authorityStatus: "provisional",
        preferredBookId: "book_1",
        allowIdentityReuse: false,
        createEdition: false,
      })
    );
  });

  it("rejects authority overwrite attempts before materialization", async () => {
    const materialize = vi.fn();
    const artifact = {
      ...validArtifact,
      canonicalTitle: "Forbidden Canonical Title",
    } as any;

    const result = await processSubmitRefineryArtifacts(
      { artifacts: [artifact] },
      { db: fakeDb(), materialize }
    );

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.results[0]?.reason).toBe("forbidden_authority_field:canonicalTitle");
    expect(materialize).not.toHaveBeenCalled();
  });

  it("rejects invalid schema", () => {
    const parsed = submitRefineryArtifactsRequestSchema.safeParse({
      artifacts: [
        {
          ...validArtifact,
          literaryQuality: 10,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects provider mismatch", () => {
    const parsed = submitRefineryArtifactsRequestSchema.safeParse({
      artifacts: [
        {
          ...validArtifact,
          provenance: {
            ...validArtifact.provenance,
            source: "booktown-canonical-factory",
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("preserves canonical locks by excluding canonical ownership fields from routed payload", async () => {
    const materialize = vi.fn(async () => ({
      canonicalBookId: "book_1",
      bookId: "book_1",
      editionId: null,
      status: "ALREADY_COMPLETE" as const,
      authorityStatus: "canonical" as const,
      canonicalKey: "crime-and-punishment::fyodor-dostoevsky",
    }));

    await processSubmitRefineryArtifacts(
      { artifacts: [validArtifact] },
      { db: fakeDb(), materialize }
    );

    const rawBook = (materialize.mock.calls[0]?.[0] as { rawBook?: Record<string, unknown> } | undefined)?.rawBook || {};
    expect(rawBook).not.toHaveProperty("canonicalTitle");
    expect(rawBook).not.toHaveProperty("canonicalAuthorIds");
    expect(rawBook).not.toHaveProperty("canonicalFieldTrust");
    expect(rawBook).not.toHaveProperty("workIdentity");
  });
});
