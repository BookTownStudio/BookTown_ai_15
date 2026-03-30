// app/book-details.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageTransition from '../components/ui/PageTransition.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';

import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useToast } from '../store/toast.tsx';

import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import { useBookReviews } from '../lib/hooks/useBookReviews.ts';
import { useBookShelfStatus } from '../lib/hooks/useBookShelfStatus.ts';
import { useRelatedBooks } from '../lib/hooks/useRelatedBooks.ts';
import { useSubmitReview } from '../lib/hooks/useSubmitReview.ts';
import { useToggleBookOnShelf } from '../lib/hooks/useToggleBookOnShelf.ts';
import { useAuth } from '../lib/auth.tsx';

import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import ReviewCard from '../components/content/ReviewCard.tsx';
import SelectShelfModal from '../components/modals/SelectShelfModal.tsx';
import StarRatingInput from '../components/ui/StarRatingInput.tsx';
import GlassCard from '../components/ui/GlassCard.tsx';
import CanonicalCoverArtwork from '../components/content/CanonicalCoverArtwork.tsx';

import {
  XIcon,
  ShareIcon,
  EyeIcon,
  StarIcon,
  QuoteIcon,
  EllipsisIcon,
  ShelvesIcon,
  SendIcon,
  EditIcon
} from '../components/icons';

import { cn } from '../lib/utils.ts';
import { mockBooks } from '../data/mocks.ts';
import { SearchResultDTO } from '../types/bookSearch.ts';
import { ensureCanonicalBook } from '../lib/books/ensureCanonicalBook.ts';
import { resolveIngestionSource } from '../lib/books/searchNavigation.ts';
import { logBookEngineV2 } from '../lib/logging/bookEngineV2Log.ts';
import type { LibrarianRecommendationContext } from '../types/librarian.ts';

const MAX_REVIEW_LENGTH = 750;
const BOOK_PREPARE_TIMEOUT_MS = 12000;

function parseRecommendationContext(
  value: unknown
): LibrarianRecommendationContext | undefined {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!raw) return undefined;

  const suggestionSessionId =
    typeof raw.suggestionSessionId === 'string' && raw.suggestionSessionId.trim().length > 0
      ? raw.suggestionSessionId.trim()
      : '';
  const suggestionId =
    typeof raw.suggestionId === 'string' && raw.suggestionId.trim().length > 0
      ? raw.suggestionId.trim()
      : '';
  const rankPositionRaw = Number(raw.rankPosition);
  const rankPosition =
    Number.isFinite(rankPositionRaw) && rankPositionRaw > 0
      ? Math.trunc(rankPositionRaw)
      : 0;
  const modeRaw = typeof raw.mode === 'string' ? raw.mode.trim() : '';

  if (!suggestionSessionId || !suggestionId || !rankPosition || !modeRaw) {
    return undefined;
  }

  return {
    source: 'librarian',
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode: modeRaw as LibrarianRecommendationContext['mode'],
  };
}

const BookDetailsScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { mutate: toggleBook } = useToggleBookOnShelf();

  const params =
    currentView.type === 'immersive'
      ? (currentView.params as Record<string, unknown> | undefined) || {}
      : {};

  const originalBookId = typeof params?.bookId === 'string' ? params.bookId : undefined;
  const reviewAction = typeof params?.reviewAction === 'string' ? params.reviewAction : undefined;
  const pendingAction = typeof params?.pendingAction === 'string' ? params.pendingAction : 'NONE';
  const pendingShelfId = typeof params?.pendingShelfId === 'string' ? params.pendingShelfId : '';
  const pendingSearchResult = (params?.searchResult as SearchResultDTO | undefined) || undefined;
  const recommendationContext = parseRecommendationContext(params?.recommendationContext);
  const hasExternalPendingSearch = pendingSearchResult?.resultType === 'external';

  const [resolvedExternalBookId, setResolvedExternalBookId] = useState<string | null>(null);
  const [isResolvingExternal, setIsResolvingExternal] = useState(false);
  const [externalResolveFailed, setExternalResolveFailed] = useState(false);
  const [prepareTimedOut, setPrepareTimedOut] = useState(false);
  const ingestionStartedRef = useRef<string>('');
  const pendingActionRef = useRef<string>('');

  const randomBookId = useMemo(() => {
    if (originalBookId !== 'surprise') return null;
    const keys = Object.keys(mockBooks);
    return keys[Math.floor(Math.random() * keys.length)];
  }, [originalBookId]);

  const bookId =
    originalBookId === 'surprise'
      ? randomBookId
      : resolvedExternalBookId || (hasExternalPendingSearch ? undefined : originalBookId);

  const { data: book, isLoading: isBookLoading, isError, refetch } = useBookCatalog(bookId);
  const { data: reviews = [], isLoading: isReviewsLoading } = useBookReviews(bookId);
  const { isSavedOnPhysicalShelf = false } = useBookShelfStatus(bookId);
  
  useRelatedBooks(book || undefined);
  const submitReview = useSubmitReview();

  useEffect(() => {
    ingestionStartedRef.current = '';
    pendingActionRef.current = '';
    setResolvedExternalBookId(null);
    setIsResolvingExternal(false);
    setExternalResolveFailed(false);
    setPrepareTimedOut(false);
  }, [originalBookId, pendingSearchResult?.id, pendingAction, pendingShelfId]);

  useEffect(() => {
    if (pendingSearchResult) {
      logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
        phase: 'payload_received',
        resultType: pendingSearchResult.resultType,
        source: pendingSearchResult.source,
        id: pendingSearchResult.id,
        externalId: pendingSearchResult.externalId || null,
      });
      return;
    }

    if (originalBookId) {
      logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
        phase: 'payload_received',
        resultType: 'canonical',
        bookId: originalBookId,
      });
    }
  }, [originalBookId, pendingSearchResult]);

  useEffect(() => {
    if (!hasExternalPendingSearch || !pendingSearchResult) return;

    const source = resolveIngestionSource(pendingSearchResult);
    if (!source) {
      setExternalResolveFailed(true);
      showToast(lang === 'en' ? 'Invalid external source.' : 'مصدر خارجي غير صالح.');
      return;
    }

    const effectKey = `${pendingSearchResult.id}:${source}`;
    if (ingestionStartedRef.current === effectKey) return;
    ingestionStartedRef.current = effectKey;
    setIsResolvingExternal(true);
    setExternalResolveFailed(false);

    logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
      phase: 'invoke_ingest',
      source,
      id: pendingSearchResult.id,
      externalId: pendingSearchResult.externalId || pendingSearchResult.id,
    });

    ensureCanonicalBook({
      providerExternalId: pendingSearchResult.externalId || pendingSearchResult.id,
      source,
      rawBook: pendingSearchResult.rawBook || {
        id: pendingSearchResult.externalId || pendingSearchResult.id,
        externalId: pendingSearchResult.externalId || pendingSearchResult.id,
        source,
        title: pendingSearchResult.title,
        titleEn: pendingSearchResult.titleEn,
        titleAr: pendingSearchResult.titleAr,
        authors: pendingSearchResult.authors,
        authorEn: pendingSearchResult.authorEn,
        authorAr: pendingSearchResult.authorAr,
        description: pendingSearchResult.description,
        descriptionEn: pendingSearchResult.descriptionEn,
        descriptionAr: pendingSearchResult.descriptionAr,
      },
    })
      .then((result) => {
        const canonicalBookId = result?.canonicalBookId;
        if (!canonicalBookId) {
          throw new Error('INGESTION_NO_CANONICAL_BOOK_ID');
        }
        setResolvedExternalBookId(canonicalBookId);
        logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
          phase: 'ingest_resolved',
          status: result?.status || 'UNKNOWN',
          canonicalBookId,
          canonicalEditionId: result?.editionId || null,
        });
      })
      .catch((error) => {
        console.error('[BOOK_DETAILS][INGEST_ON_LOAD_FAILED]', error);
        setExternalResolveFailed(true);
        logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
          phase: 'ingest_failed',
          error: String(error),
          id: pendingSearchResult.id,
          source,
        });
        showToast(lang === 'en' ? 'Failed to load this book.' : 'تعذر تحميل هذا الكتاب.');
      })
      .finally(() => {
        setIsResolvingExternal(false);
      });
  }, [
    hasExternalPendingSearch,
    lang,
    pendingSearchResult,
    showToast,
  ]);

  const isPreparingBook =
    (isResolvingExternal && !resolvedExternalBookId) ||
    (!bookId && hasExternalPendingSearch && !externalResolveFailed) ||
    (Boolean(bookId) && (isBookLoading || book === null) && !isError);

  useEffect(() => {
    if (!isPreparingBook || externalResolveFailed) {
      setPrepareTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setPrepareTimedOut(true);
      logBookEngineV2('BOOK_DETAILS_V2_PREPARE_TIMEOUT', {
        bookId: bookId || null,
        originalBookId: originalBookId || null,
        clickedResultId: pendingSearchResult?.id || null,
        resultType: pendingSearchResult?.resultType || 'canonical',
        workType: pendingSearchResult?.workType || null,
      });
    }, BOOK_PREPARE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    bookId,
    book,
    externalResolveFailed,
    hasExternalPendingSearch,
    isBookLoading,
    isError,
    isPreparingBook,
    isResolvingExternal,
    originalBookId,
    pendingSearchResult?.id,
    pendingSearchResult?.resultType,
    pendingSearchResult?.workType,
    resolvedExternalBookId,
  ]);

  const handlePrepareTimeoutRetry = () => {
    setPrepareTimedOut(false);
    if (bookId) {
      void refetch();
      return;
    }
    handleBack();
  };

  useEffect(() => {
    if (!book || !bookId) return;
    if (!pendingAction || pendingAction === 'NONE') return;

    const actionKey = `${pendingAction}:${bookId}:${pendingShelfId}`;
    if (pendingActionRef.current === actionKey) return;
    pendingActionRef.current = actionKey;

    if (pendingAction === 'ADD_TO_SHELF') {
      if (!pendingShelfId) return;

      toggleBook(
        {
          shelfId: pendingShelfId,
          bookId,
          book,
          recommendationContext,
        },
        {
          onSuccess: () => {
            showToast(lang === 'en' ? 'Book added to shelf.' : 'تمت إضافة الكتاب إلى الرف.');
            const fromView = params?.from;
            if (fromView && typeof fromView === 'object') {
              navigate(fromView as any, { replace: true });
            }
          },
          onError: () => {
            showToast(lang === 'en' ? 'Failed to add book.' : 'فشل إضافة الكتاب.');
          },
        }
      );
      return;
    }

    if (pendingAction === 'ATTACH_TO_POST') {
      const fromView = params?.from;
      if (!fromView || typeof fromView !== 'object') return;

      const fromRecord = fromView as Record<string, unknown>;
      const existingParams =
        fromRecord.params && typeof fromRecord.params === 'object'
          ? (fromRecord.params as Record<string, unknown>)
          : {};

      navigate(
        {
          ...(fromRecord as any),
          params: {
            ...existingParams,
            attachedBook: {
              id: book.id,
              titleEn: book.titleEn,
              titleAr: book.titleAr,
              authorEn: book.authorEn,
              authorAr: book.authorAr,
              coverUrl: book.coverUrl,
            },
          },
        } as any,
        { replace: true }
      );
    }
  }, [
    book,
    bookId,
    lang,
    navigate,
    params,
    pendingAction,
    pendingShelfId,
    recommendationContext,
    showToast,
    toggleBook,
  ]);

  const existingUserReview = useMemo(() => {
    if (!user?.uid || !Array.isArray(reviews)) return null;
    return reviews.find(r => r.userId === user.uid) || null;
  }, [reviews, user?.uid]);

  const [isShelfModalOpen, setIsShelfModalOpen] = useState(false);
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  useEffect(() => {
    if (existingUserReview && isEditingReview) {
      setReviewText(existingUserReview.text || '');
      setUserRating(existingUserReview.rating || 0);
    } else if (!isEditingReview && !isAddingReview) {
      setReviewText('');
      setUserRating(0);
    }
  }, [existingUserReview, isEditingReview, isAddingReview]);

  useEffect(() => {
    if (reviewAction !== 'edit') return;
    if (!existingUserReview) return;
    setIsAddingReview(false);
    setIsEditingReview(true);
  }, [reviewAction, existingUserReview]);

  const bookSearchTruth = book as
    | (Record<string, unknown> & {
        ebookAttachmentId?: unknown;
        ebookStoragePath?: unknown;
        downloadable?: unknown;
      })
    | null;
  const hasReadableEbook = Boolean(
    bookSearchTruth?.ebookAttachmentId ||
      bookSearchTruth?.ebookStoragePath ||
      bookSearchTruth?.downloadable
  );

  const handleBack = () => {
    const from = currentView.type === 'immersive' ? currentView.params?.from : null;
    navigate(from || { type: 'tab', id: 'home' });
  };

  const handleShare = () => {
    if (!book || !navigator.share) return;
    navigator.share({
      title: lang === 'en' ? book.titleEn : book.titleAr,
      url: window.location.href
    }).catch(() => {});
  };

  const handlePublishReview = async () => {
    if (!bookId || !user?.uid) return;
    if (!reviewText.trim() || userRating <= 0) {
        showToast(lang === 'en' ? 'Rating and text required' : 'التقييم والنص مطلوبان');
        return;
    }

    try {
      await submitReview.submitReviewAsync({
        bookId,
        rating: userRating,
        text: reviewText.trim(),
        recommendationContext,
      });
      setIsAddingReview(false);
      setIsEditingReview(false);
      showToast(lang === 'en' ? 'Published.' : 'تم النشر.');
    } catch (err) {
      showToast('Error saving review.');
    }
  };

  if (isResolvingExternal && !resolvedExternalBookId) {
    if (prepareTimedOut) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
          <ErrorState
            title={lang === 'en' ? 'Book timed out' : 'انتهت مهلة تحميل الكتاب'}
            message={
              lang === 'en'
                ? 'This book took too long to prepare. Please try again or return to search.'
                : 'استغرق تجهيز هذا الكتاب وقتًا طويلًا. حاول مرة أخرى أو ارجع إلى البحث.'
            }
            onRetry={handlePrepareTimeoutRetry}
          />
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4">
        <LoadingSpinner />
        <BilingualText className="text-white/40 !text-sm">
          {lang === 'en' ? 'Preparing book…' : 'جاري تجهيز الكتاب…'}
        </BilingualText>
      </div>
    );
  }

  if (externalResolveFailed) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
        <ErrorState
          title={lang === 'en' ? 'Book not found' : 'الكتاب غير موجود'}
          message={
            lang === 'en'
              ? 'This book could not be resolved into the canonical catalog.'
              : 'تعذر تحويل هذا الكتاب إلى الكتالوج الأساسي.'
          }
          onRetry={handleBack}
        />
      </div>
    );
  }

  if (isBookLoading) {
    if (prepareTimedOut) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
          <ErrorState
            title={lang === 'en' ? 'Book timed out' : 'انتهت مهلة تحميل الكتاب'}
            message={
              lang === 'en'
                ? 'This book took too long to load. Please try again.'
                : 'استغرق تحميل هذا الكتاب وقتًا طويلًا. حاول مرة أخرى.'
            }
            onRetry={handlePrepareTimeoutRetry}
          />
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4">
        <LoadingSpinner />
        <BilingualText className="text-white/40 !text-sm">
          {lang === 'en' ? 'Loading book…' : 'جاري تحميل الكتاب…'}
        </BilingualText>
      </div>
    );
  }

  if (isError || (!bookId && !hasExternalPendingSearch)) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
        <ErrorState
          title={lang === 'en' ? 'Book not found' : 'الكتاب غير موجود'}
          message={
            lang === 'en'
              ? 'This book is not available in the canonical catalog.'
              : 'هذا الكتاب غير متاح في الكتالوج الأساسي.'
          }
          onRetry={handleBack}
        />
      </div>
    );
  }

  if (!bookId && hasExternalPendingSearch) {
    if (prepareTimedOut) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
          <ErrorState
            title={lang === 'en' ? 'Book timed out' : 'انتهت مهلة تحميل الكتاب'}
            message={
              lang === 'en'
                ? 'This book could not be prepared in time. Please try again or return to search.'
                : 'تعذر تجهيز هذا الكتاب في الوقت المناسب. حاول مرة أخرى أو ارجع إلى البحث.'
            }
            onRetry={handlePrepareTimeoutRetry}
          />
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4">
        <LoadingSpinner />
        <BilingualText className="text-white/40 !text-sm">
          {lang === 'en' ? 'Preparing book…' : 'جاري تجهيز الكتاب…'}
        </BilingualText>
      </div>
    );
  }

  if (book === null) {
    if (prepareTimedOut) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
          <ErrorState
            title={lang === 'en' ? 'Book unavailable' : 'الكتاب غير متاح'}
            message={
              lang === 'en'
                ? 'This book did not finish materializing. Please try again from search.'
                : 'لم يكتمل تجهيز هذا الكتاب. حاول مرة أخرى من البحث.'
            }
            onRetry={handlePrepareTimeoutRetry}
          />
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4">
        <LoadingSpinner />
        <BilingualText className="text-white/40 !text-sm">
          {lang === 'en' ? 'Preparing book…' : 'جاري تجهيز الكتاب…'}
        </BilingualText>
      </div>
    );
  }

  const showComposer = isAddingReview || isEditingReview;

  return (
    <PageTransition className="h-screen w-full overflow-y-auto bg-black text-white">
      <header className="sticky top-0 z-50 bg-gradient-to-b from-black via-black/90 to-transparent">
        <div className="app-frame__inner px-4 md:px-0">
          <div className="app-rail app-rail--default flex h-20 items-center justify-between">
            <Button variant="icon" onClick={handleBack} className="!bg-white/10 backdrop-blur-md !p-3">
              <XIcon className="h-6 w-6" />
            </Button>
            <Button variant="icon" className="!bg-white/10 backdrop-blur-md !p-3">
              <EllipsisIcon className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </header>

      <div className="app-frame__inner px-6 md:px-0">
        <main className="app-rail app-rail--default relative z-10 space-y-10 pb-24">
          {/* Hero */}
          <section className={cn('flex items-start gap-5 lg:gap-8', isRTL && 'flex-row-reverse')}>
            <div className="w-32 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-800 shadow-2xl aspect-[2/3] lg:w-[180px]">
              <CanonicalCoverArtwork
                title={lang === 'en' ? book.titleEn : book.titleAr}
                author={lang === 'en' ? book.authorEn : book.authorAr}
                coverUrl={book.coverUrl}
                coverMode={book.coverMode}
                fallbackCover={book.fallbackCover}
                variant="poster"
                imageClassName="h-full w-full object-cover"
              />
            </div>
            <div className={cn('min-w-0 flex-1 self-start pt-1 lg:max-w-[calc(100%-212px)]', isRTL && 'text-right')}>
              <BilingualText role="H1" className="!text-2xl !font-bold leading-tight md:!text-4xl">
                {lang === 'en' ? book.titleEn : book.titleAr}
              </BilingualText>
              <p className="mt-1.5 text-base text-white/60">{lang === 'en' ? book.authorEn : book.authorAr}</p>
              <div className={cn('mt-4 flex flex-wrap items-center gap-2', isRTL && 'justify-end')}>
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  <StarIcon className="mr-1.5 h-3 w-3 fill-current text-yellow-400" />
                  <span className="mr-1.5 text-sm font-black">{(book.rating || 0).toFixed(1)}</span>
                  <span className="text-[10px] tracking-tighter text-white/30">({(book.ratingsCount || 0).toLocaleString()})</span>
                </div>
              </div>
            </div>
          </section>

          {/* Action Row */}
          <section className="grid grid-cols-4 gap-3 lg:gap-4">
            <button
              onClick={() => setIsShelfModalOpen(true)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3',
                isSavedOnPhysicalShelf && 'bg-accent/10 text-accent'
              )}
            >
              <ShelvesIcon className="h-6 w-6" />
              <span className="hidden text-xs font-semibold tracking-wide text-white/70 lg:block">
                {lang === 'en' ? 'Shelf' : 'الرف'}
              </span>
            </button>
            <button className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3">
              <QuoteIcon className="h-6 w-6" />
              <span className="hidden text-xs font-semibold tracking-wide text-white/70 lg:block">
                {lang === 'en' ? 'Quotes' : 'اقتباسات'}
              </span>
            </button>
            <button
              onClick={handleShare}
              className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3"
            >
              <ShareIcon className="h-6 w-6" />
              <span className="hidden text-xs font-semibold tracking-wide text-white/70 lg:block">
                {lang === 'en' ? 'Share' : 'مشاركة'}
              </span>
            </button>
            <button
              onClick={() =>
                hasReadableEbook
                  && navigate({
                    type: 'immersive',
                    id: 'reader',
                    params: { bookId, from: currentView, recommendationContext }
                  })
              }
              disabled={!hasReadableEbook}
              className={cn(
                'flex aspect-square items-center justify-center rounded-2xl border transition-all lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3',
                hasReadableEbook
                  ? 'border-accent bg-accent text-black shadow-lg shadow-accent/25 ring-1 ring-accent/40'
                  : 'border-white/10 bg-white/5 opacity-20'
              )}
            >
              <EyeIcon className={cn('h-6 w-6', hasReadableEbook && 'h-6.5 w-6.5')} />
              <span className={cn('hidden text-xs font-semibold tracking-wide lg:block', hasReadableEbook ? 'text-black/80' : 'text-white/70')}>
                {lang === 'en' ? 'Read' : 'اقرأ'}
              </span>
            </button>
          </section>

          {/* Summary */}
          <section className="space-y-3">
            <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Summary' : 'الملخص'}</BilingualText>
            <p className="text-base leading-relaxed text-white/80 font-serif">{lang === 'en' ? book.descriptionEn : book.descriptionAr || book.descriptionEn}</p>
          </section>

          {/* Reviews */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Critiques' : 'المراجعات'}</BilingualText>
              {user && !existingUserReview && !showComposer && (
                <Button variant="ghost" onClick={() => setIsAddingReview(true)} className="!h-9 !shrink-0 !rounded-full border border-white/10 !px-4 !text-xs">
                  <EditIcon className="mr-2 h-3 w-3" />
                  {lang === 'en' ? 'Write a review' : 'اكتب مراجعة'}
                </Button>
              )}
            </div>

            {user && showComposer && (
              <GlassCard className="!bg-white/5 !p-0 overflow-hidden border-white/10 animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                  <BilingualText className="text-[10px] font-black uppercase tracking-widest text-white/40">{isEditingReview ? 'Edit Review' : 'New Review'}</BilingualText>
                  <StarRatingInput rating={userRating} onRatingChange={setUserRating} size="sm" />
                </div>
                <div className="p-6">
                  <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="..." className="w-full resize-none bg-transparent text-base text-white font-serif focus:outline-none" rows={3} autoFocus />
                  <div className="mt-4 flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => { setIsAddingReview(false); setIsEditingReview(false); }} className="!text-xs">Cancel</Button>
                    <Button variant="primary" disabled={submitReview.isPending} onClick={handlePublishReview} className="!h-9 !rounded-full !px-6 !text-sm">Save</Button>
                  </div>
                </div>
              </GlassCard>
            )}

            <div className="space-y-4">
              {reviews.map(r => (
                <ReviewCard key={`${r.bookId}_${r.userId}`} review={r} onEdit={() => setIsEditingReview(true)} />
              ))}
            </div>
          </section>
        </main>
      </div>

      <SelectShelfModal isOpen={isShelfModalOpen} onClose={() => setIsShelfModalOpen(false)} bookId={bookId!} book={book} recommendationContext={recommendationContext} />
    </PageTransition>
  );
};

export default BookDetailsScreen;
