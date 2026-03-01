// components/modals/AddBookModal.tsx

import React, { useRef, useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useBookSearch } from '../../lib/hooks/useBookSearch.ts';
import { useToggleBookOnShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import { useBookUpload } from '../../lib/hooks/useBookUpload.ts';
import { useQueryClient } from '../../lib/react-query.ts';
import { useToast } from '../../store/toast.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useAuth } from '../../lib/auth.tsx';
import { queryKeys } from '../../lib/queryKeys.ts';
import SearchResultCard from '../content/SearchResultCard.tsx';
import {
  buildBookDetailsParams,
  resolveIngestionSource,
} from '../../lib/books/searchNavigation.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { ensureCanonicalBook } from '../../lib/books/ensureCanonicalBook.ts';

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
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: searchResponse, isLoading: isSearching } = useBookSearch(searchQuery, {
    ebookOnly: false,
    lang,
    limit: 15,
  });
  const normalizedResults: SearchResultDTO[] = searchResponse?.results || [];
  const clickedRankFor = (id: string): number => {
    const index = normalizedResults.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : 1;
  };
  const { mutate: toggleBook } = useToggleBookOnShelf();
  const { mutateAsync: uploadUserBook } = useBookUpload();

  React.useEffect(() => {
    if (!isOpen || activeTab !== 'search') return;
    if (searchQuery.trim().length < 2) return;

    logBookEngineV2('BOOK_SEARCH_V2_SURFACE_ADD_TO_SHELF', {
      query: searchQuery.trim().slice(0, 80),
      resultCount: searchResponse?.results?.length || 0,
      isLoading: isSearching,
      targetShelfId: targetShelfId || null,
    });
  }, [
    activeTab,
    isOpen,
    isSearching,
    searchQuery,
    searchResponse?.results?.length,
    targetShelfId,
  ]);

  const targetShelf = targetShelfId
    ? shelves?.find((s) => s.id === targetShelfId)
    : null;
  const targetShelfDisplayName = targetShelfId === 'currently-reading'
    ? (lang === 'en' ? 'Currently Reading' : 'أقرأ حاليًا')
    : (targetShelf ? (lang === 'en' ? targetShelf.titleEn : targetShelf.titleAr) : '');

  const resolveUploadFileType = (file: File): 'epub' | 'pdf' | null => {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.epub')) return 'epub';
    if (lowerName.endsWith('.pdf')) return 'pdf';
    return null;
  };

  const resetUploadSelection = () => {
    setUploadFile(null);
    setUploadError(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const resolveCanonicalBookId = async (
    result: SearchResultDTO
  ): Promise<string | null> => {
    if (typeof result.bookId === 'string' && result.bookId.trim().length > 0) {
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

  /**
   * 🔒 Canonical ingest → add to shelf
   * In insertion mode, this is the PRIMARY action
   */
  const handleAdd = async (result: SearchResultDTO) => {
    if (!targetShelfId || busyId) return;

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

      if (result.resultType !== 'canonical') {
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
            pendingAction: 'ADD_TO_SHELF',
            pendingShelfId: targetShelfId,
            searchQuery: searchQuery.trim(),
            clickedRank: clickedRankFor(result.id),
            clickTracked: true,
          }),
        });
        onClose();
        return;
      }

      toggleBook(
        {
          shelfId: targetShelfId,
          bookId: result.bookId,
          book: {
            id: result.bookId,
            titleEn: result.titleEn || result.title,
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
      setBusyId(result.id);
      trackSearchClick({
        query: searchQuery,
        clickedRank: clickedRankFor(result.id),
        result: {
          ...result,
          bookId: result.bookId || result.externalId || result.id,
        },
      });
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
          searchQuery: searchQuery.trim(),
          clickedRank: clickedRankFor(result.id),
          clickTracked: true,
        }),
      });
    } catch (err) {
      console.error('[AddBookModal][OPEN_FAILED]', err);
    } finally {
      setBusyId(null);
    }
  };

  const mode: 'discovery' | 'insertion' =
    targetShelfId ? 'insertion' : 'discovery';

  const handleUploadFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setUploadFile(null);
      setUploadError(null);
      return;
    }

    const selectedType = resolveUploadFileType(selected);
    if (!selectedType) {
      setUploadFile(null);
      setUploadError(
        lang === 'en'
          ? 'Only EPUB and PDF files are supported.'
          : 'يدعم النظام ملفات EPUB و PDF فقط.'
      );
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      return;
    }

    if (selected.size > 25 * 1024 * 1024) {
      setUploadFile(null);
      setUploadError(
        lang === 'en'
          ? 'File must be 25MB or smaller.'
          : 'يجب أن يكون الملف بحجم 25MB أو أقل.'
      );
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      return;
    }

    setUploadFile(selected);
    setUploadError(null);
  };

  const handleUploadSubmit = async () => {
    if (isUploadBusy) return;

    if (!targetShelfId) {
      setUploadError(
        lang === 'en'
          ? 'Select a shelf before uploading.'
          : 'اختر رفًا قبل الرفع.'
      );
      return;
    }

    if (!uploadFile) {
      setUploadError(
        lang === 'en'
          ? 'Choose an EPUB or PDF file first.'
          : 'اختر ملف EPUB أو PDF أولاً.'
      );
      return;
    }

    const fileType = resolveUploadFileType(uploadFile);
    if (!fileType) {
      setUploadError(
        lang === 'en'
          ? 'Only EPUB and PDF files are supported.'
          : 'يدعم النظام ملفات EPUB و PDF فقط.'
      );
      return;
    }

    if (uploadFile.size > 25 * 1024 * 1024) {
      setUploadError(
        lang === 'en'
          ? 'File must be 25MB or smaller.'
          : 'يجب أن يكون الملف بحجم 25MB أو أقل.'
      );
      return;
    }

    try {
      setIsUploadBusy(true);
      setUploadError(null);

      const uploaded = await uploadUserBook({
        shelfId: targetShelfId,
        file: uploadFile,
      });

      if (!uploaded?.bookId) {
        throw new Error('UPLOAD_FAILED');
      }

      // Use the same shelf mutation pipeline as search-add for parity.
      toggleBook({
        shelfId: targetShelfId,
        bookId: uploaded.bookId,
        book: {
          id: uploaded.bookId,
          titleEn: uploadFile.name.replace(/\.[^.]+$/, ''),
          titleAr: uploadFile.name.replace(/\.[^.]+$/, ''),
          authorEn: 'Unknown',
          authorAr: '',
          coverUrl: '',
        } as any,
      });

      if (effectiveUid) {
        queryClient.setQueryData(
          queryKeys.catalog.book(uploaded.bookId) as unknown as any[],
          {
            id: uploaded.bookId,
            authorId: '',
            titleEn: uploadFile.name.replace(/\.[^.]+$/, ''),
            titleAr: uploadFile.name.replace(/\.[^.]+$/, ''),
            authorEn: '',
            authorAr: '',
            coverUrl: '',
            descriptionEn: '',
            descriptionAr: '',
            genresEn: [],
            genresAr: [],
            rating: 0,
            ratingsCount: 0,
            isEbookAvailable: true,
          } as any
        );

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
          queryClient.invalidateQueries({
            queryKey: queryKeys.catalog.book(uploaded.bookId) as unknown as any[],
          }),
        ]);
      }

      showToast(
        lang === 'en'
          ? `Uploaded to ${targetShelfDisplayName}`
          : `تم رفع الكتاب إلى ${targetShelfDisplayName}`
      );

      resetUploadSelection();
      onClose();
    } catch (error) {
      console.error('[AddBookModal][UPLOAD_FAILED]', error);
      setUploadError(
        lang === 'en'
          ? 'Book upload failed. Please try again.'
          : 'فشل رفع الكتاب. يرجى المحاولة مرة أخرى.'
      );
      showToast(
        lang === 'en'
          ? 'Book upload failed. Please try again.'
          : 'فشل رفع الكتاب. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsUploadBusy(false);
    }
  };

  const handleUploadPrimaryAction = async () => {
    if (isUploadBusy) return;

    if (!uploadFile) {
      uploadInputRef.current?.click();
      return;
    }

    await handleUploadSubmit();
  };

  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(sizeInBytes / 1024))} KB`;
    }
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
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
                    key={result.id}
                    result={result}
                    lang={lang}
                    mode={mode}
                    isBusy={busyId === result.id}
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

            <div className="flex items-center justify-center">
              <div className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                {lang === 'en'
                  ? `Adding to: ${targetShelfDisplayName || 'Selected Shelf'}`
                  : `الإضافة إلى: ${targetShelfDisplayName || 'الرف المحدد'}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={isUploadBusy}
              className="w-full rounded-lg border border-white/10 bg-black/10 p-4 text-left transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <BilingualText role="Caption" className="mb-2">
                {lang === 'en'
                  ? 'Select an EPUB or PDF file (max 25MB).'
                  : 'اختر ملف EPUB أو PDF (بحد أقصى 25MB).'}
              </BilingualText>

              <BilingualText className="text-slate-200">
                {uploadFile
                  ? uploadFile.name
                  : (lang === 'en' ? 'No file selected.' : 'لم يتم اختيار ملف.')}
              </BilingualText>

              {uploadFile && (
                <BilingualText role="Caption" className="mt-1 text-slate-400">
                  {`${uploadFile.name.toLowerCase().endsWith('.epub') ? 'EPUB' : 'PDF'}  •  ${formatFileSize(uploadFile.size)}  •  ${lang === 'en' ? 'Tap to change' : 'اضغط للتغيير'}`}
                </BilingualText>
              )}
            </button>

            {uploadError && (
              <BilingualText role="Caption" className="text-center text-red-400">
                {uploadError}
              </BilingualText>
            )}

            <div className="flex items-center justify-center">
              <Button
                variant="primary"
                onClick={handleUploadPrimaryAction}
                disabled={isUploadBusy || !targetShelfId}
                className="min-w-[220px]"
              >
                {isUploadBusy
                  ? (lang === 'en' ? 'Uploading...' : 'جارٍ الرفع...')
                  : uploadFile
                    ? (lang === 'en'
                      ? `Upload to ${targetShelfDisplayName || 'Shelf'}`
                      : `رفع إلى ${targetShelfDisplayName || 'الرف'}`)
                    : (lang === 'en' ? 'Choose File' : 'اختر ملفًا')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AddBookModal;
