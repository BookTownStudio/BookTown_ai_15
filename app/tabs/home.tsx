// app/tabs/home.tsx

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BookCard from '../../components/content/BookCard.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import CollapsibleSection from '../../components/ui/CollapsibleSection.tsx';
import HomeSearchBar from '../../components/content/HomeSearchBar.tsx';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import AddBookModal from '../../components/modals/AddBookModal.tsx';
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
import CanonicalCoverArtwork from '../../components/content/CanonicalCoverArtwork.tsx';
import { staggerContainer, listItemVariants } from '../../lib/motion.ts';
import { buildBookDetailsParams } from '../../lib/books/searchNavigation.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { useUnifiedBookSearch } from '../../lib/hooks/useUnifiedBookSearch.ts';
import UnifiedSearchFilterToggle from '../../components/content/UnifiedSearchFilterToggle.tsx';
import { useHomeSearchState } from '../../store/home-search.tsx';
import { callCallableEndpoint } from '../../lib/callable.ts';
import {
  acquireExternalEbookForRead,
  buildAcquireExternalReadParams,
} from '../../lib/books/acquireExternalEbookForRead.ts';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { SocialIcon } from '../../components/icons/SocialIcon.tsx';
import { ChevronDownIcon } from '../../components/icons/ChevronDownIcon.tsx';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';
import {
  HomeConsoleBookItem,
  useHomeDiscoveryConsole,
} from '../../lib/hooks/useHomeDiscoveryConsole.ts';

function homeBookToCardBook(item: HomeConsoleBookItem): any {
  return {
    id: item.bookId,
    titleEn: item.title,
    titleAr: item.title,
    authorEn: item.author,
    authorAr: item.author,
    coverUrl: item.coverUrl,
    isEbookAvailable: true,
  };
}

function isStarterSelection(selection: ContinuitySelection): selection is ContinuityStarterSelection {
  return typeof selection === 'object' && selection !== null && 'kind' in selection && 'starter' in selection;
}

function isCanonicalStarter(selection: ContinuitySelection): selection is Extract<ContinuityStarterSelection, { kind: 'canonical' }> {
  return isStarterSelection(selection) && selection.kind === 'canonical';
}

/* -------------------------------
   Constants
-------------------------------- */
const DISCOVER_STREAMS = [
  'Hidden Gems',
  'Arab Voices',
  'Recently Discussed',
  'Philosophical Fiction',
  'Forgotten Classics',
  'Short Reflective Reads',
] as const;

type DiscoverStream = typeof DISCOVER_STREAMS[number];

type ContinuityBookSelection = {
  id: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  coverUrl: string;
  coverMode?: 'uploaded' | 'fallback_metadata';
  fallbackCover?: {
    title: string;
    author?: string;
    theme: 'ink' | 'emerald' | 'gold' | 'plum';
  };
  isEbookAvailable: boolean;
};

