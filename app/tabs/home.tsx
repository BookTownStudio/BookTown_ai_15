// app/tabs/home.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import DiscoveryEntryCard from '../../components/content/DiscoveryEntryCard.tsx';
import QuoteSnippetCard from '../../components/content/QuoteSnippetCard.tsx';
import { mockQuoteOfTheDay } from '../../data/mocks.ts';
import { useUserShelves, useShelfEntries } from '../../lib/hooks/useUserShelves.ts';
import { useQuickRecs } from '../../lib/hooks/useQuickRecs.ts';
import BookCard from '../../components/content/BookCard.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useLiveBookSearch } from '../../lib/hooks/useLiveBookSearch.ts';
import CollapsibleSection from '../../components/ui/CollapsibleSection.tsx';
import HomeSearchBar from '../../components/content/HomeSearchBar.tsx';
import CameraCaptureModal from '../../components/modals/CameraCaptureModal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { useSearchHistory } from '../../lib/hooks/useSearchHistory.ts';
import { useIdentifyBook } from '../../lib/hooks/useAiMutations.ts';
import { BookCardSkeleton } from '../../components/ui/Skeletons.tsx';
import PageTransition from '../../components/ui/PageTransition.tsx';
import PageShell from '../../components/layout/PageShell.tsx';
import { useToast } from '../../store/toast.tsx';
import { useBookIngestion } from '../../lib/hooks/useBookIngestion.ts';
import SearchResultCard, {
  SearchResultDTO
} from '../../components/content/SearchResultCard.tsx';
import { staggerContainer, listItemVariants } from '../../lib/motion.ts';
import { cn } from '../../lib/utils.ts';
import { useCurrentlyReading } from '../../lib/hooks/useCurrentlyReading.ts';

/* -------------------------------
   Constants
-------------------------------- */
const EBOOK_ONLY_STORAGE_KEY = 'booktown.search.ebookOnly';
const CURRENTLY_READING_ID = 'currently-reading';

/* -------------------------------
   Home Screen
-------------------------------- */
const HomeScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate, currentView, resetTokens } = useNavigation();
  const { showToast } = useToast();

  useUserShelves(); 
  useQuickRecs();   

  /** 
   * 🔒 Mirror Membership Authority
   * We use reading_progress for recency-sorted items but 
   * logically it represents the 'currently-reading' shelf.
   */
  const { items: continueReadingItems, isLoading: isProgressLoading } = useCurrentlyReading(8);
  const { addToHistory } = useSearchHistory();
  const { mutateAsync: ingestBook } = useBookIngestion();

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* -------------------------------
     Collapsible section state
  -------------------------------- */
  const [isContinueOpen, setIsContinueOpen] = useState(true);
  const [isRecsOpen, setIsRecsOpen] = useState(true);
  const [isTrendingOpen, setIsTrendingOpen] = useState(true);

  /* -------------------------------
     🔒 HOME RESET CONTRACT
  -------------------------------- */
  useEffect(() => {
    setSearchQuery('');
    setIsSearching(false);
    setBusyId(null);
  }, [resetTokens.home]);

  /* -------------------------------
     Ebook-only filter (persisted)
  -------------------------------- */
  const [ebookOnly, setEbookOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EBOOK_ONLY_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(EBOOK_ONLY_STORAGE_KEY, String(ebookOnly));
    } catch {}
  }, [ebookOnly]);

  const { data: searchResults, isLoading: isSearchingBooks } =
    useLiveBookSearch(searchQuery, ebookOnly);

  const { isLoading: isAnalyzingImage } = useIdentifyBook();

  /* -------------------------------
     Open Search Result
  -------------------------------- */
  const handleOpenResult = async (result: SearchResultDTO) => {
    if (busyId) return;

    try {
      setBusyId(result.externalId);

      const res = await ingestBook({
        bookId: result.externalId,
        source: result.source,
        rawBook: result
      });

      const canonicalId = res?.editionId || res?.bookId;
      if (!canonicalId) throw new Error('Missing canonical ID');

      setIsSearching(false);

      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: { bookId: canonicalId, from: currentView }
      });
    } catch (err) {
      console.error('[HOME][INGEST_FAILED]', err);
      showToast(lang === 'en' ? 'Failed to open book.' : 'فشل فتح الكتاب.');
    } finally {
      setBusyId(null);
    }
  };

  /* -------------------------------
     Render Search Results
  -------------------------------- */
  const renderSearchResults = () => {
    const validResults: SearchResultDTO[] =
      (searchResults || []).map((b: any) => ({
        externalId: b.id,
        source:
          b.source ||
          (b.id?.startsWith('gb_') ? 'googleBooks' : 'openLibrary'),
        titleEn: b.titleEn || b.title,
        titleAr: b.titleAr,
        authorEn: b.authorEn || b.author,
        authorAr: b.authorAr,
        coverUrl: b.coverUrl,
        isEbookAvailable: b.isEbookAvailable
      }));

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

        {!isSearchingBooks && validResults.length > 0 && (
          <div className="space-y-3">
            {validResults.map(result => (
              <SearchResultCard
                key={result.externalId}
                result={result}
                lang={lang}
                isBusy={busyId === result.externalId}
                onOpen={handleOpenResult}
                onAdd={handleOpenResult}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageShell scrollable>
      <AppNav titleEn="BookTown" titleAr="بوكتاون" />

      <main className="flex-grow pt-24 pb-20">
        <PageTransition className="container px-4 md:px-6">
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
                <button
                  onClick={() => setEbookOnly(v => !v)}
                  className={cn(
                    "px-4 py-2 rounded-full border text-sm font-semibold transition-all active:scale-95 shadow-sm",
                    ebookOnly
                      ? "bg-primary text-white border-primary"
                      : "bg-white/5 text-slate-500 border-black/10 dark:border-white/10"
                  )}
                >
                  {lang === 'en' ? 'Ebooks' : 'كتب إلكترونية'}
                </button>
              </div>
              {renderSearchResults()}
            </div>
          ) : (
            <div className="space-y-12 mt-8">
              <DiscoveryEntryCard
                onClick={() => navigate({ type: 'stack', id: 'discovery' })}
              />

              {/* 📖 Continue Reading (Mirror of currently-reading shelf) */}
              <CollapsibleSection
                titleEn="Continue Reading"
                titleAr="أكمل القراءة"
                isOpen={isContinueOpen}
                onToggle={() => setIsContinueOpen(v => !v)}
              >
                {isProgressLoading ? (
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

              {/* ⭐ Recommended */}
              <CollapsibleSection
                titleEn="Recommended For You"
                titleAr="موصى به لك"
                isOpen={isRecsOpen}
                onToggle={() => setIsRecsOpen(v => !v)}
              >
                <div className="flex gap-4 py-4 overflow-x-auto scrollbar-hide snap-x">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="snap-start">
                      <BookCardSkeleton layout="list" />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                titleEn="Trending & New Releases"
                titleAr="الرائج والجديد"
                isOpen={isTrendingOpen}
                onToggle={() => setIsTrendingOpen(v => !v)}
              >
                <div className="flex gap-4 py-4 overflow-x-auto scrollbar-hide snap-x">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="snap-start">
                      <BookCardSkeleton layout="list" />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <div className="max-w-xl mx-auto opacity-80">
                <QuoteSnippetCard quote={mockQuoteOfTheDay} />
              </div>
            </div>
          )}
        </PageTransition>
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
