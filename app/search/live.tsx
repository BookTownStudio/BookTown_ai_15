// app/search/live.tsx

import React, { useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useLiveBookSearch } from '../../lib/hooks/useLiveBookSearch.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { MicIcon } from '../../components/icons/MicIcon.tsx';
import { CameraIcon } from '../../components/icons/CameraIcon.tsx';
import { useToast } from '../../store/toast.tsx';
import { useSearchHistory } from '../../lib/hooks/useSearchHistory.ts';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { useIdentifyBook } from '../../lib/hooks/useAiMutations.ts';
import { useBookIngestion } from '../../lib/hooks/useBookIngestion.ts';
import SearchResultCard, {
  SearchResultDTO
} from '../../components/content/SearchResultCard.tsx';

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

const LiveSearchScreen: React.FC = () => {
  const { navigate, currentView } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);

  const { history, addToHistory } = useSearchHistory();
  const { mutateAsync: ingestBook } = useBookIngestion();
  const { data: results, isLoading } = useLiveBookSearch(query, false);
  const { mutate: identifyBook, isLoading: isAnalyzingImage } =
    useIdentifyBook();

  /**
   * 🔒 Canonical open flow (FIXED)
   */
  const handleOpenResult = async (result: SearchResultDTO) => {
    if (busyId) return;

    try {
      setBusyId(result.externalId);

      const res = await ingestBook({
        bookId: result.externalId,
        source: result.source,
        rawBook: result.rawBook ?? result
      });

      const canonicalId =
        res?.editionId ||
        res?.bookId;

      if (!canonicalId) {
        throw new Error('Ingestion did not return canonical identifier');
      }

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: { bookId: canonicalId, from: currentView }
      });
    } catch (err) {
      console.error('[LIVE_SEARCH][INGEST_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Failed to open book.'
          : 'فشل فتح الكتاب.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleAddResult = async (result: SearchResultDTO) => {
    if (busyId) return;

    try {
      setBusyId(result.externalId);

      const res = await ingestBook({
        bookId: result.externalId,
        source: result.source,
        rawBook: result.rawBook ?? result
      });

      const canonicalId = res?.editionId || res?.bookId;
      if (!canonicalId) {
        throw new Error('Ingestion did not return canonical identifier');
      }

      showToast(
        lang === 'en'
          ? 'Book added to your library.'
          : 'تمت إضافة الكتاب إلى مكتبتك.'
      );
    } catch (err) {
      console.error('[LIVE_SEARCH][INGEST_ADD_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Failed to add book.'
          : 'فشل إضافة الكتاب.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const validResults: SearchResultDTO[] =
    (results || [])
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
          rawBook: b
        } as SearchResultDTO;
      })
      .filter((item): item is SearchResultDTO => item !== null);

  return (
    <div className="h-screen w-full flex flex-col bg-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur border-b border-white/10">
        <div className="container mx-auto flex h-20 items-center gap-2 px-4">
          <Button
            variant="ghost"
            onClick={() => navigate({ type: 'tab', id: 'home' })}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </Button>

          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addToHistory(query)}
            placeholder={lang === 'en' ? 'Search books…' : 'ابحث عن كتاب…'}
            className="flex-grow bg-slate-800 rounded-2xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-accent"
          />

          <Button variant="icon" onClick={() => setIsMicModalOpen(true)}>
            <MicIcon />
          </Button>
          <Button variant="icon" onClick={() => setIsCameraOpen(true)}>
            <CameraIcon />
          </Button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-4">
        {(isLoading || isAnalyzingImage) && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && validResults.length > 0 && (
          <div className="space-y-3">
            {validResults.map(r => (
              <SearchResultCard
                key={r.externalId}
                result={r}
                lang={lang}
                isBusy={busyId === r.externalId}
                onOpen={handleOpenResult}
                onAdd={handleAddResult}
              />
            ))}
          </div>
        )}

        {!isLoading && query && validResults.length === 0 && (
          <BilingualText className="text-center text-white/60 mt-12">
            {lang === 'en' ? 'No results found.' : 'لا توجد نتائج.'}
          </BilingualText>
        )}
      </main>

      {isCameraOpen && (
        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={img =>
            identifyBook(img, {
              onSuccess: text => text && setQuery(text)
            })
          }
        />
      )}

      {isMicModalOpen && (
        <VoiceSearchModal
          isOpen={isMicModalOpen}
          onClose={() => setIsMicModalOpen(false)}
          onResult={text => {
            setQuery(text);
            addToHistory(text);
            setIsMicModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default LiveSearchScreen;
