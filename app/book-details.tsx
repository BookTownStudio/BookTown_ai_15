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
import StarRatingInput from '../components/ui/StarRatingInput.tsx';
import GlassCard from '../components/ui/GlassCard.tsx';
import CanonicalCoverArtwork from '../components/content/CanonicalCoverArtwork.tsx';

import {
  ShareIcon,
  EyeIcon,
  StarIcon,
  QuoteIcon,
  EllipsisIcon,
  ShelvesIcon,
  SendIcon,
  EditIcon,
  BookIcon,
  ChevronLeftIcon
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
import { acquireExternalEbookForRead } from '../lib/books/acquireExternalEbookForRead.ts';
import type { GraphRelationshipType } from '../types/literaryGraph.ts';
import { callCallableEndpoint } from '../lib/callable.ts';
import { useQueryClient } from '../lib/react-query.ts';

const MAX_REVIEW_LENGTH = 750;
const BOOK_PREPARE_TIMEOUT_MS = 12000;
const ACQUISITION_CONFIRM_MAX_ATTEMPTS = 3;
const ACQUISITION_CONFIRM_DELAY_MS = 500;

type AcquisitionState = 'idle' | 'pending' | 'success' | 'failed';

function getCanonicalEbookAttachmentId(
  value: Pick<BookDetailsRuntimeDTO, 'ebookAttachmentId'> | null | undefined
): string | null {
  const raw = value?.ebookAttachmentId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function hasReadableCopy(value: BookDetailsRuntimeDTO | null | undefined): boolean {
  if (!value) return false;
  return Boolean(
    getCanonicalEbookAttachmentId(value) ||
      (typeof value.ebookStoragePath === 'string' && value.ebookStoragePath.trim().length > 0) ||
      value.downloadable
  );
}

function waitForAcquisitionConfirmation(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
  const queryClient = useQueryClient();

  const params =
    currentView.type === 'immersive'
      ? (currentView.params as Record<string, unknown> | undefined) || {}
      : {};

  const originalBookId = typeof params?.bookId === 'string' ? params.bookId : undefined;
  const reviewAction = typeof params?.reviewAction === 'string' ? params.reviewAction : undefined;
  const pendingAction = typeof params?.pendingAction === 'string' ? params.pendingAction : 'NONE';
  const pendingShelfId = typeof params?.pendingShelfId === 'string' ? params.pendingShelfId : '';
  const pendingSearchResult = (params?.searchResult as SearchResultDTO | undefined) || undefined;
  const autoAcquireOnOpen = params?.autoAcquireOnOpen === true;
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
  const [acquisitionState, setAcquisitionState] = useState<AcquisitionState>('idle');
  const [acquisitionErrorMessage, setAcquisitionErrorMessage] = useState<string | null>(null);
  const [confirmedReadableAttachmentId, setConfirmedReadableAttachmentId] = useState<string | null>(null);
  const [isManualContinuityBusy, setIsManualContinuityBusy] = useState(false);
  const ingestionStartedRef = useRef<string>('');
  const resolvedCanonicalRef = useRef<string | null>(null);
  const pendingActionRef = useRef<string>('');
  const autoAcquireStartedRef = useRef<string>('');

  const isSurpriseRoute = originalBookId === 'surprise';
  const bookId =
    isSurpriseRoute
      ? undefined
      : resolvedExternalBookId || (hasExternalHydrationCandidate ? undefined : originalBookId);

  const { data: book, isLoading: isBookLoading, isError, refetch } = useBookCatalog(bookId);
  const { data: reviews = [], isLoading: isReviewsLoading } = useBookReviews(bookId);
  const {
    isSavedOnPhysicalShelf = false,
    isCurrentlyReadingFromProgress = false,
  } = useBookShelfStatus(bookId);
  const { data: semanticGraph } = useBookSemanticGraph(bookId, {
    enabled: Boolean(bookId && book),
    limit: 12,
  });
  
  useRelatedBooks(book || undefined);
  const submitReview = useSubmitReview();

  useEffect(() => {
    ingestionStartedRef.current = '';
    resolvedCanonicalRef.current = null;
    pendingActionRef.current = '';
    autoAcquireStartedRef.current = '';
    setResolvedExternalBookId(null);
    setIsResolvingExternal(false);
    setExternalResolveFailed(false);
    setPrepareTimedOut(false);
    setAcquisitionState('idle');
    setAcquisitionErrorMessage(null);
    setConfirmedReadableAttachmentId(null);
    setIsManualContinuityBusy(false);
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

  const bookDetails = useMemo(
    () => (book ? toBookDetailsRuntimeDTO(book) : null),
    [book]
  );
  const liveReadableAttachmentId = getCanonicalEbookAttachmentId(bookDetails);
  const hasReadableEbook =
    hasReadableCopy(bookDetails) || Boolean(confirmedReadableAttachmentId);
  const providerExternalIds = bookDetails?.providerExternalIds ?? [];
  const externalReadableSources = bookDetails?.externalReadableSources ?? [];
  const canPrepareReadableCopy =
    !hasReadableEbook &&
    (pendingSearchResult?.available === true ||
      pendingSearchResult?.readAccess === 'trusted_external' ||
      externalReadableSources.length > 0 ||
      providerExternalIds.some((entry) => typeof entry === 'string' && entry.trim().length > 0));
  const canAttemptRead = hasReadableEbook;
  const isPreparingReadableCopy = acquisitionState === 'pending';
  const manualContinuitySourceType: 'physical' | 'external_ebook' =
    hasExternalHydrationCandidate ||
    externalReadableSources.length > 0 ||
    providerExternalIds.some((entry) => typeof entry === 'string' && entry.trim().length > 0)
      ? 'external_ebook'
      : 'physical';
  const canTrackManualContinuity = Boolean(bookId && book && !hasReadableEbook && !canPrepareReadableCopy);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('SEARCH RESULT PROVIDERS', pendingSearchResult?.externalReadableSources);
  }, [pendingSearchResult]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('DETAIL BOOK PROVIDERS', bookDetails?.externalReadableSources);
  }, [bookDetails?.externalReadableSources]);

  const displayBook = useMemo(() => {
    if (bookDetails) return bookDetails;
    if (!pendingSearchResult) return null;

    return buildPendingSearchBookView(pendingSearchResult, bookId);
  }, [bookDetails, bookId, pendingSearchResult]);

  useEffect(() => {
    if (!liveReadableAttachmentId) return;
    setConfirmedReadableAttachmentId((current) =>
      current === liveReadableAttachmentId ? current : liveReadableAttachmentId
    );
    setAcquisitionErrorMessage(null);
    setAcquisitionState((current) => (current === 'pending' || current === 'failed' ? 'success' : current));
  }, [liveReadableAttachmentId]);

  const acquisitionFailedMessage =
    lang === 'en'
      ? 'This ebook could not be prepared. Please try again.'
      : 'تعذر تجهيز هذا الكتاب الإلكتروني. حاول مرة أخرى.';
  const acquisitionConfirmationFailedMessage =
    lang === 'en'
      ? 'The ebook was not confirmed after preparation. Please try again.'
      : 'لم يتم تأكيد الكتاب الإلكتروني بعد التجهيز. حاول مرة أخرى.';

  const handleBack = () => {
    const from = currentView.type === 'immersive' ? currentView.params?.from : null;
    navigate(
      from && typeof from === 'object' ? (from as any) : { type: 'tab', id: 'home' },
      { replace: true }
    );
  };

  const handleShare = () => {
    if (!displayBook || !navigator.share) return;
    navigator.share({
      title: lang === 'en' ? displayBook.titleEn : displayBook.titleAr,
      url: window.location.href
    }).catch(() => {});
  };

  const confirmReadableAttachment = async (): Promise<string | null> => {
    if (liveReadableAttachmentId) {
      return liveReadableAttachmentId;
    }

    for (let attempt = 1; attempt <= ACQUISITION_CONFIRM_MAX_ATTEMPTS; attempt += 1) {
      const refreshed = await refetch();
      const attachmentId = getCanonicalEbookAttachmentId(refreshed.data);
      if (attachmentId) {
        return attachmentId;
      }
      if (attempt < ACQUISITION_CONFIRM_MAX_ATTEMPTS) {
        await waitForAcquisitionConfirmation(ACQUISITION_CONFIRM_DELAY_MS);
      }
    }

    return null;
  };

  const prepareReadableCopy = async (silent: boolean): Promise<boolean> => {
    if (!bookId || isPreparingReadableCopy || !canPrepareReadableCopy) {
      return false;
    }

    try {
      if (import.meta.env.DEV) {
        console.log('ACQUIRE INPUT PROVIDERS', bookDetails?.externalReadableSources);
      }
      setAcquisitionState('pending');
      setAcquisitionErrorMessage(null);
      if (!silent) {
        showToast(lang === 'en' ? 'Preparing ebook...' : 'جارٍ تجهيز الكتاب الإلكتروني...');
      }
      await acquireExternalEbookForRead({ bookId });
      const attachmentId = await confirmReadableAttachment();
      if (!attachmentId) {
        setAcquisitionState('failed');
        setAcquisitionErrorMessage(acquisitionConfirmationFailedMessage);
        return false;
      }
      setConfirmedReadableAttachmentId(attachmentId);
      setAcquisitionState('success');
      if (!silent) {
        showToast(lang === 'en' ? 'Ebook is ready.' : 'الكتاب الإلكتروني جاهز.');
      }
      return true;
    } catch (error) {
      console.error('[BOOK_DETAILS][READ_ACQUIRE_FAILED]', error);
      setAcquisitionState('failed');
      setAcquisitionErrorMessage(acquisitionFailedMessage);
      if (!silent) {
        showToast(
          lang === 'en'
            ? 'This book could not be prepared for reading.'
            : 'تعذر تجهيز هذا الكتاب للقراءة.'
        );
      }
      return false;
    }
  };

  const handleRead = async () => {
    if (!bookId || isPreparingReadableCopy || isManualContinuityBusy) return;

    if (hasReadableEbook) {
      navigate({
        type: 'immersive',
        id: 'reader',
        params: { bookId, from: currentView, recommendationContext }
      });
      return;
    }

    if (canPrepareReadableCopy) {
      await prepareReadableCopy(false);
      return;
    }

    if (canTrackManualContinuity) {
      let progress: number | undefined;
      if (isCurrentlyReadingFromProgress) {
        const raw = window.prompt(
          lang === 'en'
            ? 'Enter reading progress percentage (0-100).'
            : 'أدخل نسبة التقدم في القراءة (0-100).'
        );
        if (raw === null) return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          showToast(lang === 'en' ? 'Progress must be between 0 and 100.' : 'يجب أن تكون النسبة بين 0 و100.');
          return;
        }
        progress = parsed / 100;
      }

      setIsManualContinuityBusy(true);
      try {
        await callCallableEndpoint<
          {
            bookId: string;
            sourceType: 'physical' | 'external_ebook';
            status_state: 'reading';
            progress?: number;
          },
          { ok: boolean }
        >('recordManualReadingProgress', {
          bookId,
          sourceType: manualContinuitySourceType,
          status_state: 'reading',
          ...(typeof progress === 'number' ? { progress } : {}),
        });
        queryClient.invalidateQueries({ queryKey: ['currentlyReading'] });
        showToast(
          isCurrentlyReadingFromProgress
            ? (lang === 'en' ? 'Reading progress updated.' : 'تم تحديث تقدم القراءة.')
            : (lang === 'en' ? 'Added to Currently Reading.' : 'تمت الإضافة إلى تقرأ الآن.')
        );
      } catch (error) {
        console.error('[BOOK_DETAILS][MANUAL_CONTINUITY_FAILED]', error);
        showToast(
          lang === 'en'
            ? 'Unable to update reading progress.'
            : 'تعذر تحديث تقدم القراءة.'
        );
      } finally {
        setIsManualContinuityBusy(false);
      }
    }
  };

  useEffect(() => {
    if (!autoAcquireOnOpen || !bookId || hasReadableEbook || !canPrepareReadableCopy) return;

    const acquisitionKey = `${bookId}:${pendingSearchResult?.id || 'canonical'}`;
    if (autoAcquireStartedRef.current === acquisitionKey) return;
    autoAcquireStartedRef.current = acquisitionKey;

    void prepareReadableCopy(true);
  }, [
    autoAcquireOnOpen,
    bookId,
    canPrepareReadableCopy,
    hasReadableEbook,
    pendingSearchResult?.id,
  ]);

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
                title={lang === 'en' ? displayBook?.titleEn : displayBook?.titleAr}
                author={lang === 'en' ? displayBook?.authorEn : displayBook?.authorAr}
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
              </div>
            </div>
          </section>

          {/* Action Row */}
          <section className="grid grid-cols-4 gap-3 lg:gap-4">
            <button
              onClick={() => setIsShelfModalOpen(true)}
              disabled={!bookId || !book}
              className={cn(
                'flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3',
                isSavedOnPhysicalShelf && 'bg-accent/10 text-accent',
                (!bookId || !book) && 'opacity-40'
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
              onClick={handleRead}
              disabled={isPreparingReadableCopy || isManualContinuityBusy || (!canAttemptRead && !canPrepareReadableCopy && !canTrackManualContinuity)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-2xl border transition-all lg:h-[180px] lg:aspect-auto lg:flex-col lg:gap-3',
                canAttemptRead
                  ? 'border-accent bg-accent text-black shadow-lg shadow-accent/25 ring-1 ring-accent/40'
                  : canPrepareReadableCopy
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                  : canTrackManualContinuity
                  ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
                  : 'border-white/10 bg-white/5 opacity-20'
              )}
            >
              {isPreparingReadableCopy || isManualContinuityBusy ? <LoadingSpinner className="!h-5 !w-5" /> : <EyeIcon className={cn('h-6 w-6', canAttemptRead && 'h-6.5 w-6.5')} />}
              <span className={cn('hidden text-xs font-semibold tracking-wide lg:block', canAttemptRead ? 'text-black/80' : 'text-white/70')}>
                {isPreparingReadableCopy
                  ? (lang === 'en' ? 'Preparing ebook...' : 'جارٍ تجهيز الكتاب الإلكتروني...')
                  : isManualContinuityBusy
                  ? (lang === 'en' ? 'Updating...' : 'جارٍ التحديث...')
                  : canAttemptRead
                  ? (lang === 'en' ? 'Read' : 'اقرأ')
                  : acquisitionState === 'failed' && canPrepareReadableCopy
                  ? (lang === 'en' ? 'Retry ebook' : 'أعد تجهيز الكتاب الإلكتروني')
                  : canPrepareReadableCopy
                  ? (lang === 'en' ? 'Prepare ebook' : 'جهّز الكتاب الإلكتروني')
                  : canTrackManualContinuity && isCurrentlyReadingFromProgress
                  ? (lang === 'en' ? 'Update Progress' : 'تحديث التقدم')
                  : canTrackManualContinuity
                  ? (lang === 'en' ? 'Start Reading' : 'ابدأ القراءة')
                  : (lang === 'en' ? 'Unavailable' : 'غير متاح')}
              </span>
            </button>
          </section>

          {acquisitionState !== 'idle' && (
            <section
              className={cn(
                'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
                acquisitionState === 'pending'
                  ? 'border-cyan-400/25 bg-cyan-400/10'
                  : acquisitionState === 'failed'
                  ? 'border-rose-400/25 bg-rose-400/10'
                  : 'border-emerald-400/25 bg-emerald-400/10'
              )}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    acquisitionState === 'pending'
                      ? 'text-cyan-100'
                      : acquisitionState === 'failed'
                      ? 'text-rose-100'
                      : 'text-emerald-100'
                  )}
                >
                  {acquisitionState === 'pending'
                    ? (lang === 'en' ? 'Preparing ebook...' : 'جارٍ تجهيز الكتاب الإلكتروني...')
                    : acquisitionState === 'failed'
                    ? (lang === 'en' ? 'Ebook preparation failed.' : 'فشل تجهيز الكتاب الإلكتروني.')
                    : (lang === 'en' ? 'Ebook ready to read.' : 'الكتاب الإلكتروني جاهز للقراءة.')}
                </p>
                {acquisitionState === 'failed' && acquisitionErrorMessage ? (
                  <p className="mt-1 text-xs text-rose-100/80">{acquisitionErrorMessage}</p>
                ) : null}
              </div>
              {acquisitionState === 'failed' && canPrepareReadableCopy ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    void prepareReadableCopy(false);
                  }}
                  className="!h-9 !shrink-0 !rounded-full border border-rose-200/20 !px-4 !text-xs !text-rose-50"
                >
                  {lang === 'en' ? 'Retry' : 'إعادة المحاولة'}
                </Button>
              ) : null}
            </section>
          )}

          {/* Summary */}
          <section className="space-y-3">
            <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Summary' : 'الملخص'}</BilingualText>
            <p className="text-base leading-relaxed text-white/80 font-serif">{lang === 'en' ? displayBook?.descriptionEn : displayBook?.descriptionAr || displayBook?.descriptionEn}</p>
          </section>

          {hasSemanticGraph && (
            <section className="space-y-4">
              <div className={cn('flex items-center justify-between gap-4', isRTL && 'flex-row-reverse text-right')}>
                <BilingualText role="H2" className="!text-xl !font-bold">
                  {lang === 'en' ? 'Literary Graph' : 'الرسم الأدبي'}
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
          )}

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

      {bookId && book && (
        <SelectShelfModal isOpen={isShelfModalOpen} onClose={() => setIsShelfModalOpen(false)} bookId={bookId} book={book} recommendationContext={recommendationContext} />
      )}
    </PageTransition>
  );
};

export default BookDetailsScreen;
