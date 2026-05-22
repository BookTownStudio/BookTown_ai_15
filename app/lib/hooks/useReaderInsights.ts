// app/lib/hooks/useReaderInsights.ts

import { useEffect, useState } from "react";
import { httpsCallable, getFunctions } from "firebase/functions";
import { useToast } from "../../../store/toast.tsx";

/**
 * ReaderInsights
 *
 * 🔒 ANALYTICS-SAFE, READ-ONLY VIEW MODEL
 *
 * - Derived exclusively from server aggregation (getReaderInsights)
 * - No direct Firestore access
 * - No client-side writes
 * - Safe for dashboards, streaks, badges
 */
export interface ReaderInsights {
  currentlyReading: {
    bookId: string;
    progress: number;
    status_state?: 'reading' | 'paused' | 'rereading';
    continuityLevel?: string | null;
    sourceType?: string | null;
    lastPosition: any;
    lastActiveAt?: any;
  }[];
  finishedCount: number;
  totalReadingTimeSeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

/**
 * useReaderInsights
 *
 * Contract:
 * - Read-only
 * - Server-authoritative
 * - Optional bookId for scoped insights
 * - Non-blocking UX (toast on failure)
 */
export function useReaderInsights(bookId?: string) {
  const { showToast } = useToast();

  const [data, setData] = useState<ReaderInsights | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchInsights() {
      try {
        setIsLoading(true);
        setError(null);

        const fn = httpsCallable(getFunctions(), "getReaderInsights");

        // 🔒 Server decides aggregation scope
        const res = await fn(bookId ? { bookId } : undefined);

        if (!isMounted) return;

        setData(res.data as ReaderInsights);
      } catch (err: any) {
        const message =
          err?.message || "Failed to load reading insights.";

        if (!isMounted) return;

        setError(message);
        showToast(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchInsights();

    return () => {
      isMounted = false;
    };
  }, [bookId, showToast]);

  return {
    insights: data,
    isLoading,
    error,
  };
}
