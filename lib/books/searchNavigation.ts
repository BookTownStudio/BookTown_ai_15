import { SearchResultDTO } from '../../types/bookSearch.ts';
import { View } from '../../types/navigation.ts';

export type PendingBookDetailsAction =
  | 'NONE'
  | 'ADD_TO_SHELF'
  | 'ATTACH_TO_POST';

export type ExternalRouteBookId = {
  provider: 'googleBooks' | 'openLibrary' | 'hindawi' | 'gallica';
  providerExternalId: string;
  source: 'googleBooks' | 'openLibrary' | null;
};

export function parseExternalRouteBookId(bookId: unknown): ExternalRouteBookId | null {
  const normalized = typeof bookId === 'string' ? bookId.trim() : '';
  if (!normalized) return null;

  const ext = normalized.match(/^ext_(googlebooks|openlibrary)_(.+)$/i);
  if (ext) {
    const providerExternalId = ext[2].trim();
    if (!providerExternalId) return null;
    const source = ext[1].toLowerCase() === 'googlebooks' ? 'googleBooks' : 'openLibrary';
    return {
      provider: source,
      providerExternalId,
      source,
    };
  }

  const prefixed = normalized.match(/^(gb|ol|ht|ga)_(.+)$/i);
  if (!prefixed) return null;

  const providerExternalId = prefixed[2].trim();
  if (!providerExternalId) return null;

  const prefix = prefixed[1].toLowerCase();
  if (prefix === 'gb') {
    return {
      provider: 'googleBooks',
      providerExternalId,
      source: 'googleBooks',
    };
  }
  if (prefix === 'ol') {
    return {
      provider: 'openLibrary',
      providerExternalId,
      source: 'openLibrary',
    };
  }
  if (prefix === 'ht') {
    return {
      provider: 'hindawi',
      providerExternalId,
      source: null,
    };
  }
  return {
    provider: 'gallica',
    providerExternalId,
    source: null,
  };
}

export function resolveIngestionSource(
  result: SearchResultDTO
): 'googleBooks' | 'openLibrary' | null {
  if (result.source === 'googleBooks') return 'googleBooks';
  if (result.source === 'openLibrary') return 'openLibrary';
  return null;
}

export function buildBookDetailsParams(
  result: SearchResultDTO,
  from: View,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  if (result.resultType === 'canonical') {
    return {
      bookId: result.bookId,
      from,
      searchResult: result,
      ...extra,
    };
  }

  return {
    bookId: result.id,
    from,
    searchResult: result,
    ...extra,
  };
}
