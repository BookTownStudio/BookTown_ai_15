// components/modals/SelectBookModal.tsx

import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';

import { useLiveBookSearch } from '../../lib/hooks/useLiveBookSearch.ts';
import { useBookIngestion } from '../../lib/hooks/useBookIngestion.ts';

import { Book } from '../../types/entities.ts';
import SearchResultCard from '../content/SearchResultCard.tsx';

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

  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: searchResults,
    isLoading: isSearching
  } = useLiveBookSearch(searchQuery, false);

  const {
    mutateAsync: ingestBook,
    isPending: isIngesting
  } = useBookIngestion();

  const handleSelect = async (externalBook: Book) => {
    try {
      const res = await ingestBook({
        bookId: externalBook.id,
        // FIX: 'source' property does not exist on 'Book' type. Infer source from ID prefix for ingestion.
        source: (externalBook.id.startsWith('gb_') ? 'googleBooks' : 'openLibrary') as 'googleBooks' | 'openLibrary',
        rawBook: externalBook
      });

      if (!res?.bookId) {
        showToast(
          lang === 'en'
            ? 'Failed to attach book'
            : 'فشل إرفاق الكتاب'
        );
        return;
      }

      // Pass the updated book object to the parent
      onBookSelect({ ...externalBook, id: res.bookId });
      onClose();
    } catch (err) {
      console.error('[SelectBookModal][INGEST_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Something went wrong'
          : 'حدث خطأ غير متوقع'
      );
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
          {(isSearching || isIngesting) && (
            <div className="flex justify-center pt-8">
              <LoadingSpinner />
            </div>
          )}

          {!isSearching &&
            searchQuery.length > 1 &&
            (!searchResults || searchResults.length === 0) && (
              <BilingualText className="text-center pt-8 text-slate-500">
                {lang === 'en'
                  ? 'No results found.'
                  : 'لم يتم العثور على نتائج.'}
              </BilingualText>
            )}

          {!isSearching &&
            searchResults &&
            searchResults.map((book) => (
              <SearchResultCard
                key={book.id}
                result={{
                  externalId: book.id,
                  // FIX: 'source' property does not exist on 'Book' type. Infer source from ID prefix for SearchResultDTO compatibility.
                  source: (book.id.startsWith('gb_') ? 'googleBooks' : 'openLibrary') as 'googleBooks' | 'openLibrary',
                  titleEn: book.titleEn,
                  titleAr: book.titleAr,
                  authorEn: book.authorEn,
                  authorAr: book.authorAr,
                  coverUrl: book.coverUrl,
                  rawBook: book
                }}
                lang={lang}
                onAdd={() => handleSelect(book)}
                onOpen={() => handleSelect(book)}
                isBusy={isIngesting}
              />
            ))}
        </div>
      </div>
    </Modal>
  );
};

export default SelectBookModal;
