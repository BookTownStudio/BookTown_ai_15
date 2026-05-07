// app/search/live.tsx

import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
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
import SearchResultCard from '../../components/content/SearchResultCard.tsx';
import { buildBookDetailsParams } from '../../lib/books/searchNavigation.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { useUnifiedBookSearch } from '../../lib/hooks/useUnifiedBookSearch.ts';
import UnifiedSearchFilterToggle from '../../components/content/UnifiedSearchFilterToggle.tsx';
import {
  acquireExternalEbookForRead,
  buildAcquireExternalReadParams,
} from '../../lib/books/acquireExternalEbookForRead.ts';

const LiveSearchScreen: React.FC = () => {
  const { navigate, currentView } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);

  const { history, addToHistory } = useSearchHistory();
  const {
    data: searchResponse,
    isLoading,
    error: searchError,
    ebookOnly,
    toggleEbookOnly,
  } = useUnifiedBookSearch(query);
  const validResults: SearchResultDTO[] = searchResponse?.results || [];
  const searchErrorMessage =
    searchError instanceof Error && searchError.message.trim().length > 0
      ? searchError.message
      : lang === 'en'
      ? 'Search is temporarily unavailable.'
      : 'البحث غير متاح مؤقتاً.';
  const clickedRankFor = (id: string): number => {
    const index = validResults.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : 1;
  };
  const { mutate: identifyBook, isPending: isAnalyzingImage } =
    useIdentifyBook();

  /**
   * 🔒 Canonical open flow (FIXED)
   */
  const handleOpenResult = async (result: SearchResultDTO) => {
    if (busyId) return;

    try {
      setBusyId(result.id);
      trackSearchClick({
        query,
        clickedRank: clickedRankFor(result.id),
        result: {
          ...result,
          bookId: result.bookId || result.externalId || result.id,
        },
      });

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: buildBookDetailsParams(result, currentView, {
          autoAcquireOnOpen: ebookOnly && result.available && !result.acquired,
          searchQuery: query.trim(),
          clickedRank: clickedRankFor(result.id),
          clickTracked: true,
        }),
      });
    } catch (err) {
      console.error('[LIVE_SEARCH][OPEN_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Failed to open book.'
          : 'فشل فتح الكتاب.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReadResult = async (result: SearchResultDTO) => {
    if (busyId || result.ebookClass === 'unavailable') return;

    try {
      const acquisitionParams = buildAcquireExternalReadParams(result);
      if (!acquisitionParams) {
        throw new Error('INVALID_ACQUISITION_PARAMS');
      }

      setBusyId(result.id);
      showToast(lang === 'en' ? 'Preparing your copy...' : 'جارٍ تجهيز نسختك...');
      trackSearchClick({
        query,
        clickedRank: clickedRankFor(result.id),
        result: {
          ...result,
          bookId: result.bookId || result.externalId || result.id,
        },
      });
      const acquired = await acquireExternalEbookForRead(acquisitionParams);
      navigate({
        type: 'immersive',
        id: 'reader',
        params: {
          bookId: acquired.bookId,
          from: currentView,
        },
      });
    } catch (err) {
      console.error('[LIVE_SEARCH][READ_OPEN_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'This book could not be prepared for reading.'
          : 'تعذر تجهيز هذا الكتاب للقراءة.'
      );
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    if (query.trim().length < 2) return;
    logBookEngineV2('BOOK_SEARCH_V2_SURFACE_LIVE', {
      query: query.trim().slice(0, 80),
      resultCount: validResults.length,
      isLoading: isLoading || isAnalyzingImage,
    });
  }, [isAnalyzingImage, isLoading, query, validResults.length]);

  return (
    <div className="h-screen w-full flex flex-col bg-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur border-b border-white/10">
        <div className="app-rail app-rail--default flex h-20 items-center gap-2 px-0">
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

      <main className="flex-grow overflow-y-auto">
        <div className="app-rail app-rail--default py-4">
          <div className="mb-4">
            <UnifiedSearchFilterToggle
              ebookOnly={ebookOnly}
              onToggle={toggleEbookOnly}
            />
          </div>

        {(isLoading || isAnalyzingImage) && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && searchError && query.trim().length >= 2 && (
          <BilingualText className="text-center text-red-300 mt-12">
            {searchErrorMessage}
          </BilingualText>
        )}

        {!isLoading && !searchError && validResults.length > 0 && (
          <div className="space-y-3">
            {validResults.map(r => (
              <SearchResultCard
                key={r.id}
                result={r}
                lang={lang}
                isBusy={busyId === r.id}
                onOpen={handleOpenResult}
                onRead={handleReadResult}
              />
            ))}
          </div>
        )}

          {!isLoading && !searchError && query && validResults.length === 0 && (
            <BilingualText className="text-center text-white/60 mt-12">
              {lang === 'en' ? 'No results found.' : 'لا توجد نتائج.'}
            </BilingualText>
          )}
        </div>
      </main>

      {isCameraOpen && (
        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={img =>
            identifyBook(img, {
              onSuccess: text => text && setQuery(text),
              onError: () => {
                showToast(
                  lang === 'en'
                    ? 'Image-based book identification is unavailable.'
                    : 'التعرف على الكتاب من الصورة غير متاح.'
                );
              },
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
