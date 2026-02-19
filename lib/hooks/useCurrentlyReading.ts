// lib/hooks/useCurrentlyReading.ts

import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth.tsx';

/**
 * Currently Reading (Home Projection)
 * ----------------------------------------
 * UX CONTRACT (LOCKED):
 * - Visibility is driven by reading_progress.status_state
 * - Progress is canonical from reading_progress
 * - Order is recency-first (updatedAt DESC)
 *
 * SOURCE OF TRUTH:
 * - reading_progress
 */

export interface CurrentlyReadingItem {
  bookId: string;
  progress: number; // 0.0 → 1.0 (defaults to 0)
  updatedAt: Timestamp | null;
}

interface UseCurrentlyReadingResult {
  items: CurrentlyReadingItem[];
  isLoading: boolean;
}

export function useCurrentlyReading(
  maxItems: number = 50
): UseCurrentlyReadingResult {
  const { user } = useAuth();
  const enabled = !!user?.uid;

  const queryResult = useQuery({
    queryKey: ['currentlyReading', user?.uid],
    enabled,
    queryFn: async () => {
      if (!user?.uid) return [];

      const fn = httpsCallable(getFunctions(), 'getReaderInsights');
      const res = await fn();
      const payload = res.data as any;

      if (payload?.success === false) {
        const code =
          typeof payload?.error?.code === 'string'
            ? payload.error.code
            : 'UNKNOWN';
        const message =
          typeof payload?.error?.message === 'string'
            ? payload.error.message
            : 'Failed to fetch currently reading projection.';
        throw new Error(`[${code}] ${message}`);
      }

      const data =
        payload?.success === true && payload?.data
          ? payload.data
          : payload;

      const rows = Array.isArray(data?.currentlyReading)
        ? data.currentlyReading
        : [];

      const deduped = new Set<string>();
      const items: CurrentlyReadingItem[] = [];

      for (const row of rows) {
        const bookId =
          typeof row?.bookId === 'string' ? row.bookId.trim() : '';
        if (!bookId || deduped.has(bookId)) continue;

        const progressRaw =
          typeof row?.progress === 'number' && Number.isFinite(row.progress)
            ? row.progress
            : 0;

        items.push({
          bookId,
          progress: Math.max(0, Math.min(1, progressRaw)),
          updatedAt:
            row?.lastActiveAt instanceof Timestamp ? row.lastActiveAt : null,
        });
        deduped.add(bookId);
      }

      return items;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,   // 10 minutes
  } as any);

  const items = useMemo(
    () => (queryResult.data ?? []).slice(0, Math.max(1, maxItems)),
    [maxItems, queryResult.data]
  );

  return {
    items,
    isLoading: queryResult.isLoading,
  };
}
