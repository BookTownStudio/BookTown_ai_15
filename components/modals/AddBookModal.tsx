// components/modals/AddBookModal.tsx

import React, { useRef, useState } from 'react';
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
import { useBookUpload } from '../../lib/hooks/useBookUpload.ts';
import { useQueryClient } from '../../lib/react-query.ts';
import { useToast } from '../../store/toast.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useAuth } from '../../lib/auth.tsx';
import { queryKeys } from '../../lib/queryKeys.ts';
import SearchResultCard, {
  SearchResultDTO
} from '../content/SearchResultCard.tsx';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetShelfId?: string | null;
}

const normalizeIngestionSource = (
  source: unknown,
  externalId: string
): 'googleBooks' | 'openLibrary' => {
  const value = String(source || '').trim();

  if (
    value === 'googleBooks' ||
    value === 'google_books' ||
    value === 'googlebooks' ||
    value === 'GOOGLE_BOOKS'
  ) {
    return 'googleBooks';
  }

  if (
    value === 'openLibrary' ||
    value === 'open_library' ||
    value === 'openlibrary' ||
    value === 'OPEN_LIBRARY'
  ) {
    return 'openLibrary';
  }

  return externalId.startsWith('gb_') ? 'googleBooks' : 'openLibrary';
};

const AddBookModal: React.FC<AddBookModalProps> = ({
  isOpen,
  onClose,
  targetShelfId
}) => {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const { navigate, currentView } = useNavigation();
  const { showToast } = useToast();
  const { data: shelves } = useUserShelves();

  const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadBusy, setIsUploadBusy] = useState(false);

  const { data: searchResults, isLoading: isSearching } =
    useLiveBookSearch(searchQuery, false);

  const { mutateAsync: ingestBook } = useBookIngestion();
  const { mutate: toggleBook } = useToggleBookOnShelf();
  const { mutateAsync: uploadUserBook } = useBookUpload();

  const resolveUploadFileType = (file: File): 'epub' | 'pdf' | null => {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.epub')) return 'epub';
    if (lowerName.endsWith('.pdf')) return 'pdf';
    return null;
  };

  const resetUploadSelection = () => {
    setUploadFile(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

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
        rawBook: result.rawBook ?? result
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
        rawBook: result.rawBook ?? result
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
    (searchResults || [])
      .map((b: any) => {
        const externalId = b.id || b.editionId || b.bookId;
        if (!externalId || typeof externalId !== 'string') return null;

        return {
          externalId,
          source: normalizeIngestionSource(b.source, externalId),
          titleEn: b.titleEn || b.title,
          titleAr: b.titleAr,
          authorEn: b.authorEn || b.author,
          authorAr: b.authorAr,
          coverUrl: b.coverUrl,
          isEbookAvailable: b.isEbookAvailable,
          rawBook: b
        } as SearchResultDTO;
      })
      .filter((item): item is SearchResultDTO => item !== null);

  const mode: 'discovery' | 'insertion' =
    targetShelfId ? 'insertion' : 'discovery';

  const handleUploadFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = event.target.files?.[0] ?? null;
    setUploadFile(selected);
  };

  const handleUploadSubmit = async () => {
    if (isUploadBusy) return;

    if (!targetShelfId) {
      showToast(
        lang === 'en'
          ? 'Select a shelf before uploading.'
          : 'اختر رفًا قبل الرفع.'
      );
      return;
    }

    if (!uploadFile) {
      showToast(
        lang === 'en'
          ? 'Choose an EPUB or PDF file first.'
          : 'اختر ملف EPUB أو PDF أولاً.'
      );
      return;
    }

    const fileType = resolveUploadFileType(uploadFile);
    if (!fileType) {
      showToast(
        lang === 'en'
          ? 'Only EPUB and PDF files are supported.'
          : 'يدعم النظام ملفات EPUB و PDF فقط.'
      );
      return;
    }

    if (uploadFile.size > 25 * 1024 * 1024) {
      showToast(
        lang === 'en'
          ? 'File must be 25MB or smaller.'
          : 'يجب أن يكون الملف بحجم 25MB أو أقل.'
      );
      return;
    }

    try {
      setIsUploadBusy(true);

      const uploaded = await uploadUserBook({
        shelfId: targetShelfId,
        fileName: uploadFile.name,
        fileType,
        fileSize: uploadFile.size,
      });

      if (!uploaded?.bookId) {
        throw new Error('UPLOAD_FAILED');
      }

      if (effectiveUid) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.user.shelves(effectiveUid) as unknown as any[],
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.user.shelfEntries(
              effectiveUid,
              targetShelfId
            ) as unknown as any[],
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.user.shelfDetails(
              effectiveUid,
              targetShelfId
            ) as unknown as any[],
          }),
        ]);
      }

      const shelf = shelves?.find(s => s.id === targetShelfId);
      const shelfName = shelf ? (lang === 'en' ? shelf.titleEn : shelf.titleAr) : '';
      const displayName = targetShelfId === 'currently-reading'
        ? (lang === 'en' ? 'Currently Reading' : 'أقرأ حاليًا')
        : shelfName;

      showToast(
        lang === 'en'
          ? `Uploaded to ${displayName}`
          : `تم رفع الكتاب إلى ${displayName}`
      );

      resetUploadSelection();
      onClose();
    } catch (error) {
      console.error('[AddBookModal][UPLOAD_FAILED]', error);
      showToast(
        lang === 'en'
          ? 'Book upload failed. Please try again.'
          : 'فشل رفع الكتاب. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsUploadBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busyId && !isUploadBusy) onClose();
      }}
    >
      <div className="w-full max-w-lg">
        <BilingualText role="H1" className="!text-xl text-center mb-4">
          {lang === 'en' ? 'Add Book to Shelf' : 'إضافة كتاب إلى الرف'}
        </BilingualText>

        <div className="flex items-center justify-center border-b border-black/10 dark:border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('search')}
            disabled={isUploadBusy}
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
            disabled={isUploadBusy}
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
          <div className="space-y-4 py-6">
            <input
              ref={uploadInputRef}
              type="file"
              accept=".epub,.pdf,application/epub+zip,application/pdf"
              className="hidden"
              onChange={handleUploadFileChange}
            />

            <div className="rounded-lg border border-white/10 bg-black/10 p-4 text-center">
              <BilingualText role="Caption" className="mb-2">
                {lang === 'en'
                  ? 'Select an EPUB or PDF file (max 25MB).'
                  : 'اختر ملف EPUB أو PDF (بحد أقصى 25MB).'}
              </BilingualText>

              <BilingualText className="text-slate-300">
                {uploadFile
                  ? uploadFile.name
                  : (lang === 'en' ? 'No file selected.' : 'لم يتم اختيار ملف.')}
              </BilingualText>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => uploadInputRef.current?.click()}
                disabled={isUploadBusy}
              >
                {lang === 'en' ? 'Choose File' : 'اختر ملفًا'}
              </Button>
              <Button
                variant="primary"
                onClick={handleUploadSubmit}
                disabled={!uploadFile || isUploadBusy}
              >
                {isUploadBusy
                  ? (lang === 'en' ? 'Uploading...' : 'جارٍ الرفع...')
                  : (lang === 'en' ? 'Upload Book' : 'رفع الكتاب')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AddBookModal;
