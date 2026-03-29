// app/tabs/home.tsx

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import DiscoveryEntryCard from '../../components/content/DiscoveryEntryCard.tsx';
import BookCard from '../../components/content/BookCard.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import CollapsibleSection from '../../components/ui/CollapsibleSection.tsx';
import HomeSearchBar from '../../components/content/HomeSearchBar.tsx';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { useSearchHistory } from '../../lib/hooks/useSearchHistory.ts';
import { useIdentifyBook } from '../../lib/hooks/useAiMutations.ts';
import { BookCardSkeleton } from '../../components/ui/Skeletons.tsx';
import PageTransition from '../../components/ui/PageTransition.tsx';
import PageShell from '../../components/layout/PageShell.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import { useToast } from '../../store/toast.tsx';
import SearchResultCard from '../../components/content/SearchResultCard.tsx';
import { staggerContainer, listItemVariants } from '../../lib/motion.ts';
import { cn } from '../../lib/utils.ts';
import { useContinueReading } from '../../lib/hooks/useContinueReading.ts';
import { useQuickRecs } from '../../lib/hooks/useQuickRecs.ts';
import { buildBookDetailsParams } from '../../lib/books/searchNavigation.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { useUnifiedBookSearch } from '../../lib/hooks/useUnifiedBookSearch.ts';
import UnifiedSearchFilterToggle from '../../components/content/UnifiedSearchFilterToggle.tsx';

