import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../lib/firebase.ts";
import { Quote } from "../types/entities.ts";

export interface ManagedQuote extends Quote {
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListQuotesRequest {
  ownerId?: string;
  limit?: number;
  cursor?: string;
  bookId?: string;
  authorId?: string;
  query?: string;
}

export interface ListQuotesResponse {
  quotes: ManagedQuote[];
  nextCursor?: string;
}

type FailureEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`[QUOTE_SERVICE] ${field} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseManagedQuote(payload: unknown): ManagedQuote {
  if (!payload || typeof payload !== "object") {
    throw new Error("[QUOTE_SERVICE] Invalid quote payload.");
  }

  const quote = payload as Record<string, unknown>;
  const bookId = normalizeOptionalString(quote.bookId);
  const authorId = normalizeOptionalString(quote.authorId);
  const createdAt = normalizeOptionalString(quote.createdAt);
  const updatedAt = normalizeOptionalString(quote.updatedAt);

  return {
    id: assertNonEmptyString(quote.id, "quote.id"),
    ownerId: assertNonEmptyString(quote.ownerId, "quote.ownerId"),
    textEn: assertNonEmptyString(quote.textEn, "quote.textEn"),
    textAr: assertNonEmptyString(quote.textAr, "quote.textAr"),
    sourceEn: assertNonEmptyString(quote.sourceEn, "quote.sourceEn"),
    sourceAr: assertNonEmptyString(quote.sourceAr, "quote.sourceAr"),
    ...(bookId ? { bookId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function extractSuccessData<T>(
  endpoint: string,
  payload: unknown
): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(`[${endpoint}] Invalid callable response envelope.`);
  }

  const envelope = payload as Partial<SuccessEnvelope<T>> &
    Partial<FailureEnvelope> & {
      success?: boolean;
    };

  if (envelope.success === false && envelope.error) {
    const code = assertNonEmptyString(envelope.error.code, `${endpoint}.error.code`);
    const message = assertNonEmptyString(
      envelope.error.message,
      `${endpoint}.error.message`
    );
    throw new Error(`[${code}] ${message}`);
  }

  if (envelope.success !== true || !("data" in envelope)) {
    throw new Error(`[${endpoint}] Missing success envelope data.`);
  }

  return envelope.data as T;
}

function formatCallableError(endpoint: string, error: unknown): Error {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;

    if (typeof code === "string" && typeof message === "string") {
      return new Error(`[${endpoint}] ${code}: ${message}`);
    }

    if (typeof message === "string") {
      return new Error(`[${endpoint}] ${message}`);
    }
  }

  return new Error(`[${endpoint}] Unknown callable failure.`);
}

async function callQuoteEndpoint<TRequest, TData>(
  endpoint: string,
  request: TRequest
): Promise<TData> {
  try {
    const fn = httpsCallable<TRequest, SuccessEnvelope<TData> | FailureEnvelope>(
      getFirebaseFunctions(),
      endpoint
    );
    const result = await fn(request);
    return extractSuccessData<TData>(endpoint, result.data);
  } catch (error) {
    throw formatCallableError(endpoint, error);
  }
}

export const quoteService = {
  async listUserQuotes(request: ListQuotesRequest = {}): Promise<ListQuotesResponse> {
    const data = await callQuoteEndpoint<ListQuotesRequest, {
      quotes: unknown[];
      nextCursor?: string;
    }>("listUserQuotes", request);

    if (!Array.isArray(data.quotes)) {
      throw new Error("[listUserQuotes] Invalid quotes payload.");
    }

    const quotes = data.quotes.map(parseManagedQuote);

    const nextCursor = normalizeOptionalString(data.nextCursor);

    return {
      quotes,
      ...(nextCursor ? { nextCursor } : {}),
    };
  },

  async getQuoteById(params: {
    quoteId: string;
    ownerId?: string;
  }): Promise<ManagedQuote> {
    const data = await callQuoteEndpoint<typeof params, unknown>(
      "getQuoteById",
      params
    );
    return parseManagedQuote(data);
  },

  async createQuote(params: {
    textEn: string;
    textAr: string;
    sourceEn: string;
    sourceAr: string;
    bookId?: string;
    authorId?: string;
    isPublic?: boolean;
  }): Promise<ManagedQuote> {
    const data = await callQuoteEndpoint<typeof params, unknown>(
      "createQuote",
      params
    );
    return parseManagedQuote(data);
  },

  async saveQuoteFromReference(params: {
    sourceOwnerId: string;
    sourceQuoteId: string;
  }): Promise<{ quote: ManagedQuote; alreadySaved: boolean }> {
    const data = await callQuoteEndpoint<typeof params, {
      quote: unknown;
      alreadySaved: boolean;
    }>("saveQuoteFromReference", params);

    return {
      quote: parseManagedQuote(data.quote),
      alreadySaved: data.alreadySaved === true,
    };
  },

  async toggleQuoteBookmark(params: {
    quoteId: string;
    quoteOwnerId: string;
    active: boolean;
  }): Promise<{ bookmarked: boolean; bookmarkId: string }> {
    const data = await callQuoteEndpoint<typeof params, {
      bookmarked: boolean;
      bookmarkId: string;
    }>("toggleQuoteBookmark", params);

    return {
      bookmarked: data.bookmarked === true,
      bookmarkId: assertNonEmptyString(data.bookmarkId, "bookmarkId"),
    };
  },
};
