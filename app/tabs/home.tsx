// app/tabs/home.tsx

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BookCard from '../../components/content/BookCard.tsx';
import { BookCardDataAdapter } from '../../components/content/BookCardDataAdapter.ts';
import { useNavigation } from '../../store/navigation.tsx';
import CollapsibleSection from '../../components/ui/CollapsibleSection.tsx';
import HomeSearchBar from '../../components/content/HomeSearchBar.tsx';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import AddBookModal from '../../components/modals/AddBookModal.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { useSearchHistory } from '../../lib/hooks/useSearchHistory.ts';
import { useIdentifyBook } from '../../lib/hooks/useAiMutations.ts';
import { BookCardSkeleton, HomeRailSkeleton } from '../../components/ui/Skeletons.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import PageTransition from '../../components/ui/PageTransition.tsx';
import PageShell from '../../components/layout/PageShell.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import { useToast } from '../../store/toast.tsx';
import SearchResultCard from '../../components/content/SearchResultCard.tsx';
import CanonicalCoverArtwork from '../../components/content/CanonicalCoverArtwork.tsx';
import { staggerContainer, listItemVariants } from '../../lib/motion.ts';
import {
  buildBookDetailsParams,
  resolveIngestionSource,
} from '../../lib/books/searchNavigation.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../../lib/logging/bookEngineV2Log.ts';
import { trackSearchClick } from '../../services/searchTelemetryService.ts';
import { useUnifiedBookSearch } from '../../lib/hooks/useUnifiedBookSearch.ts';
import UnifiedSearchFilterToggle from '../../components/content/UnifiedSearchFilterToggle.tsx';
import { useHomeSearchState } from '../../store/home-search.tsx';
import { callCallableEndpoint } from '../../lib/callable.ts';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { SocialIcon } from '../../components/icons/SocialIcon.tsx';
import { ChevronDownIcon } from '../../components/icons/ChevronDownIcon.tsx';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';
import { CheckIcon } from '../../components/icons/CheckIcon.tsx';
import {
  HomeConsoleBookItem,
  useHomeDiscoveryConsole,
} from '../../lib/hooks/useHomeDiscoveryConsole.ts';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useToggleBookOnShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import { useQueryClient } from '../../lib/react-query.ts';
import { ensureCanonicalBook } from '../../lib/books/ensureCanonicalBook.ts';
import { buildLegacyBookView } from '../../lib/books/buildLegacyBookView.ts';
import { enterReadingState } from '../../lib/actions/enterReadingState.ts';
import { getSelectableOrganizationalShelves } from '../../lib/shelves/systemShelves.ts';
import type { Shelf } from '../../types/entities.ts';

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
  'Books for Rainy Nights',
  'Forgotten Classics',
  'Books That Changed Cinema',
  'Short Reflective Reads',
  'Philosophical Fiction',
] as const;

type DiscoverStream = typeof DISCOVER_STREAMS[number];

const HOME_RAIL_CLASS =
  'flex touch-pan-x snap-x gap-4 overflow-x-auto overscroll-x-contain scroll-px-1 scrollbar-hide px-1 pb-4 pt-3';

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

type HomeShelfTarget =
  | {
      id: 'currently-reading';
      titleEn: string;
      titleAr: string;
      kind: 'currently-reading';
    }
  | {
      id: string;
      titleEn: string;
      titleAr: string;
      kind: 'shelf';
    };

const CURRENTLY_READING_TARGET: HomeShelfTarget = {
  id: 'currently-reading',
  titleEn: 'Currently Reading',
  titleAr: 'تقرأ الآن',
  kind: 'currently-reading',
};

function buildHomeShelfTargets(shelves: readonly Shelf[] | null | undefined): HomeShelfTarget[] {
  const organizationalShelves = getSelectableOrganizationalShelves(shelves).map((shelf) => ({
    id: shelf.id,
    titleEn: shelf.titleEn,
    titleAr: shelf.titleAr,
    kind: 'shelf' as const,
  }));

  return [CURRENTLY_READING_TARGET, ...organizationalShelves];
}

