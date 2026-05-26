import type { Quote } from '../../types/entities.ts';

export type QuoteCardData = {
  id: string;
  canonicalQuoteId?: string;
  legacyQuoteId?: string;
  ownerId?: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  bookId?: string;
  authorId?: string;
  provenance?: Quote["provenance"];
};

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const QuoteCardDataAdapter = {
  fromQuote(quote: Quote): QuoteCardData {
    return {
      id: quote.id,
      ...(quote.canonicalQuoteId ? { canonicalQuoteId: quote.canonicalQuoteId } : {}),
      ...(quote.legacyQuoteId ? { legacyQuoteId: quote.legacyQuoteId } : {}),
      ...(quote.ownerId ? { ownerId: quote.ownerId } : {}),
      textEn: readText(quote.textEn),
      textAr: readText(quote.textAr),
      sourceEn: readText(quote.sourceEn),
      sourceAr: readText(quote.sourceAr),
      ...(quote.bookId ? { bookId: quote.bookId } : {}),
      ...(quote.authorId ? { authorId: quote.authorId } : {}),
      ...(quote.provenance ? { provenance: quote.provenance } : {}),
    };
  },
};
