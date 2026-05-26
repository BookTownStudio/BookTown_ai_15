// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchResultCard from './SearchResultCard.tsx';
import type { SearchResultDTO } from '../../types/bookSearch.ts';
import { I18nProvider } from '../../store/i18n.tsx';

const hookMocks = vi.hoisted(() => ({
  useBookCatalog: vi.fn(),
  useReaderProgress: vi.fn(),
  useBookEditions: vi.fn(),
}));

vi.mock('../../lib/hooks/useBookCatalog.ts', () => ({
  useBookCatalog: hookMocks.useBookCatalog,
}));

vi.mock('../../lib/hooks/useReaderProgress.ts', () => ({
  useReaderProgress: hookMocks.useReaderProgress,
}));

vi.mock('../../lib/hooks/useBookEditions.ts', () => ({
  useBookEditions: hookMocks.useBookEditions,
}));

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

describe('SearchResultCard', () => {
  beforeEach(() => {
    hookMocks.useBookCatalog.mockReturnValue({ data: null });
    hookMocks.useReaderProgress.mockReturnValue({ progress: null });
    hookMocks.useBookEditions.mockReturnValue({ data: [], isLoading: false });
  });

  it('uses readerAuthority for Read and reading_progress for Continue', () => {
    const onRead = vi.fn();
    const { rerender } = render(
      <I18nProvider>
        <SearchResultCard
          result={buildResult({
            available: true,
            acquired: false,
            readAccess: 'trusted_external',
            readProvider: 'openLibrary',
            ebookClass: 'external_link',
          })}
          lang="en"
          onRead={onRead}
        />
      </I18nProvider>
    );

    expect(screen.getByRole('button', { name: 'Get' })).toBeTruthy();

    hookMocks.useBookCatalog.mockReturnValue({
      data: {
        readerAuthority: {
          hasReadableAttachment: true,
        },
      },
    });

    rerender(
      <I18nProvider>
        <SearchResultCard
          result={buildResult({
            available: true,
            acquired: true,
            readAccess: 'in_app',
            readProvider: 'booktown',
            ebookClass: 'in_app',
            hasEbook: true,
            downloadable: true,
            isEbookAvailable: true,
          })}
          lang="en"
          onRead={onRead}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(onRead).toHaveBeenCalledTimes(1);

    hookMocks.useReaderProgress.mockReturnValue({
      progress: {
        exists: true,
        bookId: 'book_1',
        progress: 0.2,
        status_state: 'reading',
        lastPosition: null,
      },
    });

    rerender(
      <I18nProvider>
        <SearchResultCard
          result={buildResult()}
          lang="en"
          onRead={onRead}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onRead).toHaveBeenCalledTimes(2);
  });
});
