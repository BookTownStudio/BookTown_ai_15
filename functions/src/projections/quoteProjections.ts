export const QUOTE_PROJECTION_VERSION = "quote_projection_v1";
export const USER_QUOTE_PROJECTION_COLLECTION = "user_quotes";
export const BOOK_QUOTE_PROJECTION_COLLECTION = "book_quote_projection";
export const SOCIAL_QUOTE_PROJECTION_COLLECTION = "social_quote_projection";

export function userQuoteProjectionId(authorUid: string, quoteId: string): string {
  return `${authorUid}_${quoteId}`;
}

export function bookQuoteProjectionId(quoteId: string): string {
  return quoteId;
}

export function socialQuoteProjectionId(quoteId: string): string {
  return quoteId;
}
