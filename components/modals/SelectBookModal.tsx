// components/modals/SelectBookModal.tsx

import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import { useNavigation } from '../../store/navigation.tsx';

import { useBookSearch } from '../../lib/hooks/useBookSearch.ts';
import {
  buildBookDetailsParams,
  resolveIngestionSource,
} from '../../lib/books/searchNavigation.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { ensureCanonicalBook } from '../../lib/books/ensureCanonicalBook.ts';

import { Book } from '../../types/entities.ts';
import SearchResultCard from '../content/SearchResultCard.tsx';
import { SearchResultDTO } from '../../types/bookSearch.ts';

interface SelectBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookSelect: (book: Book) => void;
}

const SelectBookModal: React.FC<SelectBookModalProps> = ({
  isOpen,
  onClose,
  onBookSelect
}) => {
  const { lang } = useI18n();
  const { showToast } = useToast();
  const { navigate, currentView } = useNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: searchResponse, isLoading: isSearching, error: searchError } = useBookSearch(searchQuery, {
    ebookOnly: false,
    lang,
    limit: 15,
  });
  const searchResults: SearchResultDTO[] = searchResponse?.results || [];
  const clickedRankFor = (id: string): number => {
    const index = searchResults.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : 1;
  };

  React.useEffect(() => {
    if (!isOpen) return;
    if (searchQuery.trim().length < 2) return;

    logBookEngineV2('BOOK_SEARCH_V2_SURFACE_ATTACH_BOOK', {
      query: searchQuery.trim().slice(0, 80),
      resultCount: searchResponse?.results?.length || 0,
      isLoading: isSearching,
    });
  }, [isOpen, isSearching, searchQuery, searchResponse?.results?.length]);

  const mapResultToBook = (result: SearchResultDTO): Book => ({
    id: result.bookId,
    authorId: '',
    titleEn: result.titleEn || result.title,
    titleAr: result.titleAr || '',
    authorEn: result.authorEn || '',
    authorAr: result.authorAr || '',
    coverUrl: result.coverUrl || '',
    descriptionEn: result.descriptionEn || result.description || '',
    descriptionAr: result.descriptionAr || '',
    genresEn: [],
    genresAr: [],
    rating: 0,
    ratingsCount: 0,
    isEbookAvailable: result.isEbookAvailable,
  });

  const resolveCanonicalBookId = async (
    result: SearchResultDTO
  ): Promise<string | null> => {
    if (
      result.resultType === 'canonical' &&
      typeof result.bookId === 'string' &&
      result.bookId.trim().length > 0
    ) {
      return result.bookId.trim();
    }

    const source = resolveIngestionSource(result);
    if (!source) return null;

    const resolved = await ensureCanonicalBook({
      providerExternalId: result.externalId || result.id,
      source,
      rawBook: result.rawBook || {
        id: result.externalId || result.id,
        externalId: result.externalId || result.id,
        source,
        title: result.title,
        titleEn: result.titleEn,
        titleAr: result.titleAr,
        authors: result.authors,
        authorEn: result.authorEn,
        authorAr: result.authorAr,
        description: result.description,
        descriptionEn: result.descriptionEn,
        descriptionAr: result.descriptionAr,
      },
    });

    return resolved?.canonicalBookId || null;
  };
  const searchErrorMessage =
    searchError instanceof Error && searchError.message.trim().length > 0
      ? searchError.message
      : lang === 'en'
      ? 'Search is temporarily unavailable.'
      : 'البحث غير متاح مؤقتاً.';

  const handleSelect = async (result: SearchResultDTO) => {
    if (busyId) return;
    try {
      setBusyId(result.id);
      trackSearchClick({
        query: searchQuery,
        clickedRank: clickedRankFor(result.id),
        result: {
          ...result,
          bookId: result.bookId || result.externalId || result.id,
        },
      });

      if (result.resultType === 'canonical') {
        onBookSelect(mapResultToBook(result));
        onClose();
        return;
      }
      const canonicalBookId = await resolveCanonicalBookId(result);
      if (!canonicalBookId) {
        showToast(
          lang === 'en'
            ? 'This book is unavailable right now.'
            : 'هذا الكتاب غير متاح حالياً.'
        );
        return;
      }
      const canonicalNavResult: SearchResultDTO = {
        ...result,
        resultType: 'canonical',
        bookId: canonicalBookId,
      };

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: buildBookDetailsParams(canonicalNavResult, currentView, {
          pendingAction: 'ATTACH_TO_POST',
          searchQuery: searchQuery.trim(),
          clickedRank: clickedRankFor(result.id),
          clickTracked: true,
        }),
      });
      onClose();
    } catch (err) {
      console.error('[SelectBookModal][SELECT_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Something went wrong'
          : 'حدث خطأ غير متوقع'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg">
        <BilingualText role="H1" className="!text-xl text-center mb-4">
          {lang === 'en' ? 'Attach a Book' : 'إرفاق كتاب'}
        </BilingualText>

        <InputField
          id="book-search-modal"
          label=""
          type="search"
          placeholder={
            lang === 'en'
              ? 'Search by title or author...'
              : 'ابحث بالعنوان أو المؤلف...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />

        <div className="mt-4 space-y-2">
          {(isSearching || busyId !== null) && (
            <div className="flex justify-center pt-8">
              <LoadingSpinner />
            </div>
          )}

          {!isSearching && searchError && (
            <BilingualText className="text-center pt-8 text-red-400">
              {searchErrorMessage}
            </BilingualText>
          )}

          {!isSearching &&
            !searchError &&
            searchQuery.length > 1 &&
            (!searchResponse?.results || searchResponse.results.length === 0) && (
              <BilingualText className="text-center pt-8 text-slate-500">
                {lang === 'en'
                  ? 'No results found.'
                  : 'لم يتم العثور على نتائج.'}
              </BilingualText>
            )}

          {!isSearching &&
            !searchError &&
            searchResponse?.results &&
            searchResponse.results.map((result) => (
              <SearchResultCard
                key={result.id}
                result={result}
                lang={lang}
                onAdd={() => handleSelect(result)}
                onOpen={() => handleSelect(result)}
                isBusy={busyId === result.id}
              />
            ))}
        </div>
      </div>
    </Modal>
  );
};

export default SelectBookModal;
