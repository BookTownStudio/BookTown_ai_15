import { describe, expect, it } from "vitest";

import {
  BOOKTOWN_REFINERY_AUTHORITY_RULES,
  BOOKTOWN_REFINERY_FIELD_OWNERSHIP,
  BOOKTOWN_REFINERY_PROVIDER_ID,
  validateBookTownRefineryArtifact,
} from "./booktownRefinery";

describe("booktownRefinery provider contract", () => {
  it("keeps the refinery contract subordinate to canonical authority", () => {
    expect(BOOKTOWN_REFINERY_PROVIDER_ID).toBe("booktownRefinery");
    expect(BOOKTOWN_REFINERY_AUTHORITY_RULES).toMatchObject({
      providerRole: "enrichment_only",
      mayEnterCanonicalBookWritePath: false,
      mayWriteFirestoreDirectly: false,
      mayOverrideCanonicalLocks: false,
      maySetCanonicalFieldTrust: false,
      mayCreateBookIdentityMappings: false,
      mustRouteAcceptedChangesThrough: "materializeBookAuthority",
    });
    expect(BOOKTOWN_REFINERY_FIELD_OWNERSHIP.neverOwnedByRefinery).toContain("canonicalKey");
    expect(BOOKTOWN_REFINERY_FIELD_OWNERSHIP.proposedOnly).toContain("embedding.vectorRef");
  });

  it("accepts a governed semantic artifact envelope", () => {
    expect(
      validateBookTownRefineryArtifact({
        schemaVersion: 1,
        provider: "booktownRefinery",
        artifactId: "refinery:crime-and-punishment:v1",
        artifactStatus: "candidate",
        sourceFactoryVersion: "2026.05.23",
        sourceContentHash: "sha256:abc123",
        generatedAt: "2026-05-23T12:00:00.000Z",
        canonicalKey: "crime and punishment::fyodor dostoevsky",
        ontology: {
          form: "novel",
          subForm: "philosophical_prose",
          canonicalTradition: "russian_realism",
        },
        scores: {
          literaryQuality: 0.98,
          canonicalPotential: 0.99,
        },
        confidence: "high",
        semanticMetadata: {
          topics: ["guilt", "redemption"],
          movements: ["russian realism"],
        },
        embedding: {
          model: "text-embedding-model",
          dimensions: 1536,
          vectorRef: "vectors/books/crime-and-punishment",
          contentHash: "sha256:def456",
          createdAt: "2026-05-23T12:00:00.000Z",
        },
      })
    ).toBe(true);
  });

  it("rejects malformed refinery scores and provider identity", () => {
    expect(
      validateBookTownRefineryArtifact({
        schemaVersion: 1,
        provider: "booktown-canonical-factory",
        artifactId: "bad",
        artifactStatus: "candidate",
        sourceFactoryVersion: "1",
        sourceContentHash: "sha256:abc123",
        generatedAt: "2026-05-23T12:00:00.000Z",
      })
    ).toBe(false);

    expect(
      validateBookTownRefineryArtifact({
        schemaVersion: 1,
        provider: "booktownRefinery",
        artifactId: "bad-score",
        artifactStatus: "candidate",
        sourceFactoryVersion: "1",
        sourceContentHash: "sha256:abc123",
        generatedAt: "2026-05-23T12:00:00.000Z",
        scores: {
          literaryQuality: 99,
        },
      })
    ).toBe(false);
  });
});
