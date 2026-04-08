import { describe, expect, it } from 'vitest';

import type { SearchResultDTO } from '../../types/bookSearch.ts';
import { rerankBookSearchResults } from './bookSearchRanking.ts';

function buildResult(overrides: Partial<SearchResultDTO> & Pick<SearchResultDTO, 'id' | 'title' | 'titleEn' | 'authorEn'>): SearchResultDTO {
  return {
    id: overrides.id,
    editionId: overrides.editionId ?? overrides.id,
    bookId: overrides.bookId ?? overrides.id,
    workId: overrides.workId ?? overrides.bookId ?? overrides.id,
    externalId: overrides.externalId ?? '',
    source: overrides.source ?? 'booktown',
    resultType: overrides.resultType ?? 'canonical',
    workType: overrides.workType ?? 'work',
    editionPresence: overrides.editionPresence ?? 'single',
    ebookClass: overrides.ebookClass ?? 'unavailable',
    sourceClass: overrides.sourceClass ?? 'canonical_catalog',
    languageTruth: overrides.languageTruth ?? 'unknown',
    title: overrides.title,
    titleEn: overrides.titleEn,
    titleAr: overrides.titleAr ?? '',
    authors: overrides.authors ?? [overrides.authorEn],
    authorEn: overrides.authorEn,
    authorAr: overrides.authorAr ?? '',
    description: overrides.description ?? '',
    descriptionEn: overrides.descriptionEn ?? '',
    descriptionAr: overrides.descriptionAr ?? '',
    coverUrl: overrides.coverUrl ?? '',
    language: overrides.language ?? 'en',
    available: overrides.available ?? false,
    acquired: overrides.acquired ?? false,
    readAccess: overrides.readAccess ?? 'none',
    readProvider: overrides.readProvider ?? null,
    hasEbook: overrides.hasEbook ?? false,
    downloadable: overrides.downloadable ?? false,
    isEbookAvailable: overrides.isEbookAvailable ?? false,
    confidence: overrides.confidence ?? 0.9,
    rank: overrides.rank ?? 3,
    ...(overrides.isbn13 ? { isbn13: overrides.isbn13 } : {}),
    ...(overrides.isbn10 ? { isbn10: overrides.isbn10 } : {}),
    ...(overrides.canonicalKey ? { canonicalKey: overrides.canonicalKey } : {}),
    ...(overrides.rawBook ? { rawBook: overrides.rawBook } : {}),
  };
}

describe('rerankBookSearchResults', () => {
  it('puts exact ISBN matches first', async () => {
    const results = [
      buildResult({
        id: 'book-b',
        title: 'The Brothers Karamazov',
        titleEn: 'The Brothers Karamazov',
        authorEn: 'Fyodor Dostoevsky',
        isbn13: '9780140449136',
        rank: 2,
      }),
      buildResult({
        id: 'book-a',
        title: 'Crime and Punishment',
        titleEn: 'Crime and Punishment',
        authorEn: 'Fyodor Dostoevsky',
        isbn13: '9780679734505',
        rank: 0,
      }),
    ];

    const reranked = await rerankBookSearchResults('9780140449136', results);

    expect(reranked[0]?.id).toBe('book-b');
  });

  it('collapses duplicate external editions behind the best canonical work', async () => {
    const results = [
      buildResult({
        id: 'canonical-kafka',
        bookId: 'canonical-kafka',
        workId: 'work-kafka',
        title: 'The Trial',
        titleEn: 'The Trial',
        authorEn: 'Franz Kafka',
        rank: 1,
      }),
      buildResult({
        id: 'external-kafka-1',
        bookId: 'external-kafka-1',
        workId: null,
        externalId: 'gb1',
        title: 'The Trial',
        titleEn: 'The Trial',
        authorEn: 'Franz Kafka',
        resultType: 'external',
        workType: 'edition',
        editionPresence: 'edition',
        source: 'googleBooks',
        sourceClass: 'external_provider',
        rank: 2,
      }),
      buildResult({
        id: 'external-kafka-2',
        bookId: 'external-kafka-2',
        workId: null,
        externalId: 'ol1',
        title: 'The Trial',
        titleEn: 'The Trial',
        authorEn: 'Franz Kafka',
        resultType: 'external',
        workType: 'edition',
        editionPresence: 'edition',
        source: 'openLibrary',
        sourceClass: 'external_provider',
        rank: 3,
      }),
    ];

    const reranked = await rerankBookSearchResults('Kafka', results);

    expect(reranked.map((entry) => entry.id)).toEqual(['canonical-kafka']);
  });

  it('keeps canonical typo-tolerant title results ahead of external editions', async () => {
    const results = [
      buildResult({
        id: 'external-hp',
        bookId: 'external-hp',
        workId: null,
        externalId: 'gb-hp',
        title: 'Harry Potter and the Sorcerer\'s Stone',
        titleEn: 'Harry Potter and the Sorcerer\'s Stone',
        authorEn: 'J. K. Rowling',
        resultType: 'external',
        workType: 'edition',
        editionPresence: 'edition',
        source: 'googleBooks',
        sourceClass: 'external_provider',
        rank: 1,
      }),
      buildResult({
        id: 'canonical-hp',
        bookId: 'canonical-hp',
        workId: 'work-hp',
        title: 'Harry Potter and the Sorcerer\'s Stone',
        titleEn: 'Harry Potter and the Sorcerer\'s Stone',
        authorEn: 'J. K. Rowling',
        rank: 2,
      }),
    ];

    const reranked = await rerankBookSearchResults('harry potr', results);

    expect(reranked[0]?.id).toBe('canonical-hp');
  });
});
