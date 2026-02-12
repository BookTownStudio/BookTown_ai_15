// components/modals/AddBookModal.tsx

import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useLiveBookSearch } from '../../lib/hooks/useLiveBookSearch.ts';
import { useToggleBookOnShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import { useBookIngestion } from '../../lib/hooks/useBookIngestion.ts';
import { useToast } from '../../store/toast.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import SearchResultCard, {
  SearchResultDTO
} from '../content/SearchResultCard.tsx';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetShelfId?: string | null;
}

const AddBookModal: React.FC<AddBookModalProps> = ({
  isOpen,
  onClose,
  targetShelfId
}) => {
  const { lang } = useI18n();
  const { navigate, currentView } = useNavigation();
  const { showToast } = useToast();
  const { data: shelves } = useUserShelves();

  const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: searchResults, isLoading: isSearching } =
    useLiveBookSearch(searchQuery, false);

  const { mutateAsync: ingestBook } = useBookIngestion();
  const { mutate: toggleBook } = useToggleBookOnShelf();

  /**
   * 🔒 Canonical ingest → add to shelf
   * In insertion mode, this is the PRIMARY action
   */
  const handleAdd = async (result: SearchResultDTO) => {
    if (!targetShelfId || busyId) return;

    try {
      setBusyId(result.externalId);

      const res = await ingestBook({
        bookId: result.externalId,
        source: result.source,
        rawBook: result
      });

      const canonicalId = res?.bookId;
      if (!canonicalId) throw new Error('No canonical ID returned');

      toggleBook(
        {
          shelfId: targetShelfId,
          bookId: canonicalId,
          book: {
            id: canonicalId,
            titleEn: result.titleEn,
            titleAr: result.titleAr,
            authorEn: result.authorEn,
            authorAr: result.authorAr,
            coverUrl: result.coverUrl
          } as any
        },
        {
          onSuccess: () => {
            const shelf = shelves?.find(s => s.id === targetShelfId);
            const shelfName = shelf ? (lang === 'en' ? shelf.titleEn : shelf.titleAr) : '';
            const displayName = targetShelfId === 'currently-reading'
              ? (lang === 'en' ? 'Currently Reading' : 'أقرأ حاليًا')
              : shelfName;

            showToast(lang === 'en' ? `Added to ${displayName}` : `تمت الإضافة إلى ${displayName}`);
            onClose();
          }
        }
      );
    } catch (err) {
      console.error('[AddBookModal][INGEST_FAILED]', err);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * 🔒 Canonical ingest → open details
   * Always available via explicit icon
   */
  const handleOpen = async (result: SearchResultDTO) => {
    if (busyId) return;

    try {
      setBusyId(result.externalId);

      const res = await ingestBook({
        bookId: result.externalId,
        source: result.source,
        rawBook: result
      });

      const canonicalId = res?.bookId;
      if (!canonicalId) throw new Error('No canonical ID returned');

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: { bookId: canonicalId, from: currentView }
      });
    } catch (err) {
      console.error('[AddBookModal][OPEN_FAILED]', err);
    } finally {
      setBusyId(null);
    }
  };

  const normalizedResults: SearchResultDTO[] =
    (searchResults || []).map((b: any) => ({
      externalId: b.id,
      source:
        b.source ||
        (b.id?.startsWith('gb_') ? 'googleBooks' : 'openLibrary'),
      titleEn: b.titleEn || b.title,
      titleAr: b.titleAr,
      authorEn: b.authorEn || b.author,
      authorAr: b.authorAr,
      coverUrl: b.coverUrl,
      isEbookAvailable: b.isEbookAvailable
    }));

  const mode: 'discovery' | 'insertion' =
    targetShelfId ? 'insertion' : 'discovery';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busyId) onClose();
      }}
    >
      <div className="w-full max-w-lg">
        <BilingualText role="H1" className="!text-xl text-center mb-4">
          {lang === 'en' ? 'Add Book to Shelf' : 'إضافة كتاب إلى الرف'}
        </BilingualText>

        <div className="flex items-center justify-center border-b border-black/10 dark:border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-4 font-semibold border-b-2 ${
              activeTab === 'search'
                ? 'text-accent border-accent'
                : 'border-transparent text-slate-500'
            }`}
          >
            {lang === 'en' ? 'Search' : 'بحث'}
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-2 px-4 font-semibold border-b-2 ${
              activeTab === 'upload'
                ? 'text-accent border-accent'
                : 'border-transparent text-slate-500'
            }`}
          >
            {lang === 'en' ? 'Upload' : 'رفع'}
          </button>
        </div>

        {activeTab === 'search' && (
          <div>
            <InputField
              id="book-search"
              label=""
              type="search"
              placeholder={
                lang === 'en'
                  ? 'Search by title or author...'
                  : 'ابحث بالعنوان أو المؤلف...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <BilingualText role="Caption" className="text-center mt-2">
              {lang === 'en'
                ? 'Enter at least 2 characters to begin search.'
                : 'أدخل حرفين على الأقل لبدء البحث.'}
            </BilingualText>

            <div className="mt-4 space-y-3">
              {isSearching && (
                <div className="flex justify-center pt-8">
                  <LoadingSpinner />
                </div>
              )}

              {!isSearching &&
                searchQuery.length > 1 &&
                normalizedResults.length === 0 && (
                  <BilingualText className="text-center pt-8 text-slate-500">
                    {lang === 'en'
                      ? 'No results found.'
                      : 'لم يتم العثور على نتائج.'}
                  </BilingualText>
                )}

              {!isSearching &&
                normalizedResults.map((result) => (
                  <SearchResultCard
                    key={result.externalId}
                    result={result}
                    lang={lang}
                    mode={mode}
                    isBusy={busyId === result.externalId}
                    onAdd={handleAdd}
                    onOpen={handleOpen}
                  />
                ))}
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="text-center py-16 text-slate-500">
            <BilingualText>
              {lang === 'en'
                ? 'Upload functionality coming soon.'
                : 'ميزة الرفع ستتوفر قريبًا.'}
            </BilingualText>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AddBookModal;
