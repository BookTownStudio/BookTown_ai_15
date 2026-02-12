// lib/hooks/useReadingProgress.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import { firestoreAdapter } from '../infrastructure/firebase/firestoreAdapter.ts';
import { useAuth } from '../auth.tsx';

/**
 * CANONICAL READING PROGRESS HOOK
 *
 * 🔒 Progress is tracked per (userId, bookId)
 * 🔒 Format-agnostic (PDF today, EPUB tomorrow)
 * 🔒 Debounced writes
 * 🔒 Reading_progress is the ONLY source of truth for "Continue Reading"
 */

export interface ReadingLocation {
  page?: number;
  scroll?: number;
  cfi?: string; // reserved for EPUB
}

export interface ReadingProgressState {
  progress: number; // 0 → 1
  location?: ReadingLocation;
}

const WRITE_DEBOUNCE_MS = 1200;

export function useReadingProgress(bookId?: string) {
  const { user } = useAuth();

  const [state, setState] = useState<ReadingProgressState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingState = useRef<ReadingProgressState | null>(null);

  const docPath =
    user && bookId
      ? `reading_progress/${user.uid}_${bookId}`
      : null;

  /**
   * ----------------------------------
   * Initial load / restore
   * ----------------------------------
   */
  useEffect(() => {
    if (!docPath) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const docData = await firestoreAdapter.getDoc<any>(docPath);

        if (!cancelled) {
          if (docData) {
            setState({
              progress: docData.progress ?? 0,
              location: docData.lastLocation ?? undefined,
            });
          } else {
            // Reader not started yet
            setState({ progress: 0 });
          }
        }
      } catch (err) {
        console.error('[READING_PROGRESS][LOAD_FAILED]', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  /**
   * ----------------------------------
   * Debounced writer
   * ----------------------------------
   */
  const flush = useCallback(async () => {
    if (!docPath || !pendingState.current || !user) return;

    const payload = pendingState.current;
    pendingState.current = null;

    try {
      const docData = await firestoreAdapter.getDoc<any>(docPath);

      if (docData) {
        await firestoreAdapter.updateDoc(docPath, {
          progress: payload.progress,
          lastLocation: payload.location || null,
          updatedAt: firestoreAdapter.serverTimestamp(),
        });
      } else {
        /**
         * 🔑 FIRST READER TOUCH
         * This is where "Continue Reading" is born.
         */
        await firestoreAdapter.setDoc(docPath, {
          userId: user.uid,
          bookId,
          progress: payload.progress,
          lastLocation: payload.location || null,
          status_state: 'currently_reading',
          createdAt: firestoreAdapter.serverTimestamp(),
          updatedAt: firestoreAdapter.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('[READING_PROGRESS][WRITE_FAILED]', err);
    }
  }, [docPath, bookId, user]);

  /**
   * ----------------------------------
   * Public update API (called by reader)
   * ----------------------------------
   */
  const updateProgress = useCallback(
    (progress: number, location?: ReadingLocation) => {
      if (!docPath) return;

      const next: ReadingProgressState = {
        progress: Math.max(0, Math.min(1, progress)),
        location,
      };

      setState(next);
      pendingState.current = next;

      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
      }

      writeTimer.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [docPath, flush]
  );

  /**
   * ----------------------------------
   * Final flush on unmount
   * ----------------------------------
   */
  useEffect(() => {
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
      }
      if (pendingState.current) {
        flush();
      }
    };
  }, [flush]);

  return {
    isLoading,
    progress: state?.progress ?? 0,
    location: state?.location,
    updateProgress,
  };
}
