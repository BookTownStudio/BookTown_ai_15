import { logBookEngineV2 } from '../lib/logging/bookEngineV2Log.ts';
import { SearchResultDTO } from '../types/bookSearch.ts';

type QueryIntent = 'ISBN' | 'AUTHOR_INTENT' | 'TITLE_INTENT' | 'MIXED_INTENT';

type TrackSearchClickParams = {
  query: string;
  clickedRank: number;
  result: SearchResultDTO;
};

function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyIntent(query: string): QueryIntent {
  const normalized = normalizeSearchText(query);
  const digits = normalized.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(digits) || /^\d{9}[\dX]$/.test(digits)) {
    return 'ISBN';
  }

  const tokens = normalized.split(' ').filter((token) => token.length > 1);
  if (tokens.length === 1) return 'AUTHOR_INTENT';
  if (tokens.length >= 2) return 'TITLE_INTENT';
  return 'MIXED_INTENT';
}

export function trackSearchClick(params: TrackSearchClickParams): void {
  const normalizedQuery = normalizeSearchText(params.query);
  if (!normalizedQuery || !params.result.bookId) {
    return;
  }

  const clickedRank = Number.isFinite(params.clickedRank) && params.clickedRank > 0
    ? Math.trunc(params.clickedRank)
    : 1;

  const payload = {
    normalizedQuery,
    intentType: classifyIntent(normalizedQuery),
    clickedRank,
    bookId: params.result.bookId,
    wasCanonical: params.result.resultType === 'canonical',
  };

  logBookEngineV2('SEARCH_V2_CLICK', {
    normalizedQuery: normalizedQuery.slice(0, 80),
    intentType: payload.intentType,
    clickedRank,
    bookId: payload.bookId,
    wasCanonical: payload.wasCanonical,
  });

  void fetch('/api/search/click', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Telemetry is best-effort and must not affect UX.
  });
}
