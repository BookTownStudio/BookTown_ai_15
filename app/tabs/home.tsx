// app/tabs/home.tsx

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BookCard from '../../components/content/BookCard.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import CollapsibleSection from '../../components/ui/CollapsibleSection.tsx';
import HomeSearchBar from '../../components/content/HomeSearchBar.tsx';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { useSearchHistory } from '../../lib/hooks/useSearchHistory.ts';
import { useIdentifyBook } from '../../lib/hooks/useAiMutations.ts';
import { BookCardSkeleton } from '../../components/ui/Skeletons.tsx';
import Skeleton from '../../components/ui/Skeleton.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
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
import { useHomeSearchState } from '../../store/home-search.tsx';
import {
  acquireExternalEbookForRead,
  buildAcquireExternalReadParams,
} from '../../lib/books/acquireExternalEbookForRead.ts';
import { useVenuesAndEvents } from '../../lib/hooks/useVenuesAndEvents.ts';
import VenueCard from '../../components/content/VenueCard.tsx';
import EventCard from '../../components/content/EventCard.tsx';
import { Event, Venue } from '../../types/entities.ts';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { VenuesIcon } from '../../components/icons/VenuesIcon.tsx';

/* -------------------------------
   Constants
-------------------------------- */
const HomeScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate, currentView, resetTokens } = useNavigation();
  const { showToast } = useToast();
  const { items: continueReadingItems, isLoading: isContinueLoading } = useContinueReading(8);
  const {
    bookIds: recommendedBookIds,
    isLoading: isRecommendationsLoading,
    isError: isRecommendationsError,
  } = useQuickRecs();
  const { history: recentSearches, addToHistory, removeFromHistory } = useSearchHistory();
  const {
    query: searchQuery,
    isSearchActive,
    scrollTop,
    setQuery: setSearchQuery,
    setSearchActive,
    setScrollTop,
    clearSearch,
  } = useHomeSearchState();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const scrollWriteRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(scrollTop);
  const hasRestoredScrollRef = useRef(false);
  const previousHomeResetTokenRef = useRef(resetTokens.home);
  const lastCommittedSearchExecutionRef = useRef('');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* -------------------------------
     Collapsible section state
  -------------------------------- */
  const [isContinueOpen, setIsContinueOpen] = useState(true);
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(true);
  const [isSpacesOpen, setIsSpacesOpen] = useState(true);
  const { data: homeSpaces = [], isLoading: isSpacesLoading } = useVenuesAndEvents('');

  /* -------------------------------
     🔒 HOME RESET CONTRACT
  -------------------------------- */
  useEffect(() => {
    if (previousHomeResetTokenRef.current === resetTokens.home) return;
    previousHomeResetTokenRef.current = resetTokens.home;
    clearSearch();
    setBusyId(null);
  }, [clearSearch, resetTokens.home]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      if (scrollWriteRafRef.current !== null) {
        window.cancelAnimationFrame(scrollWriteRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasRestoredScrollRef.current) return;
    const shell = shellRef.current;
    if (!shell || scrollTop <= 0) return;

    hasRestoredScrollRef.current = true;
    window.requestAnimationFrame(() => {
      shell.scrollTop = scrollTop;
    });
  }, [scrollTop]);

  const {
    data: searchResponse,
    isLoading: isSearchingBooks,
    error: searchError,
    ebookOnly,
    toggleEbookOnly,
    dataUpdatedAt: searchDataUpdatedAt,
  } = useUnifiedBookSearch(searchQuery);

  const { isPending: isAnalyzingImage } = useIdentifyBook();
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

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) return;
    if (isSearchingBooks || isAnalyzingImage || searchError || !searchResponse) return;

    const executionKey = `${normalizedQuery.toLocaleLowerCase()}:${searchDataUpdatedAt || 0}`;
    if (lastCommittedSearchExecutionRef.current === executionKey) return;

    lastCommittedSearchExecutionRef.current = executionKey;
    addToHistory(normalizedQuery);
  }, [
    addToHistory,
    isAnalyzingImage,
    isSearchingBooks,
    searchDataUpdatedAt,
    searchError,
    searchQuery,
    searchResponse,
  ]);

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

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: buildBookDetailsParams(result, currentView, {
          autoAcquireOnOpen: ebookOnly && result.available && !result.acquired,
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
    if (busyId || result.ebookClass === 'unavailable') return;

    try {
      const acquisitionParams = buildAcquireExternalReadParams(result);
      if (!acquisitionParams) {
        throw new Error('INVALID_ACQUISITION_PARAMS');
      }

      setBusyId(result.id);
      showToast(lang === 'en' ? 'Preparing your copy...' : 'جارٍ تجهيز نسختك...');
      trackSearchClick({
        query: searchQuery,
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
      console.error('[HOME][READ_OPEN_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'This book could not be prepared for reading.'
          : 'تعذر تجهيز هذا الكتاب للقراءة.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectRecentSearch = (query: string) => {
    setSearchQuery(query);
    setSearchActive(true);
  };

  const handleHomeScroll = (event: React.UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;
    if (scrollWriteRafRef.current !== null) return;

    scrollWriteRafRef.current = window.requestAnimationFrame(() => {
      scrollWriteRafRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  };

  const handleSemanticChipClick = (chip: {
    kind: 'tradition' | 'form' | 'subform';
    value: string;
  }) => {
    navigate({
      type: 'stack',
      id: 'semanticCollection',
      params: {
        kind: chip.kind,
        id: chip.value,
        from: currentView,
      },
    });
  };

  const handleOpenSpace = (space: Venue | Event) => {
    navigate({
      type: 'immersive',
      id: 'venueDetails',
      params: {
        venueId: space.id,
        ...(space.identity?.slug ? { spaceSlug: space.identity.slug, canonicalSlug: space.identity.slug } : {}),
        from: currentView,
      },
    });
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
              <BookCardSkeleton key={i} layout="row" />
            ))}
          </div>
        )}

        {!isSearchingBooks && searchError && searchQuery.trim().length >= 2 && (
          <ErrorState
            title={lang === 'en' ? 'Search unavailable' : 'البحث غير متاح'}
            message={searchErrorMessage}
          />
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
                onSemanticChipClick={handleSemanticChipClick}
              />
            ))}
          </div>
        )}

        {!isSearchingBooks && !searchError && searchQuery.trim().length >= 2 && validResults.length === 0 && (
          <EmptyState
            icon={BookIcon}
            titleEn="No books found"
            titleAr="لا توجد كتب"
            messageEn="Try another title, author, or literary tradition."
            messageAr="جرّب عنواناً أو مؤلفاً أو تقليداً أدبياً آخر."
          />
        )}
      </div>
    );
  };

  return (
    <PageShell
      ref={shellRef}
      scrollable
      onScroll={handleHomeScroll}
    >
      <AppNav titleEn="BookTown" titleAr="بوكتاون" />

      <main className="flex-grow pt-24 pb-[calc(var(--bottom-nav-height,66px)+1.5rem)]">
        <LiteraryShell>
          <PageTransition className="w-full">
            <HomeSearchBar
              value={searchQuery}
              onChange={val => {
                setSearchQuery(val);
                setSearchActive(val.trim().length > 0);
              }}
              onFocus={() => {
                if (blurTimerRef.current !== null) {
                  window.clearTimeout(blurTimerRef.current);
                  blurTimerRef.current = null;
                }
                setSearchActive(true);
              }}
              onBlur={() => {
                blurTimerRef.current = window.setTimeout(() => {
                  if (searchQuery.trim().length === 0) {
                    setSearchActive(false);
                  }
                }, 120);
              }}
              onClear={() => {
                clearSearch();
              }}
              onEscape={() => {
                clearSearch();
              }}
              onMicClick={() => setIsMicModalOpen(true)}
              onCameraClick={() => setIsCameraOpen(true)}
              recentSearches={recentSearches}
              showRecentSearches={isSearchActive}
              onSelectRecentSearch={handleSelectRecentSearch}
              onRemoveRecentSearch={removeFromHistory}
            />

            {isSearchActive ? (
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
                    <EmptyState
                      icon={BookIcon}
                      titleEn="No active books"
                      titleAr="لا توجد كتب نشطة"
                      messageEn="Your active books will appear here."
                      messageAr="ستظهر كتبك النشطة هنا."
                    />
                  )}
                </CollapsibleSection>

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
                    ) : isRecommendationsError ? (
                      <ErrorState
                        title={lang === 'en' ? 'Recommendations unavailable' : 'التوصيات غير متاحة'}
                        message={
                          lang === 'en'
                            ? 'Recommendations are temporarily unavailable.'
                            : 'التوصيات غير متاحة مؤقتاً.'
                        }
                      />
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
                      <EmptyState
                        icon={BookIcon}
                        titleEn="No recommendations yet"
                        titleAr="لا توجد توصيات بعد"
                        messageEn="Recommendations will appear here soon."
                        messageAr="ستظهر التوصيات هنا قريباً."
                      />
                    )}
                  </CollapsibleSection>
                </div>

                <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                  <CollapsibleSection
                    titleEn="Literary Spaces"
                    titleAr="مساحات أدبية"
                    isOpen={isSpacesOpen}
                    onToggle={() => setIsSpacesOpen(v => !v)}
                  >
                    {isSpacesLoading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                        {[1, 2].map(i => (
                          <div key={i} className="space-y-3 rounded-lg border border-white/10 p-4">
                            <Skeleton className="h-32 w-full rounded-lg" />
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : homeSpaces.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {homeSpaces.slice(0, 4).map(space => (
                          'dateTime' in space ? (
                            <EventCard key={`event-${space.id}`} event={space} onClick={() => handleOpenSpace(space)} />
                          ) : (
                            <VenueCard key={`venue-${space.id}`} venue={space} onClick={() => handleOpenSpace(space)} />
                          )
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={VenuesIcon}
                        titleEn="No literary spaces yet"
                        titleAr="لا توجد مساحات أدبية بعد"
                        messageEn="Bookshops, libraries, and literary events will appear here."
                        messageAr="ستظهر هنا المكتبات والفعاليات الأدبية."
                      />
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
            setSearchActive(text.trim().length > 0);
            addToHistory(text);
            setIsMicModalOpen(false);
          }}
        />
      )}
    </PageShell>
  );
};

export default HomeScreen;
