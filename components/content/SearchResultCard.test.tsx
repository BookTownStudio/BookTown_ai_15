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
  it('removes search-level Read/Get CTAs while preserving card open and add actions', () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    const onRead = vi.fn();
    render(
      <I18nProvider>
        <SearchResultCard
          result={buildResult({
            available: true,
            acquired: true,
            readAccess: 'in_app',
            readProvider: 'booktown',
            ebookClass: 'in_app',
            readerAuthority: {
              hasReadableAttachment: true,
            },
            readingProgressProjection: {
              exists: true,
              bookId: 'book_1',
              progress: 0.2,
              status_state: 'reading',
              lastPosition: null,
            },
          })}
          lang="en"
          onOpen={onOpen}
          onAdd={onAdd}
          onRead={onRead}
        />
      </I18nProvider>
    );

    expect(screen.queryByRole('button', { name: 'Get' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Add book'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRead).not.toHaveBeenCalled();
  });
});
