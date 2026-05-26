// lib/hooks/useReaderProgress.ts

import { useEffect, useState, useCallback, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { CanonicalAnchorV1 } from "../reader/runtime/contracts.ts";

/**
 * useReaderProgress
 *
 * 🔒 AUTHORITATIVE READER STATE HOOK
 *
 * Responsibilities:
 * - Fetch reader progress (via Cloud Function)
 * - Record progress updates (debounced, mediated)
 * - Never touch Firestore directly
 *
 * Source of truth:
 * - functions/reader/getReaderProgress
 * - functions/reader/recordReadingProgress
 */

interface ReaderProgress {
  exists: boolean;
  bookId: string;
  progress: number; // 0.0 → 1.0
  status_state?: "reading" | "paused" | "abandoned" | "completed" | "rereading" | null;
  lastPosition: any | null;
  lastAnchor?: CanonicalAnchorV1 | null;
  anchorManifestVersion?: number | null;
  updatedAt?: any;
}

interface RecordProgressPayload {
  currentPage: number;
  totalPages: number;
  percentage: number; // 0 → 1
  lastPosition?: any;
}

// ⏱️ Tier-1 debounce interval (ms)
const RECORD_DEBOUNCE_MS = 2000;

export function useReaderProgress(bookId?: string) {
  const [progress, setProgress] = useState<ReaderProgress | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentProgress = useRef<number | null>(null);

  /**
   * 🔍 Fetch progress on mount / book change
   */
  useEffect(() => {
    if (!bookId) return;

    let isActive = true;

    const fetchProgress = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const getProgress = httpsCallable(getFunctions(), "getReaderProgress");
        const res = await getProgress({ bookId });

        if (!isActive) return;

        const data = res.data as ReaderProgress;
        setProgress(data);
        lastSentProgress.current = data.progress;
      } catch (err) {
        console.error("[READER][FETCH_PROGRESS_FAILED]", err);
        if (!isActive) return;
        setError("Failed to load reading progress.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchProgress();

    return () => {
      isActive = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [bookId]);

  /**
   * ✏️ Record progress (debounced, fire-and-forget)
   */
  const recordProgress = useCallback(
    (payload: RecordProgressPayload) => {
      if (!bookId) return;

      // Ignore no-op updates
      if (lastSentProgress.current === payload.percentage) return;

      // Clear pending send
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(async () => {
        try {
          const record = httpsCallable(getFunctions(), "recordReadingProgress");

          await record({
            bookId,
            currentPage: payload.currentPage,
            totalPages: payload.totalPages,
            percentage: payload.percentage,
            lastPosition: payload.lastPosition ?? null,
          });

          lastSentProgress.current = payload.percentage;

          // Optimistic local state
          setProgress({
            exists: true,
            bookId,
            progress: payload.percentage,
            status_state: "reading",
            lastPosition: payload.lastPosition ?? null,
            updatedAt: new Date(),
          });
        } catch (err) {
          // Silent by design — never block reader UX
          console.warn("[READER][RECORD_PROGRESS_FAILED]", err);
        }
      }, RECORD_DEBOUNCE_MS);
    },
    [bookId]
  );

  return {
    progress,
    isLoading,
    error,
    recordProgress,
  };
}
