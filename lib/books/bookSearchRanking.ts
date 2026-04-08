import { create, insertMultiple, search } from '@orama/orama';

import type { SearchResponseDTO, SearchResultDTO } from '../../types/bookSearch.ts';

type RankedCandidate = {
  result: SearchResultDTO;
  originalIndex: number;
  oramaScore: number;
  isCanonical: boolean;
  isExternalEdition: boolean;
  exactIsbnMatch: boolean;
  exactCanonicalMatch: boolean;
  strongTitleMatch: boolean;
  authorCanonicalMatch: boolean;
  backendRank: number;
  confidence: number;
  canonicalWorkKey: string;
  editionKey: string;
  bridgeKey: string;
};

type SearchIndexDocument = {
  id: string;
  title: string;
  author: string;
  isbn: string;
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

function tokenize(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function normalizeIsbn(value?: string | null, length?: 10 | 13): string {
  if (!value) return '';
  const normalized = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (length === 10) {
    return /^\d{9}[\dX]$/.test(normalized) ? normalized : '';
  }
  if (length === 13) {
    return /^\d{13}$/.test(normalized) ? normalized : '';
  }
  return /^\d{13}$/.test(normalized) || /^\d{9}[\dX]$/.test(normalized)
    ? normalized
    : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolvePrimaryAuthor(result: SearchResultDTO): string {
  return result.authorEn || result.authors[0] || '';
}

function resolvePrimaryTitle(result: SearchResultDTO): string {
  return result.titleEn || result.title;
}

function extractBibliographicIdentifiers(result: SearchResultDTO): {
  isbn13: string;
  isbn10: string;
  canonicalKey: string;
} {
  let isbn13 = normalizeIsbn(result.isbn13, 13);
  let isbn10 = normalizeIsbn(result.isbn10, 10);
  let canonicalKey = asString(result.canonicalKey);

  const rawBook = asRecord(result.rawBook);
  if (rawBook) {
    if (!isbn13) {
      isbn13 = normalizeIsbn(
        asString(rawBook.isbn13) || asString(asStringArray(rawBook.isbn_13)[0]),
        13
      );
    }
    if (!isbn10) {
      isbn10 = normalizeIsbn(
        asString(rawBook.isbn10) || asString(asStringArray(rawBook.isbn_10)[0]),
        10
      );
    }
    if (!canonicalKey) {
      canonicalKey = asString(rawBook.canonicalKey);
    }

    const industryIdentifiers = Array.isArray(rawBook.industryIdentifiers)
      ? rawBook.industryIdentifiers
      : [];
    for (const identifierRaw of industryIdentifiers) {
      const identifier = asRecord(identifierRaw);
      if (!identifier) continue;
      const type = asString(identifier.type).toUpperCase();
      const value = asString(identifier.identifier);
      if (!isbn13 && type.includes('ISBN_13')) {
        isbn13 = normalizeIsbn(value, 13);
      }
      if (!isbn10 && type.includes('ISBN_10')) {
        isbn10 = normalizeIsbn(value, 10);
      }
      if (isbn13 && isbn10) break;
    }
  }

  return { isbn13, isbn10, canonicalKey };
}

function buildBridgeKey(result: SearchResultDTO): string {
  const title = normalizeSearchText(resolvePrimaryTitle(result));
  const author = normalizeSearchText(resolvePrimaryAuthor(result));
  const language = normalizeSearchText(result.language || 'unknown') || 'unknown';
  return `${title}::${author}::${language}`;
}

function buildEditionKey(
  result: SearchResultDTO,
  identifiers: { isbn13: string; isbn10: string; canonicalKey: string }
): string {
  if (identifiers.isbn13) return `isbn13:${identifiers.isbn13}`;
  if (identifiers.isbn10) return `isbn10:${identifiers.isbn10}`;
  if (identifiers.canonicalKey) return `canonical:${normalizeSearchText(identifiers.canonicalKey)}`;
  return `bridge:${buildBridgeKey(result)}`;
}

function buildCanonicalWorkKey(result: SearchResultDTO): string {
  if (result.resultType !== 'canonical') return '';
  if (result.workId) return `work:${result.workId}`;
  if (result.bookId) return `book:${result.bookId}`;
  return '';
}

function countQueryTokensInField(queryTokens: string[], field: string): number {
  if (queryTokens.length === 0 || !field) return 0;
  return queryTokens.filter((token) => field.includes(token)).length;
}

function computeTolerance(query: string): number {
  const normalized = normalizeSearchText(query);
  if (!normalized || /^\d{9}[\dX]$/.test(normalized) || /^\d{13}$/.test(normalized)) {
    return 0;
  }
  return normalized.length >= 10 ? 2 : 1;
}

async function scoreWithOrama(
  query: string,
  results: SearchResultDTO[]
): Promise<Map<string, number>> {
  const docs: SearchIndexDocument[] = results.map((result) => {
    const identifiers = extractBibliographicIdentifiers(result);
    return {
      id: result.id,
      title: resolvePrimaryTitle(result),
      author: resolvePrimaryAuthor(result),
      isbn: [identifiers.isbn13, identifiers.isbn10].filter(Boolean).join(' '),
    };
  });

  const index = await create({
    schema: {
      id: 'string',
      title: 'string',
      author: 'string',
      isbn: 'string',
    },
  });

  if (docs.length > 0) {
    await insertMultiple(index, docs, docs.length);
  }

  const response = await search(index, {
    term: normalizeSearchText(query),
    properties: ['title', 'author', 'isbn'],
    exact: false,
    tolerance: computeTolerance(query),
    boost: {
      title: 10,
      author: 6,
      isbn: 12,
    },
    limit: docs.length || 1,
  });

  return new Map(response.hits.map((hit) => [hit.id, hit.score]));
}

function compareRankedCandidates(left: RankedCandidate, right: RankedCandidate): number {
  if (left.exactIsbnMatch !== right.exactIsbnMatch) {
    return left.exactIsbnMatch ? -1 : 1;
  }
  if (left.exactCanonicalMatch !== right.exactCanonicalMatch) {
    return left.exactCanonicalMatch ? -1 : 1;
  }
  if (left.strongTitleMatch !== right.strongTitleMatch) {
    return left.strongTitleMatch ? -1 : 1;
  }
  if (left.authorCanonicalMatch !== right.authorCanonicalMatch) {
    return left.authorCanonicalMatch ? -1 : 1;
  }
  if (left.isCanonical !== right.isCanonical) {
    return left.isCanonical ? -1 : 1;
  }
  if (left.isExternalEdition !== right.isExternalEdition) {
    return left.isExternalEdition ? 1 : -1;
  }
  if (left.oramaScore !== right.oramaScore) {
    return right.oramaScore - left.oramaScore;
  }
  if (left.backendRank !== right.backendRank) {
    return left.backendRank - right.backendRank;
  }
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  return left.originalIndex - right.originalIndex;
}

function suppressDuplicateFlooding(results: RankedCandidate[]): SearchResultDTO[] {
  const selected: SearchResultDTO[] = [];
  const seenCanonicalWorkKeys = new Set<string>();
  const seenEditionKeys = new Set<string>();
  const selectedBridgeKeys = new Set<string>();
  const selectedCanonicalBridgeKeys = new Set<string>();

  for (const entry of results) {
    if (entry.canonicalWorkKey && seenCanonicalWorkKeys.has(entry.canonicalWorkKey)) {
      continue;
    }
    if (selectedCanonicalBridgeKeys.has(entry.bridgeKey) && !entry.isCanonical) {
      continue;
    }
    if (seenEditionKeys.has(entry.editionKey)) {
      continue;
    }
    if (!entry.isCanonical && selectedBridgeKeys.has(entry.bridgeKey)) {
      continue;
    }

    selected.push(entry.result);

    if (entry.canonicalWorkKey) {
      seenCanonicalWorkKeys.add(entry.canonicalWorkKey);
    }
    seenEditionKeys.add(entry.editionKey);
    selectedBridgeKeys.add(entry.bridgeKey);
    if (entry.isCanonical) {
      selectedCanonicalBridgeKeys.add(entry.bridgeKey);
    }
  }

  return selected;
}

export async function rerankBookSearchResults(
  query: string,
  results: SearchResultDTO[]
): Promise<SearchResultDTO[]> {
  if (results.length < 2) {
    return results;
  }

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return results;
  }

  const queryTokens = tokenize(query);
  const queryIsbn = normalizeIsbn(query);
  const oramaScores = await scoreWithOrama(query, results);

  const ranked = results.map((result, originalIndex): RankedCandidate => {
    const identifiers = extractBibliographicIdentifiers(result);
    const normalizedTitle = normalizeSearchText(resolvePrimaryTitle(result));
    const normalizedAuthor = normalizeSearchText(resolvePrimaryAuthor(result));
    const titleTokenMatches = countQueryTokensInField(queryTokens, normalizedTitle);
    const authorTokenMatches = countQueryTokensInField(queryTokens, normalizedAuthor);
    const isCanonical = result.resultType === 'canonical';

    return {
      result,
      originalIndex,
      oramaScore: oramaScores.get(result.id) ?? 0,
      isCanonical,
      isExternalEdition: result.resultType === 'external' || result.workType === 'edition',
      exactIsbnMatch:
        Boolean(queryIsbn) &&
        (queryIsbn === identifiers.isbn13 || queryIsbn === identifiers.isbn10),
      exactCanonicalMatch: isCanonical && normalizedTitle === normalizedQuery,
      strongTitleMatch:
        normalizedTitle === normalizedQuery ||
        normalizedTitle.startsWith(normalizedQuery) ||
        titleTokenMatches >= Math.max(1, Math.ceil(queryTokens.length / 2)),
      authorCanonicalMatch:
        isCanonical &&
        (normalizedAuthor === normalizedQuery ||
          normalizedAuthor.startsWith(normalizedQuery) ||
          authorTokenMatches >= Math.max(1, Math.ceil(queryTokens.length / 2))),
      backendRank: result.rank,
      confidence: result.confidence,
      canonicalWorkKey: buildCanonicalWorkKey(result),
      editionKey: buildEditionKey(result, identifiers),
      bridgeKey: buildBridgeKey(result),
    };
  });

  ranked.sort(compareRankedCandidates);
  const deduped = suppressDuplicateFlooding(ranked);
  return deduped.slice(0, results.length);
}

export async function rerankBookSearchResponse(
  query: string,
  response: SearchResponseDTO
): Promise<SearchResponseDTO> {
  const rerankedResults = await rerankBookSearchResults(query, response.results);
  return {
    ...response,
    results: rerankedResults,
  };
}
