// app/reader.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import ReaderChrome from '../components/reader/ReaderChrome.tsx';
import ReaderSettings from '../components/reader/ReaderSettings.tsx';
import PdfViewer from '../components/reader/PdfViewer.tsx';
import EpubViewer from '../components/reader/EpubViewer.tsx';
import { useToast } from '../store/toast.tsx';
import { useReadingPreferences } from '../store/reading-prefs.tsx';
import {
  enqueueProgressSyncOperation,
  flushReaderOperations,
} from '../lib/reader/offline/readerSyncClient.ts';

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';

type ReaderFormat = 'pdf' | 'epub' | 'unknown';

function inferFormatFromUrl(signedUrl: string): ReaderFormat {
  try {
    const parsed = new URL(signedUrl);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();

    if (path.endsWith('.pdf')) return 'pdf';
    if (path.endsWith('.epub')) return 'epub';

    const objectPath = decodeURIComponent(
      (parsed.pathname.split('/o/')[1] || '').split('?')[0] || ''
    ).toLowerCase();
    if (objectPath.endsWith('.pdf')) return 'pdf';
    if (objectPath.endsWith('.epub')) return 'epub';
  } catch {
    // ignore parse errors and use fallback below
  }

  const lower = signedUrl.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.includes('.epub')) return 'epub';
  return 'unknown';
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

  const { data: book, isLoading: isBookLoading } = useBookCatalog(bookId);

  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  // -------------------------------------------------
  // A4.5 — Canonical Reading Session
  // -------------------------------------------------
  const [readerSession, setReaderSession] = useState<{
    signedUrl: string;
    resumePage: number;
    format: ReaderFormat;
  } | null>(null);

  const [loadingSession, setLoadingSession] = useState(true);
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

  // -------------------------------------------------
  // Session bootstrap (authoritative)
  // -------------------------------------------------
  useEffect(() => {
    if (!bookId) return;

    let isMounted = true;

    async function initSession() {
      try {
        const fn = httpsCallable(
          getFunctions(),
          'getOrCreateReadingSession'
        );

        const res = await fn({ bookId });

        if (!isMounted) return;

        const payload = res.data as any;
        if (payload?.success === false) {
          const errorCode =
            typeof payload?.error?.code === 'string' ? payload.error.code : 'UNKNOWN';
          const errorMessage =
            typeof payload?.error?.message === 'string'
              ? payload.error.message
              : 'Reader session request failed.';
          throw new Error(`[${errorCode}] ${errorMessage}`);
        }

        const data =
          payload?.success === true && payload.data
            ? payload.data
            : payload;

        if (
          !data ||
          typeof data.signedUrl !== 'string' ||
          data.signedUrl.trim().length === 0
        ) {
          console.error('[READER][SESSION_INVALID_PAYLOAD]', payload);
          throw new Error('Invalid reader session payload.');
        }

        const resumePage =
          typeof data.resumePage === 'number' &&
          Number.isFinite(data.resumePage) &&
          data.resumePage > 0
            ? Math.trunc(data.resumePage)
            : 1;

        const format =
          data.format === 'pdf' || data.format === 'epub' || data.format === 'unknown'
            ? (data.format as ReaderFormat)
            : inferFormatFromUrl(data.signedUrl);

        setCurrentPage(resumePage);
        setTotalPages(1);
        setRenderError(null);

        setReaderSession({
          signedUrl: data.signedUrl,
          resumePage,
          format,
        });
      } catch (err) {
        console.error('[READER][SESSION_INIT_FAILED]', err);
        showToast(
          lang === 'en'
            ? 'Unable to open book. Please try again later.'
            : 'تعذّر فتح الكتاب. يرجى المحاولة لاحقًا.'
        );

        if (currentView.params?.from) navigate(currentView.params.from);
        else navigate({ type: 'tab', id: 'read' });
      } finally {
        if (isMounted) setLoadingSession(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [bookId, lang, navigate, showToast]);

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
          lastPosition: {
            page: payload.currentPage,
            totalPages: payload.totalPages,
            format: payload.format,
            mode: payload.readingMode,
          },
        });
      }
    },
    []
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

    const format =
      readerSession.format === 'unknown'
        ? inferFormatFromUrl(readerSession.signedUrl)
        : readerSession.format;
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

  const inferredFormat = inferFormatFromUrl(readerSession.signedUrl);
  const sessionFormat =
    readerSession.format === 'unknown' ? inferredFormat : readerSession.format;
  const progressPercent =
    totalPages > 0 ? Math.min(100, Math.max(0, (currentPage / totalPages) * 100)) : 0;

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
          <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-4 text-white">
            <p className="text-sm text-white/70 max-w-md">{renderError}</p>
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
        ) : sessionFormat === 'epub' ? (
          <EpubViewer
            url={readerSession.signedUrl}
            initialPage={readerSession.resumePage}
            theme={theme}
            readingMode={readingMode}
            fontSize={fontSize}
            fontStyle={fontStyle}
            onPageChange={handleReaderPageChange}
            onLoadError={handleEpubLoadError}
          />
        ) : sessionFormat === 'pdf' ? (
          <PdfViewer
            url={readerSession.signedUrl}
            initialPage={readerSession.resumePage}
            theme={theme}
            readingMode={readingMode}
            fontSize={fontSize}
            onPageChange={handleReaderPageChange}
            onLoadError={handlePdfLoadError}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-4 text-white">
            <p className="text-sm text-white/70 max-w-md">
              {lang === 'en'
                ? 'This ebook format is not recognized by the in-app reader yet.'
                : 'صيغة هذا الكتاب الإلكتروني غير معروفة للقارئ داخل التطبيق حالياً.'}
            </p>
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
        )}
      </div>

      {isSettingsVisible && (
        <ReaderSettings onClose={() => setIsSettingsVisible(false)} />
      )}
    </div>
  );
};

export default ReaderScreen;
