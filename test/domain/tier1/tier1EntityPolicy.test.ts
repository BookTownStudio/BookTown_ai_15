import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  createQuoteEntityRef,
  createWorkEntityRef,
  createPublicationEntityRef,
} from "../../../contracts/entityPlatform";
import {
  getTier1EntityEligibility,
  isActiveCanonicalTier1Ref,
  isReadableButNonCanonicalTier1Ref,
  isTier1LiteraryAtom,
} from "../../../lib/domain/tier1/tier1EntityPolicy.ts";

describe("tier1EntityPolicy", () => {
  it("recognizes only Book/Work, Author, and Quote as Tier-1 literary atoms", () => {
    expect(isTier1LiteraryAtom("work")).toBe(true);
    expect(isTier1LiteraryAtom("author")).toBe(true);
    expect(isTier1LiteraryAtom("quote")).toBe(true);
    expect(isTier1LiteraryAtom("theme")).toBe(false);
    expect(isTier1LiteraryAtom("concept")).toBe(false);
  });

  it("allows active canonical Tier-1 refs into Search, Identity, Graph, and MatchMaker contracts", () => {
    for (const ref of [
      createWorkEntityRef("book_1"),
      createAuthorEntityRef("author_1"),
      createQuoteEntityRef("quote_1"),
    ]) {
      expect(isActiveCanonicalTier1Ref(ref)).toBe(true);
      expect(getTier1EntityEligibility(ref)).toEqual({
        search: true,
        identityGraph: true,
        literaryGraph: true,
        matchmaker: true,
        reason: "active_canonical_tier1_entity",
      });
    }
  });

  it("blocks non-canonical Tier-1 refs from Identity Graph, Literary Graph, and MatchMaker", () => {
    const ref = createAuthorEntityRef("author_candidate_1", {
      authorityState: "candidate",
      authoritySource: "provider",
    });

    expect(isActiveCanonicalTier1Ref(ref)).toBe(false);
    expect(isReadableButNonCanonicalTier1Ref(ref)).toBe(true);
    expect(getTier1EntityEligibility(ref)).toEqual({
      search: false,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "non_canonical_tier1_entity",
    });
  });

  it("permits resolved Tier-1 refs only for degraded search/display compatibility", () => {
    const ref = createQuoteEntityRef("quote_resolved_1", {
      authorityState: "resolved",
      authoritySource: "migration",
      canonicalId: "quote_1",
    });

    expect(getTier1EntityEligibility(ref)).toEqual({
      search: true,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "non_canonical_tier1_entity",
    });
  });

  it("requires merged Tier-1 refs to resolve to the survivor before downstream use", () => {
    const ref = createQuoteEntityRef("quote_old", {
      authorityState: "merged",
      mergeTarget: createQuoteEntityRef("quote_survivor"),
    });

    expect(getTier1EntityEligibility(ref)).toEqual({
      search: false,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "merged_entity_requires_survivor_resolution",
    });
  });

  it("blocks non-Tier-1 entities from this stabilization policy", () => {
    expect(getTier1EntityEligibility(createPublicationEntityRef("publication_1"))).toEqual({
      search: false,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "not_tier1_literary_atom",
    });
  });
});
