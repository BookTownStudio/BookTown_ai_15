import { SearchResponseDTO, SearchResultDTO } from '../types/bookSearch.ts';
import { logBookEngineV2 } from '../lib/logging/bookEngineV2Log.ts';
import {
  getFirebaseAppCheckToken,
  getFirebaseAuth,
  isFirebaseInitialized,
} from '../lib/firebase.ts';

type SearchParams = {
  query: string;
  ebookOnly?: boolean;
  lang?: string;
  cursor?: string;
  limit?: number;
};

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type FailureEnvelope = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

export class BookSearchRequestError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, options?: { code?: string; status?: number | null }) {
    super(message);
    this.name = 'BookSearchRequestError';
    this.code = options?.code || 'SEARCH_REQUEST_FAILED';
    this.status = typeof options?.status === 'number' ? options.status : null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeResult(raw: unknown): SearchResultDTO | null {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!record) return null;

  const source = asString(record.source);
  if (source !== 'booktown' && source !== 'googleBooks' && source !== 'openLibrary') {
    return null;
  }

  const resultType = asString(record.resultType) === 'external' ? 'external' : 'canonical';
  const id = asString(record.id);
  const editionId = asString(record.editionId) || id;
  const canonicalBookId =
    resultType === 'canonical'
      ? asString(record.bookId) || id
      : '';
  const workId = asString(record.workId) || null;
  const workType = asString(record.workType) === 'edition' ? 'edition' : 'work';
  const editionPresenceRaw = asString(record.editionPresence);
  const editionPresence =
    editionPresenceRaw === 'grouped' || editionPresenceRaw === 'edition'
      ? editionPresenceRaw
      : 'single';
  const ebookClassRaw = asString(record.ebookClass);
  const ebookClass =
    ebookClassRaw === 'in_app' ||
    ebookClassRaw === 'external_link' ||
    ebookClassRaw === 'unavailable'
      ? ebookClassRaw
      : Boolean(record.downloadable)
      ? 'in_app'
      : 'unavailable';
  const sourceClass = asString(record.sourceClass) === 'external_provider'
    ? 'external_provider'
    : 'canonical_catalog';
  const languageTruthRaw = asString(record.languageTruth);
  const languageTruth =
    languageTruthRaw === 'match' ||
    languageTruthRaw === 'mismatch' ||
    languageTruthRaw === 'unknown'
      ? languageTruthRaw
      : 'unknown';

  if (!id || !editionId || (resultType === 'canonical' && !canonicalBookId)) {
    return null;
  }

  const title = asString(record.title) || asString(record.titleEn);
  if (!title) return null;

  const authors = asStringArray(record.authors);
  const authorEn = asString(record.authorEn) || authors[0] || 'Unknown';

  const confidenceRaw = Number(record.confidence);
  const rankRaw = Number(record.rank);

  return {
    id,
    editionId,
    bookId: canonicalBookId,
    workId,
    externalId: asString(record.externalId),
    source,
    resultType,
    workType,
    editionPresence,
    ebookClass,
    sourceClass,
    languageTruth,
    title,
    titleEn: asString(record.titleEn) || title,
    titleAr: asString(record.titleAr),
    authors: authors.length > 0 ? authors : [authorEn],
    authorEn,
    authorAr: asString(record.authorAr),
    description: asString(record.description),
    descriptionEn: asString(record.descriptionEn),
    descriptionAr: asString(record.descriptionAr),
    coverUrl: asString(record.coverUrl),
    language: asString(record.language) || 'en',
    hasEbook: Boolean(record.hasEbook),
    downloadable: Boolean(record.downloadable),
    isEbookAvailable: Boolean(record.isEbookAvailable),
    confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : 0,
    rank: Number.isFinite(rankRaw) ? Math.max(0, Math.trunc(rankRaw)) : 999,
    rawBook:
      record.rawBook && typeof record.rawBook === 'object'
        ? (record.rawBook as Record<string, unknown>)
        : undefined,
  };
}