type ContinuityStarterPoolRecord = {
  id: string;
  title: string;
  author: string;
  language: 'en' | 'ar' | 'fr' | 'es';
  futureCanonicalKey: string;
  canonicalBookId: string | null;
  status: 'placeholder' | 'canonical_linked' | 'readable' | 'paused';
  active: boolean;
  priority: number;
  onboardingWeight: number;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ContinuityStarterSelection =
  | {
      kind: 'canonical';
      authority: 'continuity_starter_pool_v1';
      starter: ContinuityStarterPoolRecord;
      book: ContinuityBookSelection;
    }
  | {
      kind: 'placeholder';
      authority: 'continuity_starter_pool_v1';
      starter: ContinuityStarterPoolRecord;
      book: null;
    };

type ContinuitySelection = ContinuityBookSelection | ContinuityStarterSelection;

const HomeScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate, currentView, resetTokens } = useNavigation();
  const { showToast } = useToast();
  const {
    data: homeConsole,
    isLoading: isHomeConsoleLoading,
    isError: isHomeConsoleError,
  } = useHomeDiscoveryConsole();
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
  const discoverMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef(scrollTop);
  const hasRestoredScrollRef = useRef(false);
  const previousHomeResetTokenRef = useRef(resetTokens.home);
  const lastCommittedSearchExecutionRef = useRef('');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [starterSelection, setStarterSelection] = useState<ContinuityStarterSelection | null>(null);
  const [activeDiscoverStream, setActiveDiscoverStream] = useState<DiscoverStream>('Hidden Gems');
  const [isDiscoverStreamMenuOpen, setIsDiscoverStreamMenuOpen] = useState(false);

  /* -------------------------------
     Collapsible section state
  -------------------------------- */
  const [isContinueOpen, setIsContinueOpen] = useState(true);
  const [isReadNowOpen, setIsReadNowOpen] = useState(true);
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(true);
  const [isTownOpen, setIsTownOpen] = useState(true);

  /* -------------------------------
     🔒 HOME RESET CONTRACT
  -------------------------------- */
  useEffect(() => {
    if (previousHomeResetTokenRef.current === resetTokens.home) return;
    previousHomeResetTokenRef.current = resetTokens.home;
    clearSearch();
    setBusyId(null);
    setIsDiscoverStreamMenuOpen(false);
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
    if (!isDiscoverStreamMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const menu = discoverMenuRef.current;
      if (!menu || menu.contains(event.target as Node)) return;
      setIsDiscoverStreamMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDiscoverStreamMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDiscoverStreamMenuOpen]);

  useEffect(() => {
    setIsDiscoverStreamMenuOpen(false);
  }, [currentView]);

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

  const selectContinuityBook = async (mode: 'surprise' | 'starter') => {
    return callCallableEndpoint<{ mode: 'surprise' | 'starter' }, ContinuitySelection>(
      'selectHomeContinuityBook',
      { mode }
    );
  };

  const handleSurpriseMe = async () => {
    if (busyId) return;
    try {
      setBusyId('continue-reading-surprise');
      const selection = await selectContinuityBook('surprise');
      if (isStarterSelection(selection)) {
        throw new Error('Unexpected starter selection for Surprise Me.');
      }
      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: {
          bookId: selection.id,
          from: currentView,
        },
      });
    } catch (err) {
      console.error('[HOME][SURPRISE_SELECTION_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'A literary surprise is unavailable right now.'
          : 'المفاجأة الأدبية غير متاحة حالياً.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenStarterBook = async () => {
    if (busyId) return;
    try {
      setBusyId('continue-reading-starter');
      const selection = starterSelection ?? await selectContinuityBook('starter');
      if (isStarterSelection(selection)) {
        setStarterSelection(selection);
      }
      if (!isCanonicalStarter(selection)) {
        showToast(
          lang === 'en'
            ? 'This starter doorway is being prepared for reading.'
            : 'يجري تجهيز كتاب البداية للقراءة.'
        );
        return;
      }
      navigate({
        type: 'immersive',
        id: 'reader',
        params: {
          bookId: selection.book.id,
          from: currentView,
        },
      });
    } catch (err) {
      console.error('[HOME][STARTER_READER_OPEN_FAILED]', err);
      showToast(
        lang === 'en'
          ? 'This starter book cannot be opened right now.'
          : 'تعذر فتح كتاب البداية حالياً.'
      );
    } finally {
      setBusyId(null);
    }
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

  const continueReadingRow = homeConsole?.rows.find((row) => row.type === 'continueReading');
  const readNowRow = homeConsole?.rows.find((row) => row.type === 'readNow');
  const dynamicDiscoveryRow = homeConsole?.rows.find((row) => row.type === 'dynamicDiscovery');
  const fromTheTownRow = homeConsole?.rows.find((row) => row.type === 'fromTheTown');
  const hasContinueReadingItems = Boolean(continueReadingRow && continueReadingRow.items.length > 0);

  useEffect(() => {
    if (hasContinueReadingItems || starterSelection || isHomeConsoleLoading) return;
    let cancelled = false;
    selectContinuityBook('starter')
      .then((selection) => {
        if (!cancelled && isStarterSelection(selection)) {
          setStarterSelection(selection);
        }
      })
      .catch((error) => {
        console.warn('[HOME][STARTER_PREVIEW_UNAVAILABLE]', error);
      });
    return () => {
      cancelled = true;
    };
  }, [hasContinueReadingItems, isHomeConsoleLoading, starterSelection]);

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

  const renderContinueReadingEmptyCards = () => (
    <div className="flex overflow-x-auto scrollbar-hide snap-x pt-4 pb-2 px-1">
      <button
        type="button"
        className="group mr-4 w-32 flex-shrink-0 snap-start text-left"
        onClick={() => setIsAddBookModalOpen(true)}
        aria-label={lang === 'en' ? 'Add a book to Continue Reading' : 'أضف كتاباً إلى أكمل القراءة'}
      >
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-slate-600 text-slate-600 transition-all duration-300 hover:border-accent hover:bg-slate-200/50 hover:text-accent dark:border-white/30 dark:text-white/40 dark:hover:bg-white/5">
          <PlusIcon className="h-10 w-10" />
          <p className="mt-1 text-xs font-semibold text-inherit">
            {lang === 'en' ? 'Add Book' : 'أضف كتاب'}
          </p>
        </div>
      </button>

      <button
        type="button"
        className="group mr-4 w-32 flex-shrink-0 snap-start text-left"
        onClick={handleSurpriseMe}
        aria-label={lang === 'en' ? 'Surprise me with one book' : 'فاجئني بكتاب واحد'}
      >
        <div className="relative flex aspect-[2/3] w-full flex-col items-center justify-center overflow-hidden rounded-card border border-sky-200/15 bg-gradient-to-br from-sky-500 via-sky-700 to-slate-700 shadow-md transition duration-300 group-hover:border-sky-100/30 dark:border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_72%_78%,_rgba(186,230,253,0.16),_transparent_30%)]" />
          <div className="relative z-10 h-24 w-24 opacity-90">
            <DotLottieReact
              src="/animations/sparkling-gift.lottie"
              autoplay
              loop
              className="h-full w-full"
              renderConfig={{ autoResize: true }}
            />
          </div>
          <p className="relative z-10 mt-2 text-center text-sm font-bold text-white/90">
            {lang === 'en' ? 'Surprise Me' : 'فاجئني'}
          </p>
        </div>
      </button>

      <div
        role="button"
        tabIndex={0}
        className="mr-4 w-32 flex-shrink-0 cursor-pointer snap-start"
        onClick={handleOpenStarterBook}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleOpenStarterBook();
          }
        }}
        aria-label={lang === 'en' ? 'Open starter book' : 'افتح كتاب البداية'}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card bg-slate-800 shadow-md">
          <CanonicalCoverArtwork
            title={starterSelection?.starter.title ?? 'Starter Book'}
            author={starterSelection?.starter.author ?? 'BookTown'}
            variant="posterCompact"
            fallbackCover={{
              title: starterSelection?.starter.title ?? 'Starter Book',
              author: starterSelection?.starter.author ?? 'BookTown',
              theme: 'ink',
            }}
          />
        </div>
      </div>
    </div>
  );

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
                <CollapsibleSection
                  titleEn="Continue Reading"
                  titleAr="أكمل القراءة"
                  isOpen={isContinueOpen}
                  onToggle={() => setIsContinueOpen(v => !v)}
                >
                  {isHomeConsoleLoading ? (
                    <div className="flex gap-4 py-4 overflow-hidden">
                      {[1, 2, 3].map(i => <BookCardSkeleton key={i} layout="list" />)}
                    </div>
                  ) : hasContinueReadingItems ? (
                    <motion.div
                      className="flex overflow-x-auto scrollbar-hide snap-x pt-2 pb-4"
                      variants={staggerContainer}
                      initial="hidden"
                      animate="show"
                    >
                      {continueReadingRow!.items.map(item => (
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
                            book={homeBookToCardBook(item)}
                            layout="list"
                            progress={Math.round((item.progress ?? 0) * 100)}
                            className="w-40 sm:w-44"
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : renderContinueReadingEmptyCards()}
                </CollapsibleSection>

                {(
                  <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                    <CollapsibleSection
                      titleEn="Ready to Read"
                      titleAr="جاهز للقراءة"
                      isOpen={isReadNowOpen}
                      onToggle={() => setIsReadNowOpen(v => !v)}
                    >
                      {isHomeConsoleLoading ? (
                        <div className="flex gap-4 py-4 overflow-hidden">
                          {[1, 2, 3].map(i => <BookCardSkeleton key={i} layout="list" />)}
                        </div>
                      ) : isHomeConsoleError ? (
                        <ErrorState
                          title={lang === 'en' ? 'Ready to Read unavailable' : 'جاهز للقراءة غير متاح'}
                          message={lang === 'en' ? 'This row is temporarily unavailable.' : 'هذا الصف غير متاح مؤقتاً.'}
                        />
                      ) : (
                      <motion.div
                        className="flex overflow-x-auto scrollbar-hide snap-x pt-2 pb-4"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {(readNowRow?.items ?? []).map(item => (
                          <motion.div key={item.bookId} variants={listItemVariants} className="snap-start">
                            <BookCard
                              bookId={item.bookId}
                              book={homeBookToCardBook(item)}
                              layout="list"
                            />
                            {item.reason && (
                              <p className="mt-2 w-40 sm:w-44 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-white/55">
                                {item.reason}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </motion.div>
                      )}
                    </CollapsibleSection>
                  </div>
                )}

                {(
                <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                  <section>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <div ref={discoverMenuRef} className="relative">
                        <button
                          type="button"
                          className="flex min-h-[36px] items-center gap-2 text-left"
                          aria-haspopup="menu"
                          aria-expanded={isDiscoverStreamMenuOpen}
                          onClick={() => setIsDiscoverStreamMenuOpen(open => !open)}
                        >
                          <span className="text-lg font-semibold text-slate-700 dark:text-slate-300 md:text-xl">
                            Discover
                          </span>
                          <span className="text-sm font-medium text-slate-500 dark:text-white/55 md:text-base">
                            {activeDiscoverStream}
                          </span>
                          <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isDiscoverStreamMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDiscoverStreamMenuOpen && (
                          <motion.div
                            role="menu"
                            className="absolute left-0 z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.16, ease: 'easeOut' }}
                          >
                            {DISCOVER_STREAMS.map(stream => (
                              <button
                                key={stream}
                                type="button"
                                role="menuitemradio"
                                aria-checked={stream === activeDiscoverStream}
                                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${
                                  stream === activeDiscoverStream
                                    ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white'
                                    : 'text-slate-600 hover:bg-slate-50 dark:text-white/65 dark:hover:bg-white/5'
                                }`}
                                onClick={() => {
                                  setActiveDiscoverStream(stream);
                                  setIsDiscoverStreamMenuOpen(false);
                                }}
                              >
                                {stream}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                        aria-label={isRecommendationsOpen ? 'Collapse Discover' : 'Expand Discover'}
                        aria-expanded={isRecommendationsOpen}
                        onClick={() => setIsRecommendationsOpen(v => !v)}
                      >
                        <ChevronDownIcon className={`h-5 w-5 transition-transform duration-300 ${isRecommendationsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <div className={`grid transition-all duration-300 ease-in-out ${isRecommendationsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden pt-2">
                    {isHomeConsoleLoading ? (
                      <div className="flex gap-4 py-4 overflow-hidden">
                        {[1, 2, 3].map(i => <BookCardSkeleton key={i} layout="list" />)}
                      </div>
                    ) : isHomeConsoleError ? (
                      <ErrorState
                        title={lang === 'en' ? 'Discovery unavailable' : 'الاكتشاف غير متاح'}
                        message={
                          lang === 'en'
                            ? 'Discovery is temporarily unavailable.'
                            : 'الاكتشاف غير متاح مؤقتاً.'
                        }
                      />
                    ) : dynamicDiscoveryRow && dynamicDiscoveryRow.items.length > 0 ? (
                      <motion.div
                        className="flex overflow-x-auto scrollbar-hide snap-x pt-2 pb-4"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {dynamicDiscoveryRow.items.map(item => (
                          <motion.div
                            key={item.bookId}
                            variants={listItemVariants}
                            className="snap-start"
                          >
                            <BookCard
                              bookId={item.bookId}
                              book={homeBookToCardBook(item)}
                              layout="list"
                            />
                            {item.reason && (
                              <p className="mt-2 w-40 sm:w-44 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-white/55">
                                {item.reason}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : null}
                      </div>
                    </div>
                  </section>
                </div>
                )}

                {(
                <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                  <CollapsibleSection
                    titleEn="From the Town"
                    titleAr="من البلدة"
                    isOpen={isTownOpen}
                    onToggle={() => setIsTownOpen(v => !v)}
                  >
                    {isHomeConsoleLoading ? (
                      <div className="flex gap-4 py-4 overflow-hidden">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-64 shrink-0 space-y-3 rounded-lg border border-white/10 p-4">
                            <Skeleton className="h-32 w-full rounded-lg" />
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : isHomeConsoleError ? (
                      <ErrorState
                        title={lang === 'en' ? 'From the Town unavailable' : 'من البلدة غير متاح'}
                        message={lang === 'en' ? 'This row is temporarily unavailable.' : 'هذا الصف غير متاح مؤقتاً.'}
                      />
                    ) : fromTheTownRow && fromTheTownRow.items.length > 0 ? (
                      <div className="flex overflow-x-auto scrollbar-hide snap-x gap-4 pt-2 pb-4">
                        {fromTheTownRow.items.map(item => (
                          <button
                            key={item.signalId}
                            type="button"
                            disabled={item.signalType !== 'post' || !item.postId}
                            onClick={() => {
                              if (item.signalType !== 'post' || !item.postId) return;
                              navigate({
                                type: 'immersive',
                                id: 'postDiscussion',
                                params: { postId: item.postId, from: currentView },
                              });
                            }}
                            className="w-64 shrink-0 snap-start rounded-lg border border-white/10 bg-white/5 p-4 text-left transition enabled:hover:bg-white/10 disabled:cursor-default"
                          >
                            <SocialIcon className="mb-3 h-5 w-5 text-accent" />
                            <p className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-white">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-white/60">
                                {item.subtitle}
                              </p>
                            )}
                            {item.reason && (
                              <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-white/55">
                                {item.reason}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </CollapsibleSection>
                </div>
                )}

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

      <AddBookModal
        isOpen={isAddBookModalOpen}
        onClose={() => setIsAddBookModalOpen(false)}
        targetShelfId="currently-reading"
      />
    </PageShell>
  );
};

export default HomeScreen;