/* -------------------------------
   Constants
-------------------------------- */
const HomeScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate, currentView, resetTokens } = useNavigation();
  const { showToast } = useToast();
  const { items: continueReadingItems, isLoading: isContinueLoading } = useContinueReading(8);
  const { bookIds: recommendedBookIds, isLoading: isRecommendationsLoading } = useQuickRecs();
  const { addToHistory } = useSearchHistory();

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* -------------------------------
     Collapsible section state
  -------------------------------- */
  const [isContinueOpen, setIsContinueOpen] = useState(true);
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(true);

  /* -------------------------------
     🔒 HOME RESET CONTRACT
  -------------------------------- */
  useEffect(() => {
    setSearchQuery('');
    setIsSearching(false);
    setBusyId(null);
  }, [resetTokens.home]);

  const {
    data: searchResponse,
    isLoading: isSearchingBooks,
    error: searchError,
    ebookOnly,
    toggleEbookOnly,
  } = useUnifiedBookSearch(searchQuery);

  const { isLoading: isAnalyzingImage } = useIdentifyBook();
  const searchResults = searchResponse?.results || [];
  const searchErrorMessage =
    searchError instanceof Error && searchError.message.trim().length > 0
      ? searchError.message
      : lang === 'en'
      ? 'Search is temporarily unavailable.'
      : 'البحث غير متاح مؤقتاً.';
  const clickedRankFor = (id: string): number => {
    const index = searchResults.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : 1;
  };

  useEffect(() => {
    if (searchQuery.trim().length < 2) return;
    logBookEngineV2('BOOK_SEARCH_V2_SURFACE_HOME', {
      query: searchQuery.trim().slice(0, 80),
      resultCount: searchResponse?.results?.length || 0,
      isLoading: isSearchingBooks,
      ebookOnly,
    });
  }, [ebookOnly, isSearchingBooks, searchQuery, searchResponse?.results?.length]);

  /* -------------------------------
     Open Search Result
  -------------------------------- */
  const handleOpenResult = async (result: SearchResultDTO) => {
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

      setIsSearching(false);

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: buildBookDetailsParams(result, currentView, {
          searchQuery: searchQuery.trim(),
          clickedRank: clickedRankFor(result.id),
          clickTracked: true,
        }),
      });
    } catch (err) {
      console.error('[HOME][OPEN_FAILED]', err);
      showToast(lang === 'en' ? 'Failed to open book.' : 'فشل فتح الكتاب.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReadResult = async (result: SearchResultDTO) => {
    if (busyId || result.ebookClass !== 'in_app') return;

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

      navigate({
        type: 'immersive',
        id: 'reader',
        params: {
          bookId: result.bookId,
          from: currentView,
        },
      });
    } catch (err) {
      console.error('[HOME][READ_OPEN_FAILED]', err);
      showToast(lang === 'en' ? 'Failed to open ebook.' : 'فشل فتح الكتاب الإلكتروني.');
    } finally {
      setBusyId(null);
    }
  };

  /* -------------------------------
     Render Search Results
  -------------------------------- */
  const renderSearchResults = () => {
    const validResults: SearchResultDTO[] = searchResults;

    return (
      <div className="pt-4 min-h-[40vh]">
        {(isSearchingBooks || isAnalyzingImage) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-24 bg-slate-800 animate-pulse rounded-xl"
              />
            ))}
          </div>
        )}

        {!isSearchingBooks && searchError && searchQuery.trim().length >= 2 && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-5 text-sm text-red-200">
            {searchErrorMessage}
          </div>
        )}

        {!isSearchingBooks && !searchError && validResults.length > 0 && (
          <div className="space-y-3">
            {validResults.map(result => (
              <SearchResultCard
                key={result.id}
                result={result}
                lang={lang}
                isBusy={busyId === result.id}
                onOpen={handleOpenResult}
                onRead={handleReadResult}
              />
            ))}
          </div>
        )}

        {!isSearchingBooks && !searchError && searchQuery.trim().length >= 2 && validResults.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/60">
            {lang === 'en' ? 'No books matched this search.' : 'لا توجد كتب تطابق هذا البحث.'}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageShell scrollable>
      <AppNav titleEn="BookTown" titleAr="بوكتاون" />

      <main className="flex-grow pt-24 pb-20">
        <LiteraryShell>
          <PageTransition className="w-full">
            <HomeSearchBar
              value={searchQuery}
              onChange={val => {
                setSearchQuery(val);
                setIsSearching(val.length > 0);
              }}
              onFocus={() => setIsSearching(true)}
              onClear={() => {
                setSearchQuery('');
                setIsSearching(false);
              }}
              onMicClick={() => setIsMicModalOpen(true)}
              onCameraClick={() => setIsCameraOpen(true)}
            />

            {isSearching ? (
              <div className="animate-fade-in">
                <div className="mt-4 flex items-center justify-start">
                  <UnifiedSearchFilterToggle
                    ebookOnly={ebookOnly}
                    onToggle={toggleEbookOnly}
                  />
                </div>
                {renderSearchResults()}
              </div>
            ) : (
              <div className="space-y-12 mt-8">
                {/* 📖 Continue Reading (canonical currently-reading shelf) */}
                <CollapsibleSection
                  titleEn="Continue Reading"
                  titleAr="أكمل القراءة"
                  isOpen={isContinueOpen}
                  onToggle={() => setIsContinueOpen(v => !v)}
                >
                  {isContinueLoading ? (
                    <div className="flex gap-4 py-4 overflow-hidden">
                      {[1, 2, 3].map(i => <BookCardSkeleton key={i} layout="list" />)}
                    </div>
                  ) : continueReadingItems.length > 0 ? (
                    <motion.div
                      className="flex overflow-x-auto scrollbar-hide snap-x pt-2 pb-4"
                      variants={staggerContainer}
                      initial="hidden"
                      animate="show"
                    >
                      {continueReadingItems.map(item => (
                        <motion.div
                          key={item.bookId}
                          variants={listItemVariants}
                          className="cursor-pointer snap-start"
                          onClick={() =>
                            navigate({
                              type: 'immersive',
                              id: 'reader',
                              params: {
                                bookId: item.bookId,
                                from: currentView
                              }
                            })
                          }
                        >
                          <BookCard
                            bookId={item.bookId}
                            layout="list"
                            progress={Math.round(item.progress * 100)}
                            className="w-40 sm:w-44"
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-black/5 dark:border-white/5 rounded-2xl">
                      <span className="text-sm italic text-slate-500 text-center">
                        {lang === 'en'
                          ? 'Your active books will appear here.'
                          : 'ستظهر كتبك النشطة هنا.'}
                      </span>
                    </div>
                  )}
                </CollapsibleSection>

                <DiscoveryEntryCard
                  onClick={() => navigate({ type: 'stack', id: 'discovery' })}
                />

                <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                  <CollapsibleSection
                    titleEn="Trending Now"
                    titleAr="الرائج الآن"
                    isOpen={isRecommendationsOpen}
                    onToggle={() => setIsRecommendationsOpen(v => !v)}
                  >
                    {isRecommendationsLoading ? (
                      <div className="flex gap-4 py-4 overflow-hidden">
                        {[1, 2, 3].map(i => <BookCardSkeleton key={i} layout="list" />)}
                      </div>
                    ) : recommendedBookIds.length > 0 ? (
                      <motion.div
                        className="flex overflow-x-auto scrollbar-hide snap-x pt-2 pb-4"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {recommendedBookIds.map(bookId => (
                          <motion.div
                            key={bookId}
                            variants={listItemVariants}
                            className="snap-start"
                          >
                            <BookCard
                              bookId={bookId}
                              layout="list"
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-black/5 dark:border-white/5 rounded-2xl">
                        <span className="text-sm italic text-slate-500 text-center">
                          {lang === 'en'
                            ? 'Recommendations will appear here soon.'
                            : 'ستظهر التوصيات هنا قريباً.'}
                        </span>
                      </div>
                    )}
                  </CollapsibleSection>
                </div>

              </div>
            )}
          </PageTransition>
        </LiteraryShell>
      </main>

      {isCameraOpen && (
        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={() => {}}
        />
      )}

      {isMicModalOpen && (
        <VoiceSearchModal
          isOpen={isMicModalOpen}
          onClose={() => setIsMicModalOpen(false)}
          onResult={text => {
            setSearchQuery(text);
            setIsSearching(text.length > 0);
            addToHistory(text);
            setIsMicModalOpen(false);
          }}
        />
      )}
    </PageShell>
  );
};

export default HomeScreen;
