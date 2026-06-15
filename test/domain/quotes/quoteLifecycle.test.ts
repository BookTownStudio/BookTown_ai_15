import { describe, expect, it } from "vitest";
import {
  resolveQuoteAttribution,
  resolveQuoteRuntimeLifecycle,
} from "../../../lib/quotes/quoteLifecycle.ts";
import { toQuoteEntitySummary } from "../../../lib/quotes/quoteEntitySummaryAdapter.ts";
import type { Quote } from "../../../types/entities.ts";

const baseQuote: Quote = {
  id: "quote_1",
  canonicalQuoteId: "quote_1",
  ownerId: "user_1",
  textEn: "A canonical quote.",
  textAr: "اقتباس قانوني.",
  sourceEn: "Canonical Work",
  sourceAr: "عمل قانوني",
  bookId: "book_1",
  authorId: "author_1",
  provenance: {
    sourceType: "book",
    verificationStatus: "canonical_linked",
    sourceBookId: "book_1",
    sourceAuthorId: "author_1",
  },
};

function quote(overrides: Partial<Quote> = {}): Quote {
  const next = {
    ...baseQuote,
    ...overrides,
  };
  if ("provenance" in overrides) return next;
  return { ...next, provenance: baseQuote.provenance };
}

describe("quoteLifecycle", () => {
  it("treats canonical quotes with source and provenance as active canonical entities", () => {
    const lifecycle = resolveQuoteRuntimeLifecycle(quote());

    expect(lifecycle).toMatchObject({
      lifecycleState: "canonical",
      entityAuthorityState: "canonical",
      canonicalQuoteId: "quote_1",
      graphEligible: true,
      identityGraphEligible: true,
      reason: "authority_safe_quote",
      attribution: {
        bookAttribution: "canonical",
        authorAttribution: "canonical",
        sourceAttribution: "present",
        provenanceState: "canonical_linked",
      },
    });
  });

  it("marks duplicate and merged quotes as merged entity refs requiring canonical resolution", () => {
    expect(resolveQuoteRuntimeLifecycle(quote({ duplicateOfQuoteId: "quote_survivor" }))).toMatchObject({
      lifecycleState: "duplicate",
      entityAuthorityState: "merged",
      duplicateOfQuoteId: "quote_survivor",
      graphEligible: false,
      identityGraphEligible: false,
    });

    const summary = toQuoteEntitySummary(
      quote({ lifecycleState: "merged", mergeTargetQuoteId: "quote_survivor" })
    );
    expect(summary.ref).toMatchObject({
      entityType: "quote",
      authorityState: "merged",
      mergeTarget: {
        entityType: "quote",
        entityId: "quote_survivor",
      },
    });
  });

  it("blocks disputed quote attribution from canonical eligibility", () => {
    expect(resolveQuoteRuntimeLifecycle(quote({ disputed: true }))).toMatchObject({
      lifecycleState: "disputed",
      entityAuthorityState: "candidate",
      graphEligible: false,
      identityGraphEligible: false,
      reason: "disputed_quote_not_canonical",
    });
  });

  it("classifies translation, variant, and paraphrase states separately", () => {
    expect(resolveQuoteRuntimeLifecycle(quote({ translationStatus: "translated" }))).toMatchObject({
      lifecycleState: "translation",
      entityAuthorityState: "canonical",
      graphEligible: true,
    });
    expect(resolveQuoteRuntimeLifecycle(quote({ variantOfQuoteId: "quote_parent" }))).toMatchObject({
      lifecycleState: "variant",
      entityAuthorityState: "resolved",
      graphEligible: false,
      reason: "quote_variant_requires_canonical_lineage",
    });
    expect(resolveQuoteRuntimeLifecycle(quote({ paraphraseOfQuoteId: "quote_parent" }))).toMatchObject({
      lifecycleState: "paraphrase",
      entityAuthorityState: "resolved",
      graphEligible: false,
      reason: "paraphrase_not_canonical_quote_text",
    });
  });

  it("classifies reader-highlight and imported origins without creating meaning authority", () => {
    expect(
      resolveQuoteRuntimeLifecycle(
        quote({
          provenance: {
            ...baseQuote.provenance!,
            readerSource: {
              sourceSignatureHash: "hash_1",
              attachmentId: null,
              manifestVersion: 1,
              sourceType: "epub",
            },
          },
        })
      )
    ).toMatchObject({
      lifecycleState: "reader_highlight",
      entityAuthorityState: "canonical",
      graphEligible: false,
      identityGraphEligible: true,
      reason: "reader_highlight_is_private_origin_evidence",
    });

    expect(resolveQuoteRuntimeLifecycle(quote({ originType: "dataset_import" }))).toMatchObject({
      lifecycleState: "imported",
      entityAuthorityState: "canonical",
      graphEligible: true,
    });
  });

  it("blocks archived and incomplete-provenance quotes", () => {
    expect(resolveQuoteRuntimeLifecycle(quote({ archived: true }))).toMatchObject({
      lifecycleState: "archived",
      entityAuthorityState: "archived",
      graphEligible: false,
      identityGraphEligible: false,
    });

    expect(resolveQuoteRuntimeLifecycle(quote({ provenance: undefined }))).toMatchObject({
      entityAuthorityState: "canonical",
      graphEligible: false,
      identityGraphEligible: false,
      reason: "quote_attribution_or_provenance_incomplete",
    });
  });

  it("reports attribution states explicitly", () => {
    expect(resolveQuoteAttribution(quote({ bookId: undefined, authorId: "author_1" }))).toEqual({
      bookAttribution: "missing",
      authorAttribution: "canonical",
      sourceAttribution: "present",
      translationAttribution: "unspecified",
      provenanceState: "canonical_linked",
    });
  });
});