async function buildSearchHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const isDev = import.meta.env.DEV === true;

  if (!isFirebaseInitialized()) {
    throw new BookSearchRequestError('Search requires Firebase initialization.', {
      code: 'FIREBASE_NOT_INITIALIZED',
    });
  }

  try {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (typeof token === 'string' && token.trim().length > 0) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }
    }
  } catch {
    // Backend remains authoritative; App Check is still required below.
  }

  const appCheckToken = await getFirebaseAppCheckToken();
  if (typeof appCheckToken !== 'string' || appCheckToken.trim().length === 0) {
    if (isDev) {
      console.warn('[BOOK_SEARCH_SERVICE][APP_CHECK_BYPASS_DEV]');
      return headers;
    }
    throw new BookSearchRequestError('Search requires App Check validation.', {
      code: 'APP_CHECK_REQUIRED',
    });
  }

  headers['X-Firebase-AppCheck'] = appCheckToken.trim();
  return headers;
}

function normalizeResponse(payload: unknown): SearchResponseDTO {
  const response = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const envelope = response as {
    success?: boolean;
    data?: unknown;
  };
  const data =
    envelope.success === true && envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : response;

  const rawResults = Array.isArray((data as any)?.results) ? (data as any).results : [];
  const results = rawResults
    .map((entry: unknown) => normalizeResult(entry))
    .filter((entry: SearchResultDTO | null): entry is SearchResultDTO => entry !== null);

  const nextCursorRaw = (data as any)?.nextCursor;

  return {
    results,
    nextCursor: typeof nextCursorRaw === 'string' ? nextCursorRaw : null,
    hasMore: Boolean((data as any)?.hasMore),
    cursorUsed: Boolean((data as any)?.cursorUsed),
  };
}

export const bookSearchService = {
  async searchBooks(params: SearchParams): Promise<SearchResponseDTO> {
    const query = params.query.trim();
    if (query.length < 2) {
      return {
        results: [],
        nextCursor: null,
        hasMore: false,
        cursorUsed: false,
      };
    }

    const url = new URL('/api/search/books', window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('ebookOnly', params.ebookOnly ? 'true' : 'false');

    if (params.lang) {
      url.searchParams.set('lang', params.lang);
    }

    if (params.cursor) {
      url.searchParams.set('cursor', params.cursor);
    }

    if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
      const limit = Math.max(1, Math.min(30, Math.trunc(params.limit)));
      url.searchParams.set('limit', String(limit));
    }

    try {
      const headers = await buildSearchHeaders();
      logBookEngineV2('BOOK_SEARCH_V2_HTTP', {
        phase: 'request',
        path: '/api/search/books',
        url: `${url.pathname}?${url.searchParams.toString()}`,
        q: query.slice(0, 80),
        ebookOnly: Boolean(params.ebookOnly),
        lang: params.lang || 'auto',
        limit:
          typeof params.limit === 'number'
            ? Math.max(1, Math.min(30, Math.trunc(params.limit)))
            : 15,
        cursor: params.cursor ? params.cursor.slice(0, 80) : null,
      });

      const response = await fetch(url.toString(), {
        headers,
      });
      logBookEngineV2('BOOK_SEARCH_V2_HTTP', {
        phase: 'response',
        path: '/api/search/books',
        status: response.status,
        ok: response.ok,
      });
      if (!response.ok) {
        let errorCode = 'SEARCH_HTTP_ERROR';
        let errorMessage = 'Search request failed.';
        try {
          const payload = await response.json();
          errorCode =
            typeof payload?.error === 'string' && payload.error.trim().length > 0
              ? payload.error.trim()
              : errorCode;
          errorMessage =
            typeof payload?.message === 'string' && payload.message.trim().length > 0
              ? payload.message.trim()
              : errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new BookSearchRequestError(errorMessage, {
          code: errorCode,
          status: response.status,
        });
      }

      const payload = await response.json();
      return normalizeResponse(payload);
    } catch (error) {
      console.error('[BOOK_SEARCH_SERVICE][NETWORK_ERROR]', error);
      if (error instanceof BookSearchRequestError) {
        throw error;
      }
      throw new BookSearchRequestError('Network error while searching books.', {
        code: 'SEARCH_NETWORK_ERROR',
      });
    }
  },
};
