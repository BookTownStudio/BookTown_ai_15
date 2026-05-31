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

function readString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return new Date().toISOString();
}

function isPublicQuote(data: Record<string, unknown>): boolean {
  return data.status !== "archived" &&
    data.status !== "deleted" &&
    data.visibility !== "private" &&
    data.isPublic !== false;
}

export type QuoteProjectionPayload = {
  id: string;
  canonicalQuoteId: string;
  ownerId: string;
  authorUid: string;
  textEn: string;
  textAr: string;
  quoteText: string;
  sourceEn: string;
  sourceAr: string;
  bookId?: string;
  authorId?: string;
  chapter?: string;
  page?: number;
  sourceType: string;
  anchor: unknown;
  provenance?: unknown;
  visibility: "public" | "private";
  status: "active" | "archived" | "deleted";
  isPublic: boolean;
  searchTextNormalized: string;
  searchTokens: unknown[];
  likeCount: number;
  bookmarkCount: number;
  shareCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  projectionVersion: typeof QUOTE_PROJECTION_VERSION;
};

export function buildQuoteProjectionPayload(
  quoteId: string,
  data: Record<string, unknown>
): QuoteProjectionPayload | null {
  const ownerId = readString(data.authorUid, 128) || readString(data.ownerId, 128);
  const quoteText = readString(data.quoteText, 2000) || readString(data.textEn, 2000) || readString(data.textAr, 2000);
  const textEn = readString(data.textEn, 2000) || quoteText;
  const textAr = readString(data.textAr, 2000) || quoteText;
  const sourceEn = readString(data.sourceEn, 240) || readString(data.sourceReference, 240);
  const sourceAr = readString(data.sourceAr, 240) || sourceEn;
  if (!ownerId || !quoteText || !sourceEn) return null;

  return {
    id: quoteId,
    canonicalQuoteId: quoteId,
    ownerId,
    authorUid: ownerId,
    textEn,
    textAr,
    quoteText,
    sourceEn,
    sourceAr,
    bookId: readString(data.bookId, 180) || undefined,
    authorId: readString(data.authorId, 180) || undefined,
    chapter: readString(data.chapter, 120) || undefined,
    page: typeof data.page === "number" && Number.isFinite(data.page) ? Math.trunc(data.page) : undefined,
    sourceType: readString(data.sourceType, 80) || "manual",
    anchor: data.anchor ?? null,
    provenance: data.provenance && typeof data.provenance === "object" ? data.provenance : undefined,
    visibility: data.visibility === "private" ? "private" : "public",
    status: data.status === "archived" || data.status === "deleted" ? data.status : "active",
    isPublic: isPublicQuote(data),
    searchTextNormalized: readString(data.searchTextNormalized, 5000),
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens.slice(0, 40) : [],
    likeCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    postCount: 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    sourcePath: `quotes/${quoteId}`,
    projectionVersion: QUOTE_PROJECTION_VERSION,
  };
}
