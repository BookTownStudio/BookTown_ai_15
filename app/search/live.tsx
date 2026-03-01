// app/search/live.tsx

import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useBookSearch } from '../../lib/hooks/useBookSearch.ts';
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

const LiveSearchScreen: React.FC = () => {
  const { navigate, currentView } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);

  const { history, addToHistory } = useSearchHistory();
  const { data: searchResponse, isLoading } = useBookSearch(query, {
    ebookOnly: false,
    lang,
    limit: 15,
  });
  const validResults: SearchResultDTO[] = searchResponse?.results || [];
  const clickedRankFor = (id: string): number => {
    const index = validResults.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : 1;
  };
  const { mutate: identifyBook, isLoading: isAnalyzingImage } =
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

  const handleAddResult = async (result: SearchResultDTO) => {
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
          pendingAction: 'NONE',
          searchQuery: query.trim(),
          clickedRank: clickedRankFor(result.id),
          clickTracked: true,
        }),
      });
    } catch (err) {
      console.error('[LIVE_SEARCH][ADD_OPEN_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'Failed to add book.'
          : 'فشل إضافة الكتاب.'
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
                key={r.id}
                result={r}
                lang={lang}
                isBusy={busyId === r.id}
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
