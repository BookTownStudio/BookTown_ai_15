import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  ReaderNarrationSessionState,
  ReaderNarrationSnapshot,
} from '../reader/runtime/contracts.ts';
import { BrowserSpeechSynthesisProvider } from '../reader/narration/browserSpeechSynthesisProvider.ts';
import type { SpeechProvider } from '../reader/narration/speechProvider.ts';

type NarrationStatus = 'idle' | 'playing' | 'paused';

interface UseReaderNarrationParams {
  bookId?: string;
  progressParagraphIndex?: number | null;
  sessionNarration?: ReaderNarrationSessionState | null;
  snapshot: ReaderNarrationSnapshot | null;
  language: string;
}

interface NarrationToggleResult {
  ok: boolean;
  reason?: string;
}

interface UpdateNarrationSessionRequest {
  bookId: string;
  narration: ReaderNarrationSessionState;
}

const SPEED_STEPS = [1, 1.25, 1.5, 2] as const;
const PERSIST_DEBOUNCE_MS = 400;

function clampIndex(index: number, total: number): number {
  const safeTotal = Math.max(1, Math.trunc(total));
  return Math.min(Math.max(0, Math.trunc(index)), safeTotal - 1);
}

function normalizeSpeechLang(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized.startsWith('ar')) return 'ar-SA';
  return 'en-US';
}