const HomeShelfActionSlot: React.FC<{
  resultId: string;
  lang: 'en' | 'ar';
  isOpen: boolean;
  isBusy: boolean;
  shelfTargets: HomeShelfTarget[];
  activeMutationKey: string | null;
  onToggle: () => void;
  onDismiss: () => void;
  onSelectShelf: (target: HomeShelfTarget) => void;
}> = ({
  resultId,
  lang,
  isOpen,
  isBusy,
  shelfTargets,
  activeMutationKey,
  onToggle,
  onDismiss,
  onSelectShelf,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container || container.contains(event.target as Node)) return;

      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };

    document.addEventListener('pointerdown', handlePointerDown, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, {
        capture: true,
      });
    };
  }, [isOpen, onDismiss]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={lang === 'en' ? 'Add book to shelf' : 'إضافة كتاب إلى رف'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={isBusy}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-full border border-accent/45 bg-accent/20 text-accent shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.22)] transition-all hover:bg-accent/30 hover:border-accent/70 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PlusIcon className="h-8 w-8" />
      </button>

      {isOpen && (
        <div
          role="menu"
          data-testid="home-shelf-selector-panel"
          aria-label={lang === 'en' ? 'Choose shelf' : 'اختر رفًا'}
          className="absolute right-0 top-full z-40 mt-2 w-[min(13.5rem,calc(100vw-2rem))] origin-top-right animate-fade-in overflow-hidden rounded-2xl border border-white/15 bg-white/80 p-1.5 text-left shadow-[0_18px_50px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85 dark:shadow-[0_18px_50px_rgba(0,0,0,0.36)]"
        >
          <div className="mb-1 border-b border-black/5 px-2.5 py-2 dark:border-white/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-white/65">
              {lang === 'en' ? 'Add to' : 'إضافة إلى'}
            </p>
          </div>

          <div className="space-y-1">
            {shelfTargets.map((target) => {
              const mutationKey = `${resultId}:${target.id}`;
              const isTargetBusy = activeMutationKey === mutationKey;
              const isCurrentlyReadingTarget = target.kind === 'currently-reading';

              return (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  disabled={Boolean(activeMutationKey)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectShelf(target);
                  }}
                  className="group flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-slate-900 transition-colors hover:bg-black/5 hover:text-slate-950 active:bg-black/10 active:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/95 dark:hover:bg-white/10 dark:hover:text-white dark:active:bg-white/15 dark:active:text-white"
                >
                  <span
                    className={[
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-colors',
                      isCurrentlyReadingTarget
                        ? 'border-accent/35 bg-accent/15 text-accent'
                        : 'border-black/10 bg-black/[0.03] text-slate-600 group-hover:border-accent/25 group-hover:text-accent dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70 dark:group-hover:text-accent',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {isTargetBusy ? (
                      <LoadingSpinner className="!h-3.5 !w-3.5" />
                    ) : isCurrentlyReadingTarget ? (
                      <BookIcon className="h-3.5 w-3.5" />
                    ) : (
                      <CheckIcon className="h-3.5 w-3.5 opacity-0" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1 truncate font-medium leading-tight">
                    {lang === 'en' ? target.titleEn : target.titleAr || target.titleEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const HomeScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate, currentView, resetTokens } = useNavigation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: shelves } = useUserShelves();
  const { mutate: toggleBookOnShelf } = useToggleBookOnShelf();
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
  const [openShelfSelectorResultId, setOpenShelfSelectorResultId] = useState<string | null>(null);
  const [homeShelfMutationKey, setHomeShelfMutationKey] = useState<string | null>(null);
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
    setOpenShelfSelectorResultId(null);
    setHomeShelfMutationKey(null);
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
    if (!openShelfSelectorResultId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenShelfSelectorResultId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openShelfSelectorResultId]);

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
  const homeShelfTargets = React.useMemo(
    () => buildHomeShelfTargets(shelves),
    [shelves]
  );

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
    if (busyId || !result.bookId) return;

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
      showToast(
        lang === 'en'
          ? 'This book could not be opened for reading.'
          : 'تعذر فتح هذا الكتاب للقراءة.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const resolveCanonicalBookId = async (result: SearchResultDTO): Promise<string | null> => {
    if (
      result.resultType === 'canonical' &&
      typeof result.bookId === 'string' &&
      result.bookId.trim().length > 0
    ) {
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

  const buildBookViewForShelf = (result: SearchResultDTO, bookId: string) =>
    buildLegacyBookView({
      id: bookId,
      titleEn: result.titleEn || result.title,
      titleAr: result.titleAr,
      authorEn: result.authorEn,
      authorAr: result.authorAr,
      coverUrl: result.coverUrl,
    });

  const handleSelectHomeShelf = async (
    result: SearchResultDTO,
    target: HomeShelfTarget
  ) => {
    if (busyId || homeShelfMutationKey) return;

    const mutationKey = `${result.id}:${target.id}`;
    setHomeShelfMutationKey(mutationKey);

    try {
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
        setHomeShelfMutationKey(null);
        return;
      }

      if (target.kind === 'currently-reading') {
        await enterReadingState({
          bookId: canonicalBookId,
          progress: 0,
          targetState: 'reading',
        });
        await queryClient.invalidateQueries({ queryKey: ['currentlyReading'] });
        setOpenShelfSelectorResultId(null);
        showToast(
          lang === 'en'
            ? 'Added to Currently Reading'
            : 'تمت الإضافة إلى تقرأ الآن'
        );
        return;
      }

      toggleBookOnShelf(
        {
          shelfId: target.id,
          bookId: canonicalBookId,
          book: buildBookViewForShelf(result, canonicalBookId),
        },
        {
          onSuccess: () => {
            setOpenShelfSelectorResultId(null);
            showToast(
              lang === 'en'
                ? `Added to ${target.titleEn}`
                : `تمت الإضافة إلى ${target.titleAr || target.titleEn}`
            );
          },
          onError: () => {
            showToast(
              lang === 'en'
                ? 'Unable to add this book to the selected shelf.'
                : 'تعذر إضافة هذا الكتاب إلى الرف المحدد.'
            );
          },
          onSettled: () => {
            setHomeShelfMutationKey(null);
          },
        }
      );
    } catch (err) {
      console.error('[HOME][ADD_TO_SHELF_FAILED]', err);
      setHomeShelfMutationKey(null);
      showToast(
        lang === 'en'
          ? 'Unable to add this book to the selected shelf.'
          : 'تعذر إضافة هذا الكتاب إلى الرف المحدد.'
      );
    } finally {
      if (target.kind === 'currently-reading') {
        setHomeShelfMutationKey(null);
      }
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
                isBusy={busyId === result.id || homeShelfMutationKey?.startsWith(`${result.id}:`)}
                onOpen={handleOpenResult}
                onRead={handleReadResult}
                onSemanticChipClick={handleSemanticChipClick}
                actionSlot={
                  <HomeShelfActionSlot
                    resultId={result.id}
                    lang={lang}
                    isOpen={openShelfSelectorResultId === result.id}
                    isBusy={Boolean(busyId) || Boolean(homeShelfMutationKey)}
                    shelfTargets={homeShelfTargets}
                    activeMutationKey={homeShelfMutationKey}
                    onToggle={() =>
                      setOpenShelfSelectorResultId((current) =>
                        current === result.id ? null : result.id
                      )
                    }
                    onDismiss={() => setOpenShelfSelectorResultId(null)}
                    onSelectShelf={(target) => handleSelectHomeShelf(result, target)}
                  />
                }
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

  const renderContinuityDoorwayCards = () => (
    <>
      <button
        type="button"
        className="group w-36 flex-shrink-0 snap-start text-left sm:w-40"
        onClick={() => setIsAddBookModalOpen(true)}
        aria-label={lang === 'en' ? 'Add a book to Continue Reading' : 'أضف كتاباً إلى أكمل القراءة'}
      >
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center rounded-card border border-dashed border-slate-400/70 bg-white/45 text-slate-600 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-accent/70 hover:bg-accent/8 hover:text-accent dark:border-white/22 dark:bg-white/[0.035] dark:text-white/58 dark:hover:border-accent/55 dark:hover:bg-accent/10">
          <PlusIcon className="h-11 w-11" />
          <p className="mt-2 text-xs font-semibold text-inherit">
            {lang === 'en' ? 'Add Book' : 'أضف كتاب'}
          </p>
        </div>
      </button>

      <button
        type="button"
        className="group w-36 flex-shrink-0 snap-start text-left sm:w-40"
        onClick={handleSurpriseMe}
        aria-label={lang === 'en' ? 'Surprise me with one book' : 'فاجئني بكتاب واحد'}
      >
        <div className="relative flex aspect-[2/3] w-full flex-col items-center justify-center overflow-hidden rounded-card border-2 border-[#F2C76E]/45 bg-[linear-gradient(145deg,#073B63_0%,#0A4D86_48%,#062F52_100%)] px-4 text-center shadow-md transition duration-300 group-hover:border-[#F2C76E]/70 group-hover:shadow-lg">
          <style>
            {`
              @keyframes bt-surprise-border-light {
                0% { transform: translate(-44%, -46%) scale(0.92); opacity: 0.38; }
                25% { transform: translate(116%, -42%) scale(1); opacity: 0.54; }
                50% { transform: translate(118%, 128%) scale(0.96); opacity: 0.44; }
                75% { transform: translate(-48%, 130%) scale(1); opacity: 0.5; }
                100% { transform: translate(-44%, -46%) scale(0.92); opacity: 0.38; }
              }
              @keyframes bt-surprise-star-one {
                0%, 100% { transform: rotate(-6deg) scale(0.99); opacity: 0.78; }
                50% { transform: rotate(5deg) scale(1.02); opacity: 0.82; }
              }
              @keyframes bt-surprise-star-two {
                0%, 100% { transform: rotate(8deg) scale(1); opacity: 0.66; }
                50% { transform: rotate(-4deg) scale(1.03); opacity: 0.72; }
              }
              @keyframes bt-surprise-star-three {
                0%, 100% { transform: rotate(-10deg) scale(0.98); opacity: 0.54; }
                50% { transform: rotate(7deg) scale(1.02); opacity: 0.6; }
              }
              @media (prefers-reduced-motion: reduce) {
                .bt-surprise-motion {
                  animation: none !important;
                }
              }
            `}
          </style>

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(242,199,110,0.12),transparent_24%),radial-gradient(circle_at_78%_86%,rgba(255,255,255,0.08),transparent_28%)]" />
          <span
            aria-hidden="true"
            className="bt-surprise-motion pointer-events-none absolute left-0 top-0 h-16 w-16 rounded-full bg-[#F2C76E]/25 blur-xl"
            style={{ animation: 'bt-surprise-border-light 7.4s linear infinite' }}
          />

          <span
            className="bt-surprise-motion absolute left-[22%] top-[66%] z-10 text-base text-[#F2C76E] [text-shadow:0_0_8px_rgba(242,199,110,0.28)]"
            style={{ animation: 'bt-surprise-star-one 4.8s ease-in-out infinite' }}
            aria-hidden="true"
          >
            ✦
          </span>
          <span
            className="bt-surprise-motion absolute left-[57%] top-[25%] z-10 text-[26px] leading-none text-[#F2C76E] [text-shadow:0_0_12px_rgba(242,199,110,0.2)]"
            style={{ animation: 'bt-surprise-star-three 7.6s ease-in-out infinite' }}
            aria-hidden="true"
          >
            ✦
          </span>
          <span
            className="bt-surprise-motion absolute right-[12%] top-[78%] z-10 text-[19px] leading-none text-[#F2C76E] [text-shadow:0_0_10px_rgba(242,199,110,0.24)]"
            style={{ animation: 'bt-surprise-star-two 6.2s ease-in-out infinite' }}
            aria-hidden="true"
          >
            ✦
          </span>

          <div className="relative z-20 flex translate-y-[12%] flex-col items-center">
            <p className="text-center text-lg font-bold leading-tight text-[#FFF7E6] drop-shadow-sm">
              {lang === 'en' ? 'Surprise Me' : 'فاجئني'}
            </p>
            <p className="mt-1 text-center text-[13px] font-normal leading-tight text-[#FFF7E6]/62">
              {lang === 'en' ? 'with a book' : 'بكتاب'}
            </p>
          </div>
        </div>
      </button>

      <div
        role="button"
        tabIndex={0}
        className="group w-36 flex-shrink-0 cursor-pointer snap-start sm:w-40"
        onClick={handleOpenStarterBook}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleOpenStarterBook();
          }
        }}
        aria-label={lang === 'en' ? 'Open starter book' : 'افتح كتاب البداية'}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card bg-slate-800 shadow-md transition duration-300 group-hover:shadow-lg">
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
    </>
  );

  const renderContinueReadingRow = () => (
    <div className={HOME_RAIL_CLASS}>
      {continueReadingRow?.items.map(item => {
        const progress = Math.round((item.progress ?? 0) * 100);

        return (
          <motion.button
            key={item.bookId}
            type="button"
            variants={listItemVariants}
            className="group relative w-36 flex-shrink-0 cursor-pointer snap-start text-left sm:w-40"
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
            aria-label={lang === 'en' ? `Continue ${item.title}` : `أكمل ${item.title}`}
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card bg-slate-800 shadow-md transition duration-300 group-hover:shadow-lg">
              <CanonicalCoverArtwork
                title={item.title}
                author={item.author}
                coverUrl={item.coverUrl}
                variant="posterCompact"
                fallbackCover={{
                  title: item.title,
                  author: item.author,
                  theme: 'ink',
                }}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-2.5 pb-2.5 pt-8">
                <div className="h-1 overflow-hidden rounded-full bg-white/22">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}

      {renderContinuityDoorwayCards()}
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
                  isOpen={hasContinueReadingItems || isContinueOpen}
                  onToggle={() => {
                    if (hasContinueReadingItems) return;
                    setIsContinueOpen(v => !v);
                  }}
                >
                  {isHomeConsoleLoading ? (
                    <HomeRailSkeleton />
                  ) : (
                    <motion.div
                      variants={staggerContainer}
                      initial="hidden"
                      animate="show"
                    >
                      {renderContinueReadingRow()}
                    </motion.div>
                  )}
                </CollapsibleSection>

                {(
                  <div className="[&_h1]:!text-lg md:[&_h1]:!text-xl [&_h1]:!font-semibold [&_h1]:!text-slate-700 dark:[&_h1]:!text-slate-300">
                    <CollapsibleSection
                      titleEn="Read Now in BookTown"
                      titleAr="جاهز للقراءة"
                      isOpen={isReadNowOpen}
                      onToggle={() => setIsReadNowOpen(v => !v)}
                    >
                      {isHomeConsoleLoading ? (
                        <HomeRailSkeleton />
                      ) : isHomeConsoleError ? (
                        <ErrorState
                          title={lang === 'en' ? 'Read Now in BookTown unavailable' : 'جاهز للقراءة غير متاح'}
                          message={lang === 'en' ? 'This row is temporarily unavailable.' : 'هذا الصف غير متاح مؤقتاً.'}
                        />
                      ) : (
                        (readNowRow?.items ?? []).length > 0 ? (
                          <motion.div
                            className={HOME_RAIL_CLASS}
                            variants={staggerContainer}
                            initial="hidden"
                            animate="show"
                          >
                            {(readNowRow?.items ?? []).map(item => (
                              <motion.div key={item.bookId} variants={listItemVariants} className="snap-start">
                                <BookCard
                                  bookId={item.bookId}
                                  book={BookCardDataAdapter.fromHomeConsoleItem(item)}
                                  layout="list"
                                  variant="homeRail"
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
                                />
                              </motion.div>
                            ))}
                          </motion.div>
                        ) : (
                          <EmptyState
                            icon={BookIcon}
                            titleEn="No readable books yet"
                            titleAr="لا توجد كتب جاهزة بعد"
                            messageEn="Readable BookTown books will appear here when available."
                            messageAr="ستظهر هنا كتب بوكتاون الجاهزة للقراءة عند توفرها."
                          />
                        )
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
                      <HomeRailSkeleton />
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
                        className={HOME_RAIL_CLASS}
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {dynamicDiscoveryRow.items.map(item => (
                          <motion.div key={item.bookId} variants={listItemVariants} className="snap-start">
                            <BookCard
                              bookId={item.bookId}
                              book={BookCardDataAdapter.fromHomeConsoleItem(item)}
                              layout="list"
                              variant="homeRail"
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : (
                      <EmptyState
                        icon={BookIcon}
                        titleEn="Nothing to discover yet"
                        titleAr="لا توجد اكتشافات بعد"
                        messageEn="Curated discoveries will appear here when available."
                        messageAr="ستظهر هنا الاكتشافات المنسقة عند توفرها."
                      />
                    )}
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
                      <HomeRailSkeleton variant="town" />
                    ) : isHomeConsoleError ? (
                      <ErrorState
                        title={lang === 'en' ? 'From the Town unavailable' : 'من البلدة غير متاح'}
                        message={lang === 'en' ? 'This row is temporarily unavailable.' : 'هذا الصف غير متاح مؤقتاً.'}
                      />
                    ) : fromTheTownRow && fromTheTownRow.items.length > 0 ? (
                      <div className={HOME_RAIL_CLASS}>
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
                    ) : (
                      <EmptyState
                        icon={SocialIcon}
                        titleEn="No town updates yet"
                        titleAr="لا توجد تحديثات من البلدة بعد"
                        messageEn="Literary community activity will appear here when available."
                        messageAr="سيظهر هنا نشاط المجتمع الأدبي عند توفره."
                      />
                    )}
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
