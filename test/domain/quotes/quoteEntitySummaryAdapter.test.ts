import { describe, expect, it } from "vitest";
import {
  toCanonicalQuoteRef,
  toQuoteEntitySummary,
} from "../../../lib/quotes/quoteEntitySummaryAdapter.ts";
import type { Quote } from "../../../types/entities.ts";

const quote: Quote = {
  id: "quote_1",
  canonicalQuoteId: "quote_1",
  legacyQuoteId: "legacy_quote_1",
  ownerId: "user_1",
  textEn: "The answer is not in the silence, but in the question.",
  textAr: "ليست الإجابة في الصمت، بل في السؤال.",
  sourceEn: "Example Work",
  sourceAr: "عمل تجريبي",
  bookId: "book_1",
  authorId: "author_1",
  provenance: {
    sourceType: "book",
    verificationStatus: "canonical_linked",
    sourceBookId: "book_1",
    sourceAuthorId: "author_1",
  },
};

describe("quoteEntitySummaryAdapter", () => {
  it("generates a canonical Quote LiteraryEntityRef", () => {
    expect(toCanonicalQuoteRef(" quote_1 ")).toMatchObject({
      entityType: "quote",
      entityId: "quote_1",
      authorityState: "canonical",
      authoritySource: "quote_authority",
      provenance: {
        sourceClass: "system",
        sourceSystem: "quote_authority",
        sourceId: "quote_1",
      },
    });
  });

  it("generates a display-safe Quote EntitySummary", () => {
    expect(toQuoteEntitySummary(quote)).toMatchObject({
      ref: {
        entityType: "quote",
        entityId: "quote_1",
        authorityState: "canonical",
        authoritySource: "quote_authority",
      },
      title: "The answer is not in the silence, but in the question.",
      subtitle: "Example Work",
      authorityState: "canonical",
      navigation: "openable",
      localizedTitles: {
        ar: "ليست الإجابة في الصمت، بل في السؤال.",
      },
    });
  });

  it("keeps owner and legacy ids out of entity identity", () => {
    const summary = toQuoteEntitySummary(quote);

    expect(summary.ref.entityId).toBe("quote_1");
    expect(summary.ref.entityId).not.toBe(quote.ownerId);
    expect(summary.ref.entityId).not.toBe(quote.legacyQuoteId);
    expect(summary.typeSpecific).toMatchObject({
      canonicalQuoteId: "quote_1",
      legacyQuoteId: "legacy_quote_1",
      bookId: "book_1",
      authorId: "author_1",
      provenance: {
        verificationStatus: "canonical_linked",
      },
    });
  });

  it("does not create Work or Author refs from quote attribution fields", () => {
    const summary = toQuoteEntitySummary(quote);
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("\"entityType\":\"work\"");
    expect(serialized).not.toContain("\"entityType\":\"author\"");
    expect(summary.typeSpecific).toMatchObject({
      bookId: "book_1",
      authorId: "author_1",
    });
  });

  it("carries lifecycle and attribution metadata as projection context", () => {
    const summary = toQuoteEntitySummary({
      ...quote,
      translationStatus: "translated",
      translatedFrom: "fr",
    });

    expect(summary.ref).toMatchObject({
      entityType: "quote",
      entityId: "quote_1",
      authorityState: "canonical",
    });
    expect(summary.typeSpecific).toMatchObject({
      lifecycleState: "translation",
      lifecycleReason: "authority_safe_quote",
      graphEligible: true,
      identityGraphEligible: true,
      translationStatus: "translated",
      translatedFrom: "fr",
      attribution: {
        bookAttribution: "canonical",
        authorAttribution: "canonical",
        provenanceState: "canonical_linked",
      },
    });
  });
});
