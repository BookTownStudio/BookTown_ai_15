import { describe, expect, it } from 'vitest';
import { buildBookDetailsParams, parseExternalRouteBookId } from './searchNavigation.ts';
import type { SearchResultDTO } from '../../types/bookSearch.ts';

const fromView = { type: 'tab', id: 'home' } as const;

function buildResult(overrides: Partial<SearchResultDTO> = {}): SearchResultDTO {
  return {
    id: 'book_1',
    editionId: 'book_1',
    bookId: 'book_1',
    workId: 'book_1',
    externalId: '',
    source: 'booktown',
    resultType: 'canonical',
    workType: 'work',
    editionPresence: 'single',
    ebookClass: 'unavailable',
    sourceClass: 'canonical_catalog',
    languageTruth: 'unknown',
    title: 'Pride and Prejudice',
    titleEn: 'Pride and Prejudice',
    titleAr: '',
    authors: ['Jane Austen'],
    authorEn: 'Jane Austen',
    authorAr: '',
    description: 'Classic novel.',
    descriptionEn: 'Classic novel.',
    descriptionAr: '',
    coverUrl: '',
    language: 'en',
    available: false,
    acquired: false,
    readAccess: 'none',
    readProvider: null,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    confidence: 1,
    rank: 1,
    ...overrides,
  };
}

describe('buildBookDetailsParams', () => {
  it('preserves auto-acquire intent while opening canonical details', () => {
    const result = buildResult({
      available: true,
      acquired: false,
      readAccess: 'trusted_external',
      readProvider: 'openLibrary',
      ebookClass: 'external_link',
    });

    expect(
      buildBookDetailsParams(result, fromView as any, { autoAcquireOnOpen: true })
    ).toMatchObject({
      bookId: 'book_1',
      from: fromView,
      autoAcquireOnOpen: true,
      searchResult: result,
    });
  });
});

describe('parseExternalRouteBookId', () => {
  it('parses supported OpenLibrary direct routes without altering canonical navigation behavior', () => {
    expect(parseExternalRouteBookId('ol_OL20221783W')).toEqual({
      provider: 'openLibrary',
      providerExternalId: 'OL20221783W',
      source: 'openLibrary',
    });
    expect(parseExternalRouteBookId('book_1')).toBeNull();
  });
});
