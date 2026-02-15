// app/reader.tsx

import React, { useState, useEffect, useCallback } from 'react';
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
  const { theme, readingMode } = useReadingPreferences();

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

  const handleBack = useCallback(() => {
    if (currentView.params?.from) navigate(currentView.params.from);
    else navigate({ type: 'tab', id: 'read' });
  }, [navigate, currentView]);

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

        navigate({ type: 'back' });
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
        onListeningClick={() => {}}
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
            onPageChange={(nextPage, pagesCount) => {
              setCurrentPage(nextPage);
              setTotalPages(Math.max(1, pagesCount));
            }}
            onLoadError={(message) => {
              console.error('[READER][EPUB_RENDER_FAILED]', message);
              setRenderError(
                lang === 'en'
                  ? 'Unable to render this EPUB in-app. You can open the file directly.'
                  : 'تعذّر عرض ملف EPUB داخل التطبيق. يمكنك فتح الملف مباشرة.'
              );
            }}
          />
        ) : sessionFormat === 'pdf' ? (
          <PdfViewer
            url={readerSession.signedUrl}
            initialPage={readerSession.resumePage}
            theme={theme}
            onPageChange={(nextPage, pagesCount) => {
              setCurrentPage(nextPage);
              setTotalPages(Math.max(1, pagesCount));
            }}
            onLoadError={(message) => {
              console.error('[READER][PDF_RENDER_FAILED]', message);
              setRenderError(
                lang === 'en'
                  ? 'Unable to render this PDF in-app. You can open the file directly.'
                  : 'تعذّر عرض ملف PDF داخل التطبيق. يمكنك فتح الملف مباشرة.'
              );
            }}
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
