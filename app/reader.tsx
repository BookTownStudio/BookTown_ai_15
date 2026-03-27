// app/reader.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import ReaderChrome from '../components/reader/ReaderChrome.tsx';
import NarrationMicroPlayer from '../components/reader/NarrationMicroPlayer.tsx';
import QuoteBubble from '../components/reader/QuoteBubble.tsx';
import ReaderSettings from '../components/reader/ReaderSettings.tsx';
import ReaderSurface from '../components/reader/runtime/ReaderSurface.tsx';
import { useToast } from '../store/toast.tsx';
import { useReadingPreferences } from '../store/reading-prefs.tsx';
import {
  enqueueHighlightDeleteSyncOperation,
  enqueueHighlightUpsertSyncOperation,
  enqueueBookmarkDeleteSyncOperation,
  enqueueBookmarkUpsertSyncOperation,
  enqueueProgressSyncOperation,
  flushReaderOperations,
} from '../lib/reader/offline/readerSyncClient.ts';
import { useReaderBookmarks } from '../lib/hooks/useReaderBookmarks.ts';
import { useReaderHighlights } from '../lib/hooks/useReaderHighlights.ts';
import { useReaderSessionBootstrap } from '../lib/hooks/useReaderSessionBootstrap.ts';
import { useReaderNarration } from '../lib/hooks/useReaderNarration.ts';
import { resolveReaderEngine } from '../lib/reader/runtime/engineSelection.ts';
import { useOffline } from '../lib/offline/OfflineProvider.tsx';
import { useQueryClient } from '../lib/react-query.ts';
import {
  clearOfflineEbook,
  getOfflineBookObjectUrl,
  getOfflineRecord,
  isOfflineValid,
  markEbookOffline,
  updateOfflineLastKnownPage,
} from './lib/offline/offlineManager.ts';

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import { HighlightIcon } from '../components/icons/HighlightIcon.tsx';
import type {
  ReaderFormat,
  ReaderHighlightOverlay,
  ReaderNarrationSnapshot,
  ReaderTextSelection,
} from '../lib/reader/runtime/contracts.ts';
import type { LibrarianRecommendationContext } from '../types/librarian.ts';
import type { OfflineEbookRecord } from './lib/offline/offlineManager.ts';

function inferFormatFromUrl(url: string): ReaderFormat {
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.includes('.epub') || lower.includes('.kepub')) return 'epub';
  return 'unknown';
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

function buildHighlightId(anchor: string, page: number): string {
  let hash = 0;
  for (let i = 0; i < anchor.length; i += 1) {
    hash = (hash * 31 + anchor.charCodeAt(i)) | 0;
  }
  return `hl_${page}_${Math.abs(hash).toString(36)}`;
}

function clampReaderPage(page: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.trunc(totalPages));
  return Math.min(Math.max(1, Math.trunc(page)), safeTotal);
}

const ReaderScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();
  const { theme, readingMode, fontSize, fontStyle } = useReadingPreferences();
  const { isOffline } = useOffline();
  const queryClient = useQueryClient();

  const bookId =
    currentView.type === 'immersive' && currentView.params?.bookId
      ? currentView.params.bookId
      : undefined;
  const recommendationContext = parseRecommendationContext(currentView.params?.recommendationContext);

  const { data: book, isLoading: isBookLoading } = useBookCatalog(bookId);

  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  // -------------------------------------------------
  // A4.5 — Canonical Reading Session
  // -------------------------------------------------
  const {
    session: readerSession,
    manifest: readerManifest,
    isLoading: loadingSession,
    error: sessionError,
  } = useReaderSessionBootstrap(bookId);
  const { bookmarks, refetch: refetchBookmarks } = useReaderBookmarks(bookId);
  const { highlights, refetch: refetchHighlights } = useReaderHighlights(bookId);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [bookmarkOverrides, setBookmarkOverrides] = useState<Record<number, { bookmarkId: string } | null>>({});
  const [highlightOverrides, setHighlightOverrides] = useState<Record<string, {
    highlightId: string;
    cfi: string;
    page: number;
    quote: string;
    color: string;
  } | null>>({});
  const [offlineRecord, setOfflineRecord] = useState<OfflineEbookRecord | null>(null);
  const [offlineObjectUrl, setOfflineObjectUrl] = useState<string | null>(null);
  const [isOfflineAssetBusy, setIsOfflineAssetBusy] = useState(false);
  const [pendingHighlightSelection, setPendingHighlightSelection] = useState<ReaderTextSelection | null>(null);
  const [narrationSnapshot, setNarrationSnapshot] = useState<ReaderNarrationSnapshot | null>(null);
  const [hasObservedRuntimePagination, setHasObservedRuntimePagination] = useState(false);
  const progressWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressFingerprintRef = useRef<string>('');
  const lastNarrationErrorRef = useRef<string>('');
  const latestProgressPayloadRef = useRef<{
    bookId: string;
    currentPage: number;
    totalPages: number;
    percentage: number;
    format: ReaderFormat;
    readingMode: 'scroll' | 'page';
    paragraphIndex: number | null;
  } | null>(null);
  const hasOfflineCopy = useMemo(
    () => Boolean(offlineRecord && isOfflineValid(offlineRecord)),
    [offlineRecord]
  );
  const manifestEstimatedPageCount = useMemo(() => {
    if (
      !readerManifest ||
      typeof readerManifest.estimatedPageCount !== 'number' ||
      !Number.isFinite(readerManifest.estimatedPageCount) ||
      readerManifest.estimatedPageCount <= 0
    ) {
      return null;
    }

    return Math.trunc(readerManifest.estimatedPageCount);
  }, [readerManifest]);
  const shouldUseManifestContinuityEstimate = useMemo(
    () =>
      Boolean(
        manifestEstimatedPageCount &&
        readerManifest?.locationMap?.checkpointUnit === 'page'
      ),
    [manifestEstimatedPageCount, readerManifest?.locationMap?.checkpointUnit]
  );
  const hasTrustedPagination = useMemo(
    () =>
      Boolean(
        shouldUseManifestContinuityEstimate &&
        manifestEstimatedPageCount &&
        totalPages === manifestEstimatedPageCount
      ),
    [manifestEstimatedPageCount, shouldUseManifestContinuityEstimate, totalPages]
  );
  const canPersistProgress = hasTrustedPagination || hasObservedRuntimePagination;
  const narration = useReaderNarration({
    bookId,
    progressParagraphIndex: readerSession?.lastPosition?.paragraphIndex ?? null,
    sessionNarration: readerSession?.narration ?? null,
    snapshot: narrationSnapshot,
    language: lang,
  });

  const handleReaderPageChange = useCallback((nextPage: number, pagesCount: number) => {
    setCurrentPage(nextPage);
    setTotalPages(Math.max(1, pagesCount));
    setHasObservedRuntimePagination(true);
    setPendingHighlightSelection(null);
  }, []);

  const handleEpubLoadError = useCallback(
    (message: string) => {
      console.error('[READER][EPUB_RENDER_FAILED]', message);
      setRenderError(
        lang === 'en'
          ? 'Unable to render this EPUB in-app. You can open the file directly.'
          : 'تعذّر عرض ملف EPUB داخل التطبيق. يمكنك فتح الملف مباشرة.'
      );
    },
    [lang]
  );

  const handlePdfLoadError = useCallback(
    (message: string) => {
      console.error('[READER][PDF_RENDER_FAILED]', message);
      setRenderError(
        lang === 'en'
          ? 'Unable to render this PDF in-app. You can open the file directly.'
          : 'تعذّر عرض ملف PDF داخل التطبيق. يمكنك فتح الملف مباشرة.'
      );
    },
    [lang]
  );

  const handleBack = useCallback(() => {
    if (currentView.params?.from) navigate(currentView.params.from);
    else navigate({ type: 'tab', id: 'read' });
  }, [navigate, currentView]);

  const handleListeningClick = useCallback(() => {
    const result = narration.togglePlayback();
    if (result.ok) return;

    showToast(
      lang === 'en'
        ? result.reason || 'Narration could not start from the visible text.'
        : result.reason?.includes('browser')
          ? 'المتصفح الحالي لا يدعم السرد الصوتي.'
          : 'النص الظاهر غير جاهز للسرد بعد.'
    );
  }, [lang, narration, showToast]);

  useEffect(() => {
    if (isOffline && hasOfflineCopy && offlineRecord && !readerSession) {
      const resumePage =
        typeof offlineRecord.lastKnownPage === 'number' && offlineRecord.lastKnownPage > 0
          ? Math.trunc(offlineRecord.lastKnownPage)
          : 1;
      const nextPage =
        shouldUseManifestContinuityEstimate && manifestEstimatedPageCount
          ? clampReaderPage(resumePage, manifestEstimatedPageCount)
          : resumePage;
      setCurrentPage(nextPage);
      setTotalPages(
        shouldUseManifestContinuityEstimate && manifestEstimatedPageCount
          ? manifestEstimatedPageCount
          : 1
      );
      setRenderError(null);
      return;
    }

    if (!readerSession) return;
    const resumePage =
      typeof readerSession.resumePage === 'number' &&
      Number.isFinite(readerSession.resumePage) &&
      readerSession.resumePage > 0
        ? Math.trunc(readerSession.resumePage)
        : 1;
    const nextPage =
      shouldUseManifestContinuityEstimate && manifestEstimatedPageCount
        ? clampReaderPage(resumePage, manifestEstimatedPageCount)
        : resumePage;
    setCurrentPage(nextPage);
    setTotalPages(
      shouldUseManifestContinuityEstimate && manifestEstimatedPageCount
        ? manifestEstimatedPageCount
        : 1
    );
    setRenderError(null);
  }, [
    hasOfflineCopy,
    isOffline,
    manifestEstimatedPageCount,
    offlineRecord,
    readerSession,
    shouldUseManifestContinuityEstimate,
  ]);

  useEffect(() => {
    setBookmarkOverrides({});
    setHighlightOverrides({});
    setOfflineRecord(bookId ? getOfflineRecord(bookId) : null);
    setPendingHighlightSelection(null);
    setNarrationSnapshot(null);
    setHasObservedRuntimePagination(false);
    latestProgressPayloadRef.current = null;
    lastProgressFingerprintRef.current = '';
  }, [bookId]);

  useEffect(() => {
    if (!narration.error) {
      lastNarrationErrorRef.current = '';
      return;
    }

    if (lastNarrationErrorRef.current === narration.error) return;
    lastNarrationErrorRef.current = narration.error;
    showToast(
      lang === 'en' ? narration.error : 'تعذّر تشغيل السرد الصوتي لهذا الجزء.'
    );
  }, [lang, narration.error, showToast]);

  useEffect(() => {
    if (!sessionError) return;
    if (isOffline && hasOfflineCopy) return;
    console.error('[READER][SESSION_INIT_FAILED]', sessionError);
    showToast(
      lang === 'en'
        ? 'Unable to open book. Please try again later.'
        : 'تعذّر فتح الكتاب. يرجى المحاولة لاحقًا.'
    );

    if (currentView.params?.from) navigate(currentView.params.from);
    else navigate({ type: 'tab', id: 'read' });
  }, [currentView.params, hasOfflineCopy, isOffline, lang, navigate, sessionError, showToast]);

  const effectiveFormat = useMemo<ReaderFormat>(() => {
    if (offlineRecord?.format && offlineRecord.format !== 'unknown') return offlineRecord.format;
    if (!readerSession) return 'unknown';
    if (readerSession.format !== 'unknown') return readerSession.format;
    if (readerManifest?.format && readerManifest.format !== 'unknown') return readerManifest.format;
    return inferFormatFromUrl(readerSession.signedUrl);
  }, [offlineRecord, readerManifest, readerSession]);

  const effectiveBookmarks = useMemo(() => {
    const merged = new Map<string, (typeof bookmarks)[number]>();
    for (const bookmark of bookmarks) {
      merged.set(bookmark.bookmarkId, bookmark);
    }

    for (const [pageKey, override] of Object.entries(bookmarkOverrides)) {
      const page = Number(pageKey);
      if (!Number.isFinite(page)) continue;

      const existing = Array.from(merged.values()).find((entry) => entry.page === page);
      if (override === null) {
        if (existing) {
          merged.delete(existing.bookmarkId);
        }
        continue;
      }

      merged.set(override.bookmarkId, {
        bookmarkId: override.bookmarkId,
        bookId: bookId || '',
        label: `Page ${page}`,
        page,
        cfi: null,
        updatedAt: null,
      });
    }

    return Array.from(merged.values());
  }, [bookmarkOverrides, bookmarks, bookId]);

  const activeBookmark = useMemo(
    () => effectiveBookmarks.find((bookmark) => bookmark.page === currentPage) || null,
    [currentPage, effectiveBookmarks]
  );

  const effectiveHighlights = useMemo(() => {
    const merged = new Map<string, (typeof highlights)[number]>();
    for (const highlight of highlights) {
      merged.set(highlight.cfi || highlight.highlightId, highlight);
    }

    for (const [anchorKey, override] of Object.entries(highlightOverrides)) {
      if (override === null) {
        merged.delete(anchorKey);
        continue;
      }

      merged.set(anchorKey, {
        highlightId: override.highlightId,
        bookId: bookId || '',
        quote: override.quote,
        note: '',
        color: override.color,
        page: override.page,
        cfi: override.cfi,
        updatedAt: null,
      });
    }

    return Array.from(merged.values());
  }, [bookId, highlightOverrides, highlights]);

  const selectedHighlight = useMemo(
    () =>
      pendingHighlightSelection
        ? effectiveHighlights.find((highlight) => highlight.cfi === pendingHighlightSelection.cfi) || null
        : null,
    [effectiveHighlights, pendingHighlightSelection]
  );
  const runtimeHighlights = useMemo<ReaderHighlightOverlay[]>(
    () =>
      effectiveHighlights.map((highlight) => ({
        highlightId: highlight.highlightId,
        cfi: highlight.cfi,
        color: highlight.color,
        page: highlight.page,
        quote: highlight.quote,
      })),
    [effectiveHighlights]
  );

  const handleBookmarkToggle = useCallback(async () => {
    if (!bookId) return;

    const page = Math.max(1, Math.trunc(currentPage));
    const bookmarkId = activeBookmark?.bookmarkId || `page_${page}`;

    if (activeBookmark) {
      setBookmarkOverrides((current) => ({
        ...current,
        [page]: null,
      }));

      enqueueBookmarkDeleteSyncOperation({
        bookId,
        bookmarkId,
      });
    } else {
      setBookmarkOverrides((current) => ({
        ...current,
        [page]: { bookmarkId },
      }));

      enqueueBookmarkUpsertSyncOperation({
        bookId,
        bookmarkId,
        page,
        label: `Page ${page}`,
      });
    }

    try {
      await flushReaderOperations({
        batchSize: 20,
        maxBatches: 3,
      });
      await refetchBookmarks();
    } catch (error) {
      console.warn('[READER][BOOKMARK_SYNC_DEFERRED]', error);
    }
  }, [activeBookmark, bookId, currentPage, refetchBookmarks]);

  const handleHighlightToggle = useCallback(async () => {
    if (!bookId) return;
    if (!pendingHighlightSelection) {
      showToast(
        lang === 'en'
          ? 'Select text to create a highlight.'
          : 'حدد نصاً لإنشاء تمييز.'
      );
      return;
    }

    const anchorKey = pendingHighlightSelection.cfi;
    const highlightId =
      selectedHighlight?.highlightId ||
      buildHighlightId(anchorKey, pendingHighlightSelection.page);

    if (selectedHighlight) {
      setHighlightOverrides((current) => ({
        ...current,
        [anchorKey]: null,
      }));

      enqueueHighlightDeleteSyncOperation({
        bookId,
        highlightId: selectedHighlight.highlightId,
      });
    } else {
      setHighlightOverrides((current) => ({
        ...current,
        [anchorKey]: {
          highlightId,
          cfi: pendingHighlightSelection.cfi,
          page: pendingHighlightSelection.page,
          quote: pendingHighlightSelection.quote,
          color: 'yellow',
        },
      }));

      enqueueHighlightUpsertSyncOperation({
        bookId,
        highlightId,
        page: pendingHighlightSelection.page,
        color: 'yellow',
        quote: pendingHighlightSelection.quote,
        note: '',
        cfi: pendingHighlightSelection.cfi,
      });
    }

    try {
      await flushReaderOperations({
        batchSize: 20,
        maxBatches: 3,
      });
      await refetchHighlights();
      setPendingHighlightSelection(null);
    } catch (error) {
      console.warn('[READER][HIGHLIGHT_SYNC_DEFERRED]', error);
    }
  }, [bookId, lang, pendingHighlightSelection, refetchHighlights, selectedHighlight, showToast]);

  const handleOfflineToggle = useCallback(async () => {
    if (!bookId) return;

    if (hasOfflineCopy) {
      setIsOfflineAssetBusy(true);
      try {
        await clearOfflineEbook(bookId);
        setOfflineRecord(null);
        setOfflineObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        showToast(
          lang === 'en' ? 'Offline copy removed.' : 'تمت إزالة النسخة غير المتصلة.'
        );
      } catch (error) {
        console.error('[READER][OFFLINE_REMOVE_FAILED]', error);
        showToast(
          lang === 'en'
            ? 'Unable to remove offline copy.'
            : 'تعذّر إزالة النسخة غير المتصلة.'
        );
      } finally {
        setIsOfflineAssetBusy(false);
      }
      return;
    }

    if (isOffline) {
      showToast(
        lang === 'en'
          ? 'Reconnect to download this book for offline reading.'
          : 'أعد الاتصال لتنزيل هذا الكتاب للقراءة دون اتصال.'
      );
      return;
    }

    setIsOfflineAssetBusy(true);
    try {
      const nextRecord = await markEbookOffline(bookId);
      setOfflineRecord(nextRecord);
      showToast(
        lang === 'en' ? 'Book is now available offline.' : 'أصبح الكتاب متاحاً دون اتصال.'
      );
    } catch (error) {
      console.error('[READER][OFFLINE_DOWNLOAD_FAILED]', error);
      showToast(
        lang === 'en'
          ? 'Unable to prepare offline reading for this book.'
          : 'تعذّر تجهيز القراءة دون اتصال لهذا الكتاب.'
      );
    } finally {
      setIsOfflineAssetBusy(false);
    }
  }, [bookId, hasOfflineCopy, isOffline, lang, showToast]);

  // -------------------------------------------------
  // Progress persistence (authoritative)
  // -------------------------------------------------
  const persistProgress = useCallback(
    async (payload: {
      bookId: string;
      currentPage: number;
      totalPages: number;
      percentage: number;
      format: ReaderFormat;
      readingMode: 'scroll' | 'page';
      paragraphIndex: number | null;
    }) => {
      try {
        const fn = httpsCallable(getFunctions(), 'recordReadingProgress');
        const res = await fn({
          bookId: payload.bookId,
          currentPage: payload.currentPage,
          totalPages: payload.totalPages,
          percentage: payload.percentage,
          lastPosition: {
            page: payload.currentPage,
            totalPages: payload.totalPages,
            format: payload.format,
            mode: payload.readingMode,
            paragraphIndex: payload.paragraphIndex,
          },
          ...(recommendationContext ? { recommendationContext } : {}),
        });

        const envelope = res.data as any;
        if (envelope?.success === false) {
          const errorCode =
            typeof envelope?.error?.code === 'string' ? envelope.error.code : 'UNKNOWN';
          const errorMessage =
            typeof envelope?.error?.message === 'string'
              ? envelope.error.message
              : 'Progress write rejected.';
          throw new Error(`[${errorCode}] ${errorMessage}`);
        }

        queryClient.invalidateQueries({
          queryKey: ['currentlyReading'],
        });
      } catch (error) {
        console.warn('[READER][PROGRESS_PERSIST_FAILED]', error);
        enqueueProgressSyncOperation({
          bookId: payload.bookId,
          currentPage: payload.currentPage,
          totalPages: payload.totalPages,
          percentage: payload.percentage,
          ...(recommendationContext ? { recommendationContext } : {}),
          lastPosition: {
            page: payload.currentPage,
            totalPages: payload.totalPages,
            format: payload.format,
            mode: payload.readingMode,
            paragraphIndex: payload.paragraphIndex,
          },
        });
      }
    },
    [queryClient, recommendationContext]
  );

  useEffect(() => {
    if (!bookId) return;
    if (typeof window === 'undefined') return;

    const flush = () => {
      void flushReaderOperations({
        batchSize: 20,
        maxBatches: 3,
      }).catch(error => {
        console.warn('[READER][SYNC_FLUSH_FAILED]', error);
      });
    };

    flush();
    window.addEventListener('online', flush);
    return () => {
      window.removeEventListener('online', flush);
    };
  }, [bookId]);

  useEffect(() => {
    if (!bookId || !isOffline || !hasOfflineCopy) {
      setOfflineObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    let active = true;
    let createdUrl: string | null = null;

    void getOfflineBookObjectUrl(bookId)
      .then((nextUrl) => {
        if (!active) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        createdUrl = nextUrl;
        setOfflineObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      })
      .catch((error) => {
        console.warn('[READER][OFFLINE_OBJECT_URL_FAILED]', error);
        if (!active) return;
        setOfflineObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [bookId, hasOfflineCopy, isOffline]);

  useEffect(() => {
    if (!bookId || loadingSession || renderError || (!readerSession && !hasOfflineCopy)) return;
    if (!canPersistProgress) {
      latestProgressPayloadRef.current = null;
      return;
    }

    const format = effectiveFormat;
    const safeTotal = Math.max(1, Math.trunc(totalPages || 1));
    const safePage = Math.min(Math.max(1, Math.trunc(currentPage || 1)), safeTotal);
    const percentage = Math.min(1, Math.max(0, safePage / safeTotal));
    const payload = {
      bookId,
      currentPage: safePage,
      totalPages: safeTotal,
      percentage,
      format,
      readingMode,
      paragraphIndex: narration.paragraphIndex,
    };
    latestProgressPayloadRef.current = payload;
    const fingerprint = `${bookId}:${safePage}:${safeTotal}:${format}:${readingMode}:${narration.paragraphIndex ?? 'none'}`;

    if (lastProgressFingerprintRef.current === fingerprint) return;

    if (progressWriteTimerRef.current) {
      clearTimeout(progressWriteTimerRef.current);
    }

    progressWriteTimerRef.current = setTimeout(() => {
      void persistProgress(payload);
      lastProgressFingerprintRef.current = fingerprint;
      progressWriteTimerRef.current = null;
    }, 1200);

    return () => {
      if (progressWriteTimerRef.current) {
        clearTimeout(progressWriteTimerRef.current);
      }
    };
  }, [
    bookId,
    currentPage,
    hasOfflineCopy,
    loadingSession,
    persistProgress,
    readerSession,
    readingMode,
    narration.paragraphIndex,
    effectiveFormat,
    renderError,
    totalPages,
    canPersistProgress,
  ]);

  useEffect(() => {
    if (!bookId || !hasOfflineCopy) return;
    if (offlineRecord?.lastKnownPage === currentPage) return;
    const nextRecord = updateOfflineLastKnownPage(bookId, currentPage);
    if (nextRecord) {
      setOfflineRecord(nextRecord);
    }
  }, [bookId, currentPage, hasOfflineCopy, offlineRecord?.lastKnownPage]);

  useEffect(() => {
    return () => {
      if (progressWriteTimerRef.current) {
        clearTimeout(progressWriteTimerRef.current);
        progressWriteTimerRef.current = null;
      }

      const payload = latestProgressPayloadRef.current;
      if (!payload) return;

      const fingerprint = `${payload.bookId}:${payload.currentPage}:${payload.totalPages}:${payload.format}:${payload.readingMode}:${payload.paragraphIndex ?? 'none'}`;
      if (lastProgressFingerprintRef.current === fingerprint) return;

      void persistProgress(payload);
      lastProgressFingerprintRef.current = fingerprint;
    };
  }, [persistProgress]);

  // -------------------------------------------------
  // Loading state
  // -------------------------------------------------
  if (isBookLoading || (loadingSession && !hasOfflineCopy) || (isOffline && hasOfflineCopy && !offlineObjectUrl)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <LoadingSpinner />
      </div>
    );
  }

  // -------------------------------------------------
  // Terminal guard
  // -------------------------------------------------
  if (!bookId || (sessionError && !hasOfflineCopy)) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white gap-6">
        <p className="text-white/60 text-sm">
          {lang === 'en'
            ? 'This book is not available for reading.'
            : 'هذا الكتاب غير متاح للقراءة.'}
        </p>
        <button
          onClick={handleBack}
          className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 transition"
        >
          {lang === 'en' ? 'Back' : 'عودة'}
        </button>
      </div>
    );
  }

  if (book === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <LoadingSpinner />
      </div>
    );
  }

  const activeReaderUrl = offlineObjectUrl || readerSession?.signedUrl || null;
  const initialReaderPage =
    !shouldUseManifestContinuityEstimate || !manifestEstimatedPageCount
      ? hasOfflineCopy && typeof offlineRecord?.lastKnownPage === 'number'
        ? Math.max(1, Math.trunc(offlineRecord.lastKnownPage))
        : readerSession?.resumePage || 1
      : clampReaderPage(
          hasOfflineCopy && typeof offlineRecord?.lastKnownPage === 'number'
            ? Math.max(1, Math.trunc(offlineRecord.lastKnownPage))
            : readerSession?.resumePage || 1,
          manifestEstimatedPageCount
        );

  if (!book || !activeReaderUrl) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <LoadingSpinner />
      </div>
    );
  }

  const runtimeSelection = resolveReaderEngine({
    platform: 'web',
    format: effectiveFormat,
  });
  const progressPercent =
    totalPages > 0 ? Math.min(100, Math.max(0, (currentPage / totalPages) * 100)) : 0;
  const renderOpenFileFallback = (message: string) => (
    <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-4 text-white">
      <p className="text-sm text-white/70 max-w-md">{message}</p>
      <a
        href={activeReaderUrl}
        target="_blank"
        rel="noreferrer"
        className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 transition"
        onClick={(e) => e.stopPropagation()}
      >
        {lang === 'en' ? 'Open File' : 'فتح الملف'}
      </a>
    </div>
  );

  return (
    <div
      className="reader-container h-screen w-full flex flex-col overflow-hidden"
      style={{
        backgroundColor:
          theme === 'light' ? '#ffffff' : theme === 'sepia' ? '#F3E9D2' : '#000000',
      }}
    >
      <ReaderChrome
        isVisible={isChromeVisible}
        book={book}
        onBack={handleBack}
        progress={progressPercent}
        currentPage={currentPage}
        totalPages={totalPages}
        onSettingsClick={() => setIsSettingsVisible(true)}
        onListeningClick={handleListeningClick}
        narrationState={narration.status}
        isBookmarked={Boolean(activeBookmark)}
        onBookmarkToggle={handleBookmarkToggle}
        isHighlighted={Boolean(selectedHighlight || pendingHighlightSelection)}
        onHighlightToggle={handleHighlightToggle}
        isOfflineAvailable={hasOfflineCopy}
        isOfflineBusy={isOfflineAssetBusy}
        onOfflineToggle={handleOfflineToggle}
      />

      <div
        className="flex-grow min-h-0 relative"
        onClick={() => {
          if (pendingHighlightSelection) return;
          setIsChromeVisible((v) => !v);
        }}
      >
        {renderError ? (
          renderOpenFileFallback(renderError)
        ) : (
          <ReaderSurface
            selection={runtimeSelection}
            signedUrl={activeReaderUrl}
            initialPage={initialReaderPage}
            theme={theme}
            readingMode={readingMode}
            fontSize={fontSize}
            fontStyle={fontStyle}
            highlights={runtimeHighlights}
            onPageChange={handleReaderPageChange}
            onPdfLoadError={handlePdfLoadError}
            onEpubLoadError={handleEpubLoadError}
            onTextSelection={setPendingHighlightSelection}
            onNarrationSnapshotChange={setNarrationSnapshot}
            renderUnsupported={() =>
              renderOpenFileFallback(
                lang === 'en'
                  ? 'This ebook format is not recognized by the in-app reader yet.'
                  : 'صيغة هذا الكتاب الإلكتروني غير معروفة للقارئ داخل التطبيق حالياً.'
              )
            }
          />
        )}
      </div>

      <NarrationMicroPlayer
        isVisible={narration.status !== 'idle'}
        title={lang === 'en' ? book.titleEn : book.titleAr}
        status={narration.status}
        playbackRate={narration.playbackRate}
        onPrevious={narration.jumpToPreviousParagraph}
        onPlayPause={handleListeningClick}
        onNext={narration.jumpToNextParagraph}
        onSpeedChange={narration.cyclePlaybackRate}
        onClose={narration.stop}
      />

      {pendingHighlightSelection && (
        <QuoteBubble
          rect={pendingHighlightSelection.rect}
          onSave={() => {
            void handleHighlightToggle();
          }}
          onDismiss={() => setPendingHighlightSelection(null)}
          saveLabel={selectedHighlight ? (lang === 'en' ? 'Remove Highlight' : 'إزالة التمييز') : (lang === 'en' ? 'Highlight' : 'تمييز')}
          icon={<HighlightIcon className="h-4 w-4 text-amber-400" />}
        />
      )}

      {isSettingsVisible && (
        <ReaderSettings onClose={() => setIsSettingsVisible(false)} />
      )}
    </div>
  );
};

export default ReaderScreen;
