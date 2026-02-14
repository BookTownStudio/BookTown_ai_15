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
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: searchResults, isLoading: isSearching } =
    useLiveBookSearch(searchQuery, false);

  const { mutateAsync: ingestBook } = useBookIngestion();
  const { mutate: toggleBook } = useToggleBookOnShelf();
  const { mutateAsync: uploadUserBook } = useBookUpload();

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