function roundPlaybackRate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useReaderNarration({
  bookId,
  progressParagraphIndex,
  sessionNarration,
  snapshot,
  language,
}: UseReaderNarrationParams) {
  const [status, setStatus] = useState<NarrationStatus>(
    sessionNarration?.paused ? 'paused' : 'idle'
  );
  const [playbackRate, setPlaybackRate] = useState<number>(
    roundPlaybackRate(sessionNarration?.playbackRate ?? 1)
  );
  const [paragraphIndex, setParagraphIndex] = useState<number>(
    Math.max(0, Math.trunc(progressParagraphIndex ?? 0))
  );
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(false);

  const providerRef = useRef<SpeechProvider | null>(null);
  const statusRef = useRef<NarrationStatus>('idle');
  const playbackRateRef = useRef<number>(playbackRate);
  const paragraphIndexRef = useRef<number>(paragraphIndex);
  const snapshotRef = useRef<ReaderNarrationSnapshot | null>(snapshot);
  const needsRestartOnResumeRef = useRef<boolean>(false);
  const hydratedFromSessionRef = useRef<boolean>(false);
  const persistFingerprintRef = useRef<string>('');
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    paragraphIndexRef.current = paragraphIndex;
  }, [paragraphIndex]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    providerRef.current?.stop();
    hydratedFromSessionRef.current = false;
    needsRestartOnResumeRef.current = false;
    persistFingerprintRef.current = '';
    setStatus(sessionNarration?.paused ? 'paused' : 'idle');
    setError(null);
    setPlaybackRate(roundPlaybackRate(sessionNarration?.playbackRate ?? 1));
    setParagraphIndex(Math.max(0, Math.trunc(progressParagraphIndex ?? 0)));
  }, [bookId, progressParagraphIndex, sessionNarration?.paused, sessionNarration?.playbackRate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const provider = new BrowserSpeechSynthesisProvider(window);
    providerRef.current = provider;
    setIsSupported(provider.isSupported());

    return () => {
      provider.destroy();
      providerRef.current = null;
    };
  }, []);

  const persistSessionNarration = useCallback(
    async (nextPlaybackRate: number, nextPaused: boolean) => {
      if (!bookId) return;
      const callable = httpsCallable<UpdateNarrationSessionRequest, { ok: true }>(
        getFunctions(),
        'updateReadingSessionNarration'
      );
      await callable({
        bookId,
        narration: {
          provider: 'browser_speech_synthesis',
          playbackRate: roundPlaybackRate(nextPlaybackRate),
          paused: nextPaused,
        },
      });
    },
    [bookId]
  );

  const stopInternal = useCallback((resetToVisibleParagraph: boolean) => {
    providerRef.current?.stop();
    needsRestartOnResumeRef.current = false;
    setStatus('idle');
    if (resetToVisibleParagraph && snapshotRef.current?.paragraphs.length) {
      setParagraphIndex(
        clampIndex(
          snapshotRef.current.currentParagraphIndex,
          snapshotRef.current.paragraphs.length
        )
      );
    }
  }, []);

  const speakParagraph = useCallback(
    (nextParagraphIndex: number) => {
      const provider = providerRef.current;
      const activeSnapshot = snapshotRef.current;
      if (!provider || !provider.isSupported()) {
        setError('Narration is not supported in this browser.');
        setStatus('idle');
        return false;
      }
      if (!activeSnapshot || activeSnapshot.paragraphs.length === 0) {
        setError('Visible text is not ready for narration yet.');
        setStatus('idle');
        return false;
      }

      const clampedIndex = clampIndex(nextParagraphIndex, activeSnapshot.paragraphs.length);
      const paragraph = activeSnapshot.paragraphs[clampedIndex];
      if (!paragraph) {
        setError('Visible text is not ready for narration yet.');
        setStatus('idle');
        return false;
      }

      setError(null);
      setParagraphIndex(clampedIndex);
      setStatus('playing');
      needsRestartOnResumeRef.current = false;

      try {
        provider.speak({
          text: paragraph.text,
          rate: playbackRateRef.current,
          lang: normalizeSpeechLang(language),
          onEnd: () => {
            const latestSnapshot = snapshotRef.current;
            if (!latestSnapshot || latestSnapshot.paragraphs.length === 0) {
              stopInternal(true);
              return;
            }

            const nextIndex = clampedIndex + 1;
            if (nextIndex >= latestSnapshot.paragraphs.length) {
              stopInternal(false);
              return;
            }

            void speakParagraph(nextIndex);
          },
          onError: (nextError) => {
            console.warn('[READER][NARRATION_SPEAK_FAILED]', nextError);
            setError(nextError.message);
            stopInternal(false);
          },
        });
        return true;
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : 'Narration failed to start.';
        console.warn('[READER][NARRATION_START_FAILED]', nextError);
        setError(message);
        stopInternal(false);
        return false;
      }
    },
    [language, stopInternal]
  );

  useEffect(() => {
    if (!snapshot || snapshot.paragraphs.length === 0) {
      if (statusRef.current !== 'idle') {
        stopInternal(false);
      }
      return;
    }

    setParagraphIndex((current) => {
      if (!hydratedFromSessionRef.current) {
        hydratedFromSessionRef.current = true;
        const initialIndex = progressParagraphIndex ?? snapshot.currentParagraphIndex;
        return clampIndex(initialIndex, snapshot.paragraphs.length);
      }

      if (statusRef.current === 'idle') {
        return clampIndex(snapshot.currentParagraphIndex, snapshot.paragraphs.length);
      }

      return clampIndex(current, snapshot.paragraphs.length);
    });
  }, [progressParagraphIndex, snapshot, stopInternal]);

  useEffect(() => {
    if (
      sessionNarration &&
      sessionNarration.provider === 'browser_speech_synthesis' &&
      statusRef.current !== 'playing'
    ) {
      setPlaybackRate(roundPlaybackRate(sessionNarration.playbackRate));
      setStatus(sessionNarration.paused ? 'paused' : 'idle');
    }
  }, [sessionNarration]);

  useEffect(() => {
    if (!bookId) return undefined;

    const paused = status === 'paused';
    const fingerprint = `${bookId}:${playbackRate}:${paused}`;
    if (persistFingerprintRef.current === fingerprint) {
      return undefined;
    }

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      void persistSessionNarration(playbackRate, paused)
        .then(() => {
          persistFingerprintRef.current = fingerprint;
        })
        .catch((nextError) => {
          console.warn('[READER][NARRATION_SESSION_PERSIST_FAILED]', nextError);
        })
        .finally(() => {
          persistTimerRef.current = null;
        });
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [bookId, persistSessionNarration, playbackRate, status]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.hidden && statusRef.current === 'playing') {
        const paused = providerRef.current?.pause() ?? false;
        if (paused) {
          setStatus('paused');
          return;
        }
        providerRef.current?.stop();
        needsRestartOnResumeRef.current = true;
        setStatus('paused');
      }
    };

    const handlePageHide = () => {
      if (statusRef.current === 'idle') return;
      providerRef.current?.stop();
      needsRestartOnResumeRef.current = true;
      setStatus('paused');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

  const togglePlayback = useCallback((): NarrationToggleResult => {
    if (!isSupported) {
      return {
        ok: false,
        reason: 'Narration is not supported in this browser.',
      };
    }

    const activeSnapshot = snapshotRef.current;
    if (!activeSnapshot || activeSnapshot.paragraphs.length === 0) {
      return {
        ok: false,
        reason: 'Visible text is not ready for narration yet.',
      };
    }

    if (statusRef.current === 'playing') {
      const paused = providerRef.current?.pause() ?? false;
      if (!paused) {
        providerRef.current?.stop();
        needsRestartOnResumeRef.current = true;
      }
      setStatus('paused');
      return { ok: true };
    }

    if (statusRef.current === 'paused') {
      if (needsRestartOnResumeRef.current) {
        return {
          ok: speakParagraph(paragraphIndexRef.current),
          reason: 'Narration failed to resume.',
        };
      }

      const resumed = providerRef.current?.resume() ?? false;
      if (resumed) {
        setStatus('playing');
        return { ok: true };
      }

      return {
        ok: speakParagraph(paragraphIndexRef.current),
        reason: 'Narration failed to resume.',
      };
    }

    return {
      ok: speakParagraph(paragraphIndexRef.current),
      reason: 'Narration failed to start.',
    };
  }, [isSupported, speakParagraph]);

  const stop = useCallback(() => {
    stopInternal(true);
  }, [stopInternal]);

  const jumpParagraph = useCallback(
    (delta: -1 | 1) => {
      const activeSnapshot = snapshotRef.current;
      if (!activeSnapshot || activeSnapshot.paragraphs.length === 0) {
        return false;
      }

      const targetIndex = clampIndex(
        paragraphIndexRef.current + delta,
        activeSnapshot.paragraphs.length
      );

      if (statusRef.current === 'paused') {
        providerRef.current?.stop();
        needsRestartOnResumeRef.current = true;
        setParagraphIndex(targetIndex);
        return true;
      }

      return speakParagraph(targetIndex);
    },
    [speakParagraph]
  );

  const cyclePlaybackRate = useCallback(() => {
    const currentIndex = SPEED_STEPS.findIndex(
      (value) => value === roundPlaybackRate(playbackRateRef.current)
    );
    const nextRate = SPEED_STEPS[(currentIndex + 1 + SPEED_STEPS.length) % SPEED_STEPS.length];

    setPlaybackRate(nextRate);

    if (statusRef.current === 'playing') {
      void speakParagraph(paragraphIndexRef.current);
      return;
    }

    if (statusRef.current === 'paused') {
      providerRef.current?.stop();
      needsRestartOnResumeRef.current = true;
    }
  }, [speakParagraph]);

  const canNarrate = isSupported && Boolean(snapshot?.paragraphs.length);

  return useMemo(
    () => ({
      status,
      playbackRate,
      paragraphIndex,
      isSupported,
      canNarrate,
      error,
      togglePlayback,
      jumpToPreviousParagraph: () => jumpParagraph(-1),
      jumpToNextParagraph: () => jumpParagraph(1),
      stop,
      cyclePlaybackRate,
    }),
    [
      canNarrate,
      cyclePlaybackRate,
      error,
      isSupported,
      jumpParagraph,
      paragraphIndex,
      playbackRate,
      status,
      stop,
      togglePlayback,
    ]
  );
}
