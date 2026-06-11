// app/book-details.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageTransition from '../components/ui/PageTransition.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';

import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useToast } from '../store/toast.tsx';

import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import { useBookSemanticGraph } from '../lib/hooks/useBookSemanticGraph.ts';
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
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal.tsx';
import StarRatingInput from '../components/ui/StarRatingInput.tsx';
import GlassCard from '../components/ui/GlassCard.tsx';
import CanonicalCoverArtwork from '../components/content/CanonicalCoverArtwork.tsx';
import OtherEditionsSheet from '../components/books/OtherEditionsSheet.tsx';

import {
  ShareIcon,
  EyeIcon,
  StarIcon,
  QuoteIcon,
  EllipsisIcon,
  ShelvesIcon,
  BookIcon,
  BasketIcon,
  ChevronLeftIcon,
} from '../components/icons';

import { cn } from '../lib/utils.ts';
import { SearchResultDTO } from '../types/bookSearch.ts';
import {
  buildPendingSearchBookView,
  toBookDetailsRuntimeDTO,
  type BookDetailsRuntimeDTO,
} from '../types/bookRuntime.ts';
import { ensureCanonicalBook } from '../lib/books/ensureCanonicalBook.ts';
import { parseExternalRouteBookId, resolveIngestionSource } from '../lib/books/searchNavigation.ts';
import { logBookEngineV2 } from '../lib/logging/bookEngineV2Log.ts';
import type { LibrarianRecommendationContext } from '../types/librarian.ts';
import type { GraphRelationshipType } from '../types/literaryGraph.ts';
import { useReaderProgress } from '../lib/hooks/useReaderProgress.ts';
import { useDeleteUserUploadBook } from '../lib/hooks/useDeleteUserUploadBook.ts';
import { clearOfflineEbook } from './lib/offline/offlineManager.ts';

const MAX_REVIEW_LENGTH = 750;
const BOOK_PREPARE_TIMEOUT_MS = 12000;
const INITIAL_REVIEW_COUNT = 3;
type PrimaryBookAction = 'continue' | 'read' | 'get';
type AcquisitionSheetTrigger = 'editions' | 'get' | null;

function hasReadableAttachmentAuthority(value: BookDetailsRuntimeDTO | null | undefined): boolean {
  if (!value) return false;
  return value.readerAuthority?.hasReadableAttachment === true;
}

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

const RELATIONSHIP_LABELS: Record<GraphRelationshipType, { en: string; ar: string }> = {
  influenced_by: { en: 'Influenced by', ar: 'متأثر بـ' },
  influenced: { en: 'Influenced', ar: 'أثّر في' },
  same_tradition: { en: 'Same tradition', ar: 'التقليد نفسه' },
  same_movement: { en: 'Same movement', ar: 'الحركة نفسها' },
  same_period: { en: 'Same period', ar: 'الفترة نفسها' },
  responds_to: { en: 'Responds to', ar: 'يرد على' },
  similar_theme: { en: 'Similar theme', ar: 'ثيمة مشابهة' },
  philosophical_relation: { en: 'Philosophical relation', ar: 'صلة فلسفية' },
  historical_relation: { en: 'Historical relation', ar: 'صلة تاريخية' },
  thematic_affinity: { en: 'Thematic affinity', ar: 'تقارب موضوعي' },
  same_cycle: { en: 'Same cycle', ar: 'الدورة نفسها' },
  literary_response_to: { en: 'Literary response', ar: 'استجابة أدبية' },
  contemporary_of: { en: 'Contemporary of', ar: 'معاصر لـ' },
  same_form: { en: 'Same form', ar: 'الشكل نفسه' },
  same_subform: { en: 'Same subform', ar: 'الشكل الفرعي نفسه' },
};

function formatOntologyLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const BookDetailsScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { mutate: toggleBook } = useToggleBookOnShelf();
  const deleteUploadMutation = useDeleteUserUploadBook();

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
  const directExternalRoute = useMemo(
    () => (!pendingSearchResult ? parseExternalRouteBookId(originalBookId) : null),
    [originalBookId, pendingSearchResult]
  );
  const hasExternalHydrationCandidate = hasExternalPendingSearch || Boolean(directExternalRoute);

  const [resolvedExternalBookId, setResolvedExternalBookId] = useState<string | null>(null);
  const [isResolvingExternal, setIsResolvingExternal] = useState(false);
  const [externalResolveFailed, setExternalResolveFailed] = useState(false);
  const [prepareTimedOut, setPrepareTimedOut] = useState(false);
  const [isAcquisitionSheetOpen, setIsAcquisitionSheetOpen] = useState(false);
  const [acquisitionSheetTrigger, setAcquisitionSheetTrigger] = useState<AcquisitionSheetTrigger>(null);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isDeleteUploadModalOpen, setIsDeleteUploadModalOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const ingestionStartedRef = useRef<string>('');
  const resolvedCanonicalRef = useRef<string | null>(null);
  const pendingActionRef = useRef<string>('');

  const isSurpriseRoute = originalBookId === 'surprise';
  const bookId =
    isSurpriseRoute
      ? undefined
      : resolvedExternalBookId || (hasExternalHydrationCandidate ? undefined : originalBookId);

  const { data: book, isLoading: isBookLoading, isError, refetch } = useBookCatalog(bookId);
  const { data: reviews = [] } = useBookReviews(bookId);
  const { progress: readerProgress } = useReaderProgress(bookId);
  const {
    isSavedOnPhysicalShelf = false,
  } = useBookShelfStatus(bookId);
  const bookDetails = useMemo(
    () => (book ? toBookDetailsRuntimeDTO(book) : null),
    [book]
  );
  const { data: semanticGraph } = useBookSemanticGraph(bookId, {
    enabled: Boolean(bookId && bookDetails?.semanticGraphEligible === true),
    limit: 12,
  });
  
  useRelatedBooks(book || undefined);
  const submitReview = useSubmitReview();

  useEffect(() => {
    ingestionStartedRef.current = '';
    resolvedCanonicalRef.current = null;
    pendingActionRef.current = '';
    setResolvedExternalBookId(null);
    setIsResolvingExternal(false);
    setExternalResolveFailed(false);
    setPrepareTimedOut(false);
    setIsAcquisitionSheetOpen(false);
    setAcquisitionSheetTrigger(null);
    setIsShareMenuOpen(false);
    setIsMoreMenuOpen(false);
  }, [originalBookId, pendingSearchResult?.id, pendingAction, pendingShelfId]);

  useEffect(() => {
    if (!isShareMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (shareMenuRef.current?.contains(target)) return;
      if (shareButtonRef.current?.contains(target)) return;
      setIsShareMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isShareMenuOpen]);

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
        resultType: directExternalRoute ? 'external_direct' : 'canonical',
        bookId: originalBookId,
        source: directExternalRoute?.source || null,
        provider: directExternalRoute?.provider || null,
        externalId: directExternalRoute?.providerExternalId || null,
      });
    }
  }, [directExternalRoute, originalBookId, pendingSearchResult]);

  useEffect(() => {
    if (!hasExternalPendingSearch && !directExternalRoute) return;
    if (resolvedCanonicalRef.current || resolvedExternalBookId) return;

    const source = pendingSearchResult
      ? resolveIngestionSource(pendingSearchResult)
      : directExternalRoute?.source || null;
    const providerExternalId =
      pendingSearchResult?.externalId ||
      pendingSearchResult?.id ||
      directExternalRoute?.providerExternalId ||
      '';

    if (!source) {
      setExternalResolveFailed(true);
      logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
        phase: 'ingest_unsupported_source',
        id: pendingSearchResult?.id || originalBookId || null,
        provider: directExternalRoute?.provider || null,
      });
      return;
    }

    const effectKey = `${providerExternalId}:${source}`;
    if (ingestionStartedRef.current === effectKey) return;
    ingestionStartedRef.current = effectKey;
    setIsResolvingExternal(true);
    setExternalResolveFailed(false);

    logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
      phase: 'invoke_ingest',
      source,
      id: pendingSearchResult?.id || originalBookId || null,
      externalId: providerExternalId || null,
    });

    const ensureParams = pendingSearchResult
      ? {
          providerExternalId,
          source,
          rawBook: pendingSearchResult.rawBook || {
            id: providerExternalId,
            externalId: providerExternalId,
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
        }
      : {
          bookId: originalBookId || '',
        };

    ensureCanonicalBook(ensureParams)
      .then((result) => {
        if (resolvedCanonicalRef.current && resolvedCanonicalRef.current === resolvedExternalBookId) {
          return;
        }

        const canonicalBookId = result?.canonicalBookId;
        if (!canonicalBookId) {
          throw new Error('INGESTION_NO_CANONICAL_BOOK_ID');
        }
        resolvedCanonicalRef.current = canonicalBookId;
        setResolvedExternalBookId(canonicalBookId);
        setExternalResolveFailed(false);
        logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
          phase: 'ingest_resolved',
          status: result?.status || 'UNKNOWN',
          canonicalBookId,
          canonicalEditionId: result?.editionId || null,
        });
      })
      .catch((error) => {
        if (resolvedCanonicalRef.current) {
          logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
            phase: 'ingest_failed_ignored_after_resolution',
            error: String(error),
            canonicalBookId: resolvedCanonicalRef.current,
            id: pendingSearchResult?.id || originalBookId || null,
            source,
          });
          return;
        }
        console.error('[BOOK_DETAILS][INGEST_ON_LOAD_FAILED]', error);
        setExternalResolveFailed(true);
        logBookEngineV2('BOOK_DETAILS_V2_INGEST_TRIGGER', {
          phase: 'ingest_failed',
          error: String(error),
          id: pendingSearchResult?.id || originalBookId || null,
          source,
        });
        showToast(lang === 'en' ? 'Failed to load this book.' : 'تعذر تحميل هذا الكتاب.');
      })
      .finally(() => {
        setIsResolvingExternal(false);
      });
  }, [
    directExternalRoute,
    hasExternalPendingSearch,
    lang,
    originalBookId,
    pendingSearchResult,
    resolvedExternalBookId,
    showToast,
  ]);

  const isPreparingBook =
    (isResolvingExternal && !resolvedExternalBookId) ||
    (!bookId && hasExternalHydrationCandidate && !externalResolveFailed) ||
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
    hasExternalHydrationCandidate,
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
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasReviewComposerInteraction, setHasReviewComposerInteraction] = useState(false);

  useEffect(() => {
    if (existingUserReview && isEditingReview) {
      setReviewText(existingUserReview.text || '');
      setUserRating(existingUserReview.rating || 0);
    } else if (!isEditingReview && !isAddingReview) {
      setReviewText('');
      setUserRating(0);
      setHasReviewComposerInteraction(false);
    }
  }, [existingUserReview, isEditingReview, isAddingReview]);

  useEffect(() => {
    if (reviewAction !== 'edit') return;
    if (!existingUserReview) return;
    setIsAddingReview(false);
    setIsEditingReview(true);
  }, [reviewAction, existingUserReview]);

  const hasReadableAttachment = hasReadableAttachmentAuthority(bookDetails);
  const bookRecord =
    book && typeof book === 'object'
      ? (book as Record<string, unknown>)
      : null;
  const canDeleteUploadedBook = Boolean(
    bookId &&
      user?.uid &&
      bookRecord?.source === 'user_upload' &&
      bookRecord?.ownerUid === user.uid
  );
  const hasActiveReadingProgress = Boolean(
    readerProgress?.exists &&
      (
        readerProgress.status_state === 'reading' ||
        readerProgress.status_state === 'paused' ||
        readerProgress.status_state === 'rereading'
      )
  );
  const primaryAction: PrimaryBookAction = hasActiveReadingProgress
    ? 'continue'
    : hasReadableAttachment
    ? 'read'
    : 'get';
  const primaryActionLabel =
    primaryAction === 'continue'
      ? (lang === 'en' ? 'Read' : 'اقرأ')
      : primaryAction === 'read'
      ? (lang === 'en' ? 'Read' : 'اقرأ')
      : (lang === 'en' ? 'Get' : 'احصل عليه');
  const readingStatusLabel =
    hasActiveReadingProgress
      ? (lang === 'en' ? 'Reading' : 'قيد القراءة')
      : readerProgress?.status_state === 'completed'
      ? (lang === 'en' ? 'Completed' : 'مكتمل')
      : readerProgress?.status_state === 'abandoned'
      ? (lang === 'en' ? 'Paused' : 'متوقف')
      : (lang === 'en' ? 'Not started' : 'لم يبدأ');

  const displayBook = useMemo(() => {
    if (bookDetails) return bookDetails;
    if (!pendingSearchResult) return null;

    return buildPendingSearchBookView(pendingSearchResult, bookId);
  }, [bookDetails, bookId, pendingSearchResult]);

  const canonicalBookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const id = bookId || originalBookId;
    return id ? `${window.location.origin}/books/${encodeURIComponent(id)}` : window.location.href;
  }, [bookId, originalBookId]);

  const handleBack = () => {
    const from = currentView.type === 'immersive' ? currentView.params?.from : null;
    navigate(
      from && typeof from === 'object' ? (from as any) : { type: 'tab', id: 'home' },
      { replace: true }
    );
  };

  const handleCopyLink = async () => {
    if (!displayBook) {
      showToast(lang === 'en' ? 'Unable to share this book.' : 'تعذرت مشاركة هذا الكتاب.');
      return;
    }

    try {
      setIsShareMenuOpen(false);
      await navigator.clipboard.writeText(canonicalBookUrl);
      showToast(lang === 'en' ? 'Link copied.' : 'تم نسخ الرابط.');
    } catch {
      showToast(lang === 'en' ? 'Unable to copy link.' : 'تعذر نسخ الرابط.');
    }
  };

  const handleShareExternally = async () => {
    if (!displayBook) {
      showToast(lang === 'en' ? 'Unable to share this book.' : 'تعذرت مشاركة هذا الكتاب.');
      return;
    }

    setIsShareMenuOpen(false);
    const title = lang === 'en' ? displayBook.titleEn : displayBook.titleAr || displayBook.titleEn;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: canonicalBookUrl
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        showToast(lang === 'en' ? 'Unable to share externally.' : 'تعذرت المشاركة خارجياً.');
        return;
      }
    }

    showToast(lang === 'en' ? 'External sharing is not available in this browser.' : 'المشاركة الخارجية غير متاحة في هذا المتصفح.');
  };

  const handlePostToTown = () => {
    if (!bookId || !displayBook) return;

    setIsShareMenuOpen(false);
    navigate({
      type: 'immersive',
      id: 'postComposer',
      params: {
        from: currentView,
        attachedBook: {
          id: bookId,
          titleEn: displayBook.titleEn,
          titleAr: displayBook.titleAr,
          authorEn: displayBook.authorEn,
          authorAr: displayBook.authorAr,
          coverUrl: displayBook.coverUrl,
        },
      },
    });
  };

  const handleReportBook = () => {
    setIsMoreMenuOpen(false);
    showToast(
      lang === 'en'
        ? 'Book reporting is not available yet.'
        : 'الإبلاغ عن الكتب غير متاح بعد.'
    );
  };

  const handleOpenDeleteUpload = () => {
    if (!canDeleteUploadedBook) return;
    setIsMoreMenuOpen(false);
    setIsDeleteUploadModalOpen(true);
  };

  const handleConfirmDeleteUpload = () => {
    if (!bookId || !canDeleteUploadedBook) return;

    deleteUploadMutation.mutate(bookId, {
      onSuccess: () => {
        void clearOfflineEbook(bookId).catch((error) => {
          console.warn('[BOOK_DETAILS][DELETE_UPLOAD_OFFLINE_CLEANUP_FAILED]', error);
        });
        setIsDeleteUploadModalOpen(false);
        showToast(lang === 'en' ? 'Uploaded book deleted.' : 'تم حذف الكتاب المرفوع.');
        navigate({ type: 'tab', id: 'read' }, { replace: true });
      },
      onError: () => {
        showToast(lang === 'en' ? 'Failed to delete uploaded book.' : 'فشل حذف الكتاب المرفوع.');
      },
    });
  };

  const handleShare = () => {
    if (!displayBook) {
      showToast(lang === 'en' ? 'Unable to share this book.' : 'تعذرت مشاركة هذا الكتاب.');
      return;
    }
    setIsMoreMenuOpen(false);
    setIsShareMenuOpen((open) => !open);
  };

  const handlePrimaryAction = () => {
    if (!bookId) return;

    if (primaryAction === 'continue' || primaryAction === 'read') {
      navigate({
        type: 'immersive',
        id: 'reader',
        params: { bookId, from: currentView, recommendationContext }
      });
      return;
    }

    setAcquisitionSheetTrigger('get');
    setIsAcquisitionSheetOpen(true);
  };

  const handleOpenQuotes = () => {
    if (!bookId) return;
    navigate({ type: 'immersive', id: 'quotes', params: { bookId, from: currentView } });
  };

  const handleOpenEditions = () => {
    if (!bookId) return;
    setAcquisitionSheetTrigger('editions');
    setIsAcquisitionSheetOpen(true);
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
      setReviewText('');
      setUserRating(0);
      setHasReviewComposerInteraction(false);
      showToast(lang === 'en' ? 'Published.' : 'تم النشر.');
    } catch (err) {
      showToast('Error saving review.');
    }
  };

  const heroActionClassName = (isActive = false) =>
    cn(
      'flex aspect-square items-center justify-center rounded-2xl border bg-white/5 text-white/80',
      'transition-[background-color,border-color,color,transform,box-shadow] duration-150',
      'hover:border-white/20 hover:bg-white/10 hover:text-white',
      'active:scale-[0.97] active:border-accent/50 active:bg-accent/15 active:text-white',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
      'disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/5',
      'lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3',
      isActive
        ? 'border-accent/50 bg-accent/15 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_18px_44px_rgba(2,8,23,0.38)]'
        : 'border-white/10'
    );

  const heroActionLabelClassName = (isActive = false) =>
    cn(
      'hidden text-xs font-semibold tracking-wide lg:block',
      isActive ? 'text-white' : 'text-white/70'
    );

  if (isResolvingExternal && !resolvedExternalBookId && !displayBook) {
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

  if (isBookLoading && !displayBook) {
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

  if (isSurpriseRoute && !displayBook) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4 px-6">
        <ErrorState
          title={lang === 'en' ? 'Surprise is unavailable' : 'المفاجأة غير متاحة'}
          message={
            lang === 'en'
              ? 'Surprise recommendations require a catalog-backed service and are not available right now.'
              : 'تتطلب توصيات المفاجأة خدمة مدعومة بالكتالوج وهي غير متاحة حالياً.'
          }
          onRetry={handleBack}
        />
      </div>
    );
  }

  if ((isError && !displayBook) || (!bookId && !hasExternalHydrationCandidate && !displayBook)) {
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

  if (!bookId && hasExternalHydrationCandidate && !displayBook) {
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

  if (book === null && !displayBook) {
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
  const semanticRelatedWorks = semanticGraph?.relatedWorks ?? [];
  const hasSemanticGraph =
    Boolean(semanticGraph?.ontology.canonicalTradition) ||
    Boolean(semanticGraph?.ontology.form) ||
    semanticRelatedWorks.length > 0;
  const shouldShowInlineComposer = Boolean(user && (!existingUserReview || showComposer));
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, INITIAL_REVIEW_COUNT);
  const hasMoreReviews = reviews.length > INITIAL_REVIEW_COUNT;
  const connectionSection = hasSemanticGraph ? (
    <section className="space-y-4">
      <div className={cn('flex items-center justify-between gap-4', isRTL && 'flex-row-reverse text-right')}>
        <BilingualText role="H2" className="!text-xl !font-bold">
          {lang === 'en' ? 'Connections' : 'الصلات'}
        </BilingualText>
        {semanticGraph?.groups.explicitRelationshipCount ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/50">
            {semanticGraph.groups.explicitRelationshipCount}
          </span>
        ) : null}
      </div>

      <div className={cn('flex flex-wrap gap-2', isRTL && 'justify-end')}>
        {semanticGraph?.ontology.canonicalTradition ? (
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            {formatOntologyLabel(semanticGraph.ontology.canonicalTradition)}
          </span>
        ) : null}
        {semanticGraph?.ontology.form ? (
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
            {formatOntologyLabel(semanticGraph.ontology.form)}
          </span>
        ) : null}
        {semanticGraph?.ontology.subForm ? (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
            {formatOntologyLabel(semanticGraph.ontology.subForm)}
          </span>
        ) : null}
      </div>

      {semanticRelatedWorks.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {semanticRelatedWorks.slice(0, 6).map((item) => (
            <button
              key={`${item.relationshipType}:${item.bookId}`}
              type="button"
              onClick={() =>
                navigate({
                  type: 'immersive',
                  id: 'bookDetails',
                  params: { bookId: item.bookId, from: currentView },
                })
              }
              className={cn(
                'flex min-h-[84px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10',
                isRTL && 'flex-row-reverse text-right'
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30">
                <BookIcon className="h-5 w-5 text-white/70" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {lang === 'en' ? item.book.titleEn : item.book.titleAr || item.book.titleEn}
                </p>
                <p className="truncate text-xs text-white/50">
                  {lang === 'en' ? item.book.authorEn : item.book.authorAr || item.book.authorEn}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-white/35">
                  {RELATIONSHIP_LABELS[item.relationshipType]?.[lang] ||
                    RELATIONSHIP_LABELS[item.relationshipType]?.en ||
                    formatOntologyLabel(item.relationshipType)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  ) : null;

  return (
    <PageTransition className="h-screen w-full overflow-y-auto bg-black text-white">
      <header className="sticky top-0 z-50 bg-gradient-to-b from-black via-black/90 to-transparent">
        <div className="app-frame__inner px-4 md:px-0">
          <div className="app-rail app-rail--default flex h-20 items-center justify-between">
            <Button
              variant="icon"
              aria-label={lang === 'en' ? 'Back' : 'رجوع'}
              onClick={handleBack}
              className="!bg-white/10 backdrop-blur-md !p-3"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </Button>
            <div className="relative">
              <Button
                variant="icon"
                className="!bg-white/10 backdrop-blur-md !p-3"
                aria-label={lang === 'en' ? 'More actions' : 'إجراءات أخرى'}
                onClick={() => {
                  setIsShareMenuOpen(false);
                  setIsMoreMenuOpen((open) => !open);
                }}
              >
                <EllipsisIcon className="h-6 w-6" />
              </Button>
              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur-md">
                  {canDeleteUploadedBook && (
                    <button
                      type="button"
                      onClick={handleOpenDeleteUpload}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-red-300 hover:bg-red-500/10"
                    >
                      {lang === 'en' ? 'Delete Upload' : 'حذف الملف المرفوع'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReportBook}
                    className="w-full px-4 py-3 text-left text-sm font-semibold text-white/80 hover:bg-white/10"
                  >
                    {lang === 'en' ? 'Report' : 'إبلاغ'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="app-frame__inner px-6 md:px-0">
        <main className="app-rail app-rail--default relative z-10 space-y-10 pb-24">
          {/* Hero */}
          <section className={cn('flex items-start gap-5 lg:gap-8', isRTL && 'flex-row-reverse')}>
            <div className="w-32 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-800 shadow-2xl aspect-[2/3] lg:w-[180px]">
              <CanonicalCoverArtwork
                title={
                  lang === 'en'
                    ? (displayBook?.titleEn ?? displayBook?.titleAr ?? 'Unknown Title')
                    : (displayBook?.titleAr ?? displayBook?.titleEn ?? 'عنوان غير معروف')
                }
                author={
                  lang === 'en'
                    ? (displayBook?.authorEn ?? displayBook?.authorAr ?? 'Unknown Author')
                    : (displayBook?.authorAr ?? displayBook?.authorEn ?? 'مؤلف غير معروف')
                }
                coverUrl={displayBook?.coverUrl}
                coverMode={displayBook?.coverMode}
                fallbackCover={displayBook?.fallbackCover}
                variant="poster"
                imageClassName="h-full w-full object-cover"
              />
            </div>
            <div className={cn('min-w-0 flex-1 self-start pt-1 lg:max-w-[calc(100%-212px)]', isRTL && 'text-right')}>
              <BilingualText role="H1" className="!text-2xl !font-bold leading-tight md:!text-4xl">
                {lang === 'en' ? displayBook?.titleEn : displayBook?.titleAr}
              </BilingualText>
              <p className="mt-1.5 text-base text-white/60">{lang === 'en' ? displayBook?.authorEn : displayBook?.authorAr}</p>
              <div className={cn('mt-4 flex flex-wrap items-center gap-2', isRTL && 'justify-end')}>
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  <StarIcon className="mr-1.5 h-3 w-3 fill-current text-yellow-400" />
                  <span className="mr-1.5 text-sm font-black">{(displayBook?.rating || 0).toFixed(1)}</span>
                  <span className="text-[10px] tracking-tighter text-white/30">({(displayBook?.ratingsCount || 0).toLocaleString()})</span>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/60">
                  {readingStatusLabel}
                </div>
              </div>
            </div>
          </section>

          {/* Hero Actions */}
          <section
            className={cn(
              'relative grid gap-3 lg:gap-4',
              primaryAction === 'get' ? 'grid-cols-4' : 'grid-cols-5'
            )}
          >
            <button
              onClick={() => setIsShelfModalOpen(true)}
              disabled={!bookId || !book}
              className={cn(
                heroActionClassName(isShelfModalOpen || isSavedOnPhysicalShelf),
                isSavedOnPhysicalShelf && 'bg-accent/10 text-accent',
                (!bookId || !book) && 'opacity-40'
              )}
            >
              <ShelvesIcon className="h-6 w-6" />
              <span className={heroActionLabelClassName(isShelfModalOpen)}>
                {lang === 'en' ? 'Shelf' : 'الرف'}
              </span>
            </button>
            <button
              onClick={handleOpenQuotes}
              disabled={!bookId}
              className={cn(
                heroActionClassName(false),
                !bookId && 'opacity-40'
              )}
            >
              <QuoteIcon className="h-6 w-6" />
              <span className={heroActionLabelClassName(false)}>
                {lang === 'en' ? 'Quotes' : 'اقتباسات'}
              </span>
            </button>
            <button
              ref={shareButtonRef}
              onClick={handleShare}
              className={heroActionClassName(isShareMenuOpen)}
              aria-expanded={isShareMenuOpen}
            >
              <ShareIcon className="h-6 w-6" />
              <span className={heroActionLabelClassName(isShareMenuOpen)}>
                {lang === 'en' ? 'Share' : 'مشاركة'}
              </span>
            </button>
            {isShareMenuOpen && (
              <div
                ref={shareMenuRef}
                className="absolute left-1/2 top-full z-40 mt-3 w-[min(320px,calc(100vw-48px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={handlePostToTown}
                  disabled={!bookId || !displayBook}
                  className={cn(
                    'block min-h-[44px] w-full px-4 py-3 text-left text-sm font-semibold text-white/85 transition-colors',
                    'hover:bg-white/10 active:bg-accent/15 focus-visible:bg-white/10 focus-visible:outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-40'
                  )}
                >
                  {lang === 'en' ? 'Post to Town' : 'انشر في البلدة'}
                </button>
                <button
                  type="button"
                  onClick={handleShareExternally}
                  className="block min-h-[44px] w-full px-4 py-3 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 active:bg-accent/15 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  {lang === 'en' ? 'Share Externally' : 'مشاركة خارجية'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="block min-h-[44px] w-full px-4 py-3 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 active:bg-accent/15 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  {lang === 'en' ? 'Copy Link' : 'نسخ الرابط'}
                </button>
              </div>
            )}
            {primaryAction !== 'get' && (
              <button
                onClick={handleOpenEditions}
                disabled={!bookId}
                className={cn(
                  heroActionClassName(isAcquisitionSheetOpen && acquisitionSheetTrigger === 'editions'),
                  !bookId && 'opacity-40'
                )}
              >
                <BookIcon className="h-6 w-6" />
                <span className={heroActionLabelClassName(isAcquisitionSheetOpen && acquisitionSheetTrigger === 'editions')}>
                  {lang === 'en' ? 'Editions' : 'الطبعات'}
                </span>
              </button>
            )}
            <button
              onClick={handlePrimaryAction}
              disabled={!bookId}
              className={cn(
                heroActionClassName(isAcquisitionSheetOpen && acquisitionSheetTrigger === 'get'),
                !bookId && 'opacity-40'
              )}
            >
              {primaryAction === 'get' ? (
                <BasketIcon className="h-6 w-6" />
              ) : (
                <EyeIcon className="h-6 w-6" />
              )}
              <span className={heroActionLabelClassName(isAcquisitionSheetOpen && acquisitionSheetTrigger === 'get')}>
                {primaryActionLabel}
              </span>
            </button>
          </section>

          {/* Summary */}
          <section className="space-y-3">
            <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Summary' : 'الملخص'}</BilingualText>
            <p className="text-base leading-relaxed text-white/80 font-serif">{lang === 'en' ? displayBook?.descriptionEn : displayBook?.descriptionAr || displayBook?.descriptionEn}</p>
          </section>

          {/* Reviews */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Reviews' : 'المراجعات'}</BilingualText>
            </div>

            {shouldShowInlineComposer && (
              <GlassCard className="!bg-white/5 !p-0 overflow-hidden border-white/10 animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                  <BilingualText className="text-[10px] font-black uppercase tracking-widest text-white/40">{isEditingReview ? 'Edit Review' : 'New Review'}</BilingualText>
                  <StarRatingInput
                    rating={userRating}
                    onRatingChange={(rating) => {
                      setHasReviewComposerInteraction(true);
                      setUserRating(rating);
                    }}
                    size="sm"
                  />
                </div>
                <div className="p-6">
                  <textarea
                    value={reviewText}
                    onChange={(e) => {
                      setHasReviewComposerInteraction(true);
                      setReviewText(e.target.value);
                    }}
                    maxLength={MAX_REVIEW_LENGTH}
                    placeholder="..."
                    className="w-full resize-none bg-transparent text-base text-white font-serif focus:outline-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="mt-4 flex justify-end gap-3">
                    {hasReviewComposerInteraction && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setIsAddingReview(false);
                          setIsEditingReview(false);
                          setHasReviewComposerInteraction(false);
                        }}
                        className="!text-xs"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button variant="primary" disabled={submitReview.isPending} onClick={handlePublishReview} className="!h-9 !rounded-full !px-6 !text-sm">Submit</Button>
                  </div>
                </div>
              </GlassCard>
            )}

            <div className="space-y-4">
              {visibleReviews.map(r => (
                <ReviewCard key={`${r.bookId}_${r.userId}`} review={r} onEdit={() => setIsEditingReview(true)} />
              ))}
              {hasMoreReviews && (
                <Button
                  variant="ghost"
                  onClick={() => setShowAllReviews((value) => !value)}
                  className="!h-10 !rounded-full border border-white/10 !px-5 !text-sm"
                >
                  {showAllReviews
                    ? (lang === 'en' ? 'Fewer Reviews' : 'مراجعات أقل')
                    : (lang === 'en' ? 'More Reviews' : 'مراجعات أكثر')}
                </Button>
              )}
            </div>
          </section>

          {connectionSection}
        </main>
      </div>

      {bookId && book && (
        <SelectShelfModal isOpen={isShelfModalOpen} onClose={() => setIsShelfModalOpen(false)} bookId={bookId} book={book} recommendationContext={recommendationContext} />
      )}
      <OtherEditionsSheet
        isOpen={isAcquisitionSheetOpen}
        onClose={() => {
          setIsAcquisitionSheetOpen(false);
          setAcquisitionSheetTrigger(null);
        }}
        bookId={bookId}
        lang={lang}
        title={displayBook ? (lang === 'en' ? displayBook.titleEn : displayBook.titleAr || displayBook.titleEn) : undefined}
        author={displayBook ? (lang === 'en' ? displayBook.authorEn : displayBook.authorAr || displayBook.authorEn) : undefined}
        coverUrl={displayBook?.coverUrl}
        coverMode={displayBook?.coverMode}
        fallbackCover={displayBook?.fallbackCover}
        externalReadableSources={bookDetails?.externalReadableSources}
      />
      <ConfirmDeleteModal
        isOpen={isDeleteUploadModalOpen}
        onClose={() => setIsDeleteUploadModalOpen(false)}
        onConfirm={handleConfirmDeleteUpload}
        isDeleting={deleteUploadMutation.isPending}
        itemName={
          displayBook
            ? lang === 'en'
              ? displayBook.titleEn
              : displayBook.titleAr || displayBook.titleEn
            : ''
        }
        itemType={lang === 'en' ? 'uploaded book' : 'الكتاب المرفوع'}
        titleText={lang === 'en' ? 'Delete uploaded book?' : 'حذف الكتاب المرفوع؟'}
        bodyText={
          lang === 'en'
            ? 'Delete this uploaded book permanently? This will remove the EPUB, reading progress, highlights, bookmarks, covers, and all associated data.'
            : 'هل تريد حذف هذا الكتاب المرفوع نهائيًا؟ سيؤدي ذلك إلى إزالة ملف EPUB وتقدم القراءة والتمييزات والإشارات المرجعية والأغلفة وكل البيانات المرتبطة.'
        }
        confirmLabel={lang === 'en' ? 'Delete Upload' : 'حذف الملف المرفوع'}
      />
    </PageTransition>
  );
};

export default BookDetailsScreen;
