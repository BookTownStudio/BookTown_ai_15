// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SearchResultCard from './SearchResultCard.tsx';
import type { SearchResultDTO } from '../../types/bookSearch.ts';
import { I18nProvider } from '../../store/i18n.tsx';

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
  it('shows the read eye only after the result is acquired', () => {
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

    expect(screen.queryByLabelText('Read ebook')).toBeNull();

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

    fireEvent.click(screen.getByLabelText('Read ebook'));
    expect(onRead).toHaveBeenCalledTimes(1);
  });
});
