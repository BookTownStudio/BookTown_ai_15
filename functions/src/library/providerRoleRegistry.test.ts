import { describe, expect, it } from "vitest";

import {
  PROVIDER_ROLE_REGISTRY,
  assertProviderCanEnterCanonicalBookWritePath,
  canProviderAffectAuthorLayer,
  canProviderEnrichExistingCanonicalBook,
  canProviderEnterCanonicalBookWritePath,
  canProviderServeTrustedReadableSource,
  getProviderAllowedAuthorFields,
  getProviderAllowedAuthorityFields,
  getProviderRole,
} from "./providerRoleRegistry";

describe("providerRoleRegistry", () => {
  it("classifies the current provider universe into explicit legal roles", () => {
    expect(PROVIDER_ROLE_REGISTRY.openLibrary.role).toBe("direct_authority");
    expect(PROVIDER_ROLE_REGISTRY.googleBooks.role).toBe("direct_authority");
    expect(PROVIDER_ROLE_REGISTRY.loc.role).toBe("restricted_authority");
    expect(PROVIDER_ROLE_REGISTRY.viaf.role).toBe("author_only_authority");
    expect(PROVIDER_ROLE_REGISTRY.wikidata.role).toBe("weighted_evidence");
    expect(PROVIDER_ROLE_REGISTRY.worldcat.role).toBe("weighted_evidence");
    expect(PROVIDER_ROLE_REGISTRY.isbndb.role).toBe("weighted_evidence");
    expect(PROVIDER_ROLE_REGISTRY.gutenberg.role).toBe("ebook_source_only");
    expect(PROVIDER_ROLE_REGISTRY.gallica.role).toBe("ebook_source_only");
    expect(PROVIDER_ROLE_REGISTRY.hindawi.role).toBe("ebook_source_only");
    expect(PROVIDER_ROLE_REGISTRY.internetArchive.role).toBe("ebook_source_only");
    expect(PROVIDER_ROLE_REGISTRY.booktownRefinery.role).toBe("enrichment_only");
    expect(PROVIDER_ROLE_REGISTRY.bnf.role).toBe("enrichment_only");
    expect(PROVIDER_ROLE_REGISTRY.britishLibrary.role).toBe("enrichment_only");
    expect(PROVIDER_ROLE_REGISTRY.dnb.role).toBe("enrichment_only");
    expect(PROVIDER_ROLE_REGISTRY.ndl.role).toBe("enrichment_only");
  });

  it("keeps current Open Library and Google Books write-path eligibility unchanged", () => {
    expect(getProviderRole("openLibrary")).toBe("direct_authority");
    expect(getProviderRole("googleBooks")).toBe("direct_authority");
    expect(canProviderEnterCanonicalBookWritePath("openLibrary")).toBe(true);
    expect(canProviderEnterCanonicalBookWritePath("googleBooks")).toBe(true);
    expect(() => assertProviderCanEnterCanonicalBookWritePath("openLibrary")).not.toThrow();
    expect(() => assertProviderCanEnterCanonicalBookWritePath("googleBooks")).not.toThrow();
  });

  it("allows readable-source providers without granting them canonical work authority", () => {
    expect(canProviderServeTrustedReadableSource("openLibrary")).toBe(true);
    expect(canProviderServeTrustedReadableSource("gutenberg")).toBe(true);
    expect(canProviderEnterCanonicalBookWritePath("gutenberg")).toBe(false);
    expect(canProviderEnterCanonicalBookWritePath("gallica")).toBe(false);
    expect(canProviderEnterCanonicalBookWritePath("hindawi")).toBe(false);
    expect(canProviderEnterCanonicalBookWritePath("internetArchive")).toBe(false);
  });

  it("enables LOC only for explicitly gated restricted enrichment fields", () => {
    expect(canProviderEnterCanonicalBookWritePath("loc")).toBe(false);
    expect(canProviderEnrichExistingCanonicalBook("loc")).toBe(true);
    expect(getProviderAllowedAuthorityFields("loc")).toEqual([
      "originalTitle",
      "locControlNumber",
      "publicationYear",
      "publisher",
      "languageEvidence",
    ]);
  });

  it("enables WorldCat only for weighted subordinate book evidence fields", () => {
    expect(canProviderEnterCanonicalBookWritePath("worldcat")).toBe(false);
    expect(canProviderEnrichExistingCanonicalBook("worldcat")).toBe(true);
    expect(getProviderAllowedAuthorityFields("worldcat")).toEqual([
      "oclcNumber",
      "editionCountSupport",
      "publicationYear",
      "publisher",
      "languageEvidence",
      "formatEvidence",
    ]);
  });

  it("enables VIAF only for gated author-layer authority fields", () => {
    expect(canProviderEnterCanonicalBookWritePath("viaf")).toBe(false);
    expect(canProviderAffectAuthorLayer("viaf")).toBe(true);
    expect(getProviderAllowedAuthorFields("viaf")).toEqual([
      "viafId",
      "canonicalAuthorAliases",
      "normalizedMultilingualNames",
      "birthYear",
      "deathYear",
      "authorityConfidenceSupport",
    ]);
  });

  it("enables Wikidata only for weighted author enrichment fields", () => {
    expect(canProviderEnterCanonicalBookWritePath("wikidata")).toBe(false);
    expect(canProviderAffectAuthorLayer("wikidata")).toBe(true);
    expect(getProviderAllowedAuthorFields("wikidata")).toEqual([
      "wikidataQid",
      "weightedAuthorAliases",
      "normalizedMultilingualNames",
      "birthYear",
      "deathYear",
      "externalAuthorityLinks",
      "authorityConfidenceSupport",
    ]);
  });

  it("registers BookTown Refinery as non-authoritative enrichment-only input", () => {
    expect(getProviderRole("booktownRefinery")).toBe("enrichment_only");
    expect(canProviderEnterCanonicalBookWritePath("booktownRefinery")).toBe(false);
    expect(canProviderEnrichExistingCanonicalBook("booktownRefinery")).toBe(false);
    expect(canProviderAffectAuthorLayer("booktownRefinery")).toBe(false);
    expect(canProviderServeTrustedReadableSource("booktownRefinery")).toBe(false);
    expect(getProviderAllowedAuthorityFields("booktownRefinery")).toEqual([]);
    expect(getProviderAllowedAuthorFields("booktownRefinery")).toEqual([]);
    expect(() =>
      assertProviderCanEnterCanonicalBookWritePath("booktownRefinery")
    ).toThrow("[PROVIDER_ROLE] booktownRefinery may not enter canonical book write path.");
  });
});
