// app/reader.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import ReaderChrome from '../components/reader/ReaderChrome.tsx';
import ReaderSettings from '../components/reader/ReaderSettings.tsx';
import { useToast } from '../store/toast.tsx';
import { useEbookReaderAccess } from '../lib/hooks/useEbookReaderAccess';

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';

const ReaderScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang } = useI18n();
  const { showToast } = useToast();

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
  } | null>(null);

  const [loadingSession, setLoadingSession] = useState(true);

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

        const data = res.data as {
          signedUrl: string;
          resumePage: number;
        };

        setReaderSession(data);
      } catch (err) {
        showToast({
          title:
            lang === 'en'
              ? 'Unable to open book'
              : 'تعذّر فتح الكتاب',
          description:
            lang === 'en'
              ? 'Please try again later.'
              : 'يرجى المحاولة لاحقًا.',
          variant: 'destructive',
        });

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

  return (
    <div className="reader-container h-screen w-full flex flex-col bg-black overflow-hidden">
      <ReaderChrome
        isVisible={isChromeVisible}
        book={book}
        onBack={handleBack}
        progress={0}          // progress now derives from session pipeline (future phase)
        currentPage={readerSession.resumePage}
        totalPages={1}        // placeholder until surfaced by reader engine
        onSettingsClick={() => setIsSettingsVisible(true)}
        onListeningClick={() => {}}
      />

      {/* 🔒 PDF RENDER (CANONICAL, MEDIATED) */}
      <div
        className="flex-grow relative"
        onClick={() => setIsChromeVisible((v) => !v)}
      >
        <iframe
          src={`${readerSession.signedUrl}#page=${readerSession.resumePage}`}
          title={lang === 'en' ? book.titleEn : book.titleAr}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {isSettingsVisible && (
        <ReaderSettings onClose={() => setIsSettingsVisible(false)} />
      )}
    </div>
  );
};

export default ReaderScreen;
