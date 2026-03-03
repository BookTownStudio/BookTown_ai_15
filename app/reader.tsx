// app/reader.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import ReaderChrome from '../components/reader/ReaderChrome.tsx';
import ReaderSettings from '../components/reader/ReaderSettings.tsx';
import ReaderSurface from '../components/reader/runtime/ReaderSurface.tsx';
import { useToast } from '../store/toast.tsx';
import { useReadingPreferences } from '../store/reading-prefs.tsx';
import {
  enqueueProgressSyncOperation,
  flushReaderOperations,
} from '../lib/reader/offline/readerSyncClient.ts';
import { useReaderSessionBootstrap } from '../lib/hooks/useReaderSessionBootstrap.ts';
import { resolveReaderEngine } from '../lib/reader/runtime/engineSelection.ts';

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import type { ReaderFormat } from '../lib/reader/runtime/contracts.ts';
import type { LibrarianRecommendationContext } from '../types/librarian.ts';

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

const ReaderScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();
  const { theme, readingMode, fontSize, fontStyle } = useReadingPreferences();

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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const progressWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressFingerprintRef = useRef<string>('');
  const latestProgressPayloadRef = useRef<{
    bookId: string;
    currentPage: number;
    totalPages: number;
    percentage: number;
    format: ReaderFormat;
    readingMode: 'scroll' | 'page';
  } | null>(null);

  const handleReaderPageChange = useCallback((nextPage: number, pagesCount: number) => {
    setCurrentPage(nextPage);
    setTotalPages(Math.max(1, pagesCount));
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
    showToast(
      lang === 'en'
        ? 'Audio narration is not available for this title yet.'
        : 'السرد الصوتي غير متاح لهذا العنوان حالياً.'
    );
  }, [lang, showToast]);

  useEffect(() => {
    if (!readerSession) return;
    const resumePage =
      typeof readerSession.resumePage === 'number' &&
      Number.isFinite(readerSession.resumePage) &&
      readerSession.resumePage > 0
        ? Math.trunc(readerSession.resumePage)
        : 1;
    setCurrentPage(resumePage);
    setTotalPages(1);
    setRenderError(null);
  }, [readerSession]);

  useEffect(() => {
    if (!sessionError) return;
    console.error('[READER][SESSION_INIT_FAILED]', sessionError);
    showToast(
      lang === 'en'
        ? 'Unable to open book. Please try again later.'
        : 'تعذّر فتح الكتاب. يرجى المحاولة لاحقًا.'
    );

    if (currentView.params?.from) navigate(currentView.params.from);
    else navigate({ type: 'tab', id: 'read' });
  }, [sessionError, showToast, lang, currentView.params, navigate]);

  const effectiveFormat = useMemo<ReaderFormat>(() => {
    if (!readerSession) return 'unknown';
    if (readerSession.format !== 'unknown') return readerSession.format;
    if (readerManifest?.format && readerManifest.format !== 'unknown') return readerManifest.format;
    return inferFormatFromUrl(readerSession.signedUrl);
  }, [readerManifest, readerSession]);

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
          },
        });
      }
    },
    [recommendationContext]
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
    if (!bookId || !readerSession || loadingSession || renderError) return;

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
    };
    latestProgressPayloadRef.current = payload;
    const fingerprint = `${bookId}:${safePage}:${safeTotal}:${format}:${readingMode}`;

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
    loadingSession,
    persistProgress,
    readerSession,
    readingMode,
    effectiveFormat,
    renderError,
    totalPages,
  ]);

  useEffect(() => {
    return () => {
      if (progressWriteTimerRef.current) {
        clearTimeout(progressWriteTimerRef.current);
        progressWriteTimerRef.current = null;
      }

      const payload = latestProgressPayloadRef.current;
      if (!payload) return;

      const fingerprint = `${payload.bookId}:${payload.currentPage}:${payload.totalPages}:${payload.format}:${payload.readingMode}`;
      if (lastProgressFingerprintRef.current === fingerprint) return;

      void persistProgress(payload);
      lastProgressFingerprintRef.current = fingerprint;
    };
  }, [persistProgress]);

  // -------------------------------------------------
  // Loading state
  // -------------------------------------------------
  if (isBookLoading || loadingSession) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <LoadingSpinner />
      </div>
    );
  }

  // -------------------------------------------------
  // Terminal guard
  // -------------------------------------------------
  if (!book || !readerSession) {
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
        href={readerSession.signedUrl}
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
      />

      <div
        className="flex-grow min-h-0 relative"
        onClick={() => setIsChromeVisible((v) => !v)}
      >
        {renderError ? (
          renderOpenFileFallback(renderError)
        ) : (
          <ReaderSurface
            selection={runtimeSelection}
            signedUrl={readerSession.signedUrl}
            initialPage={readerSession.resumePage}
            theme={theme}
            readingMode={readingMode}
            fontSize={fontSize}
            fontStyle={fontStyle}
            onPageChange={handleReaderPageChange}
            onPdfLoadError={handlePdfLoadError}
            onEpubLoadError={handleEpubLoadError}
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

      {isSettingsVisible && (
        <ReaderSettings onClose={() => setIsSettingsVisible(false)} />
      )}
    </div>
  );
};

export default ReaderScreen;
