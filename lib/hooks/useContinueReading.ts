// lib/hooks/useContinueReading.ts

import { useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '../firebase.ts';
import { useAuth } from '../auth.tsx';

/**
 * Continue Reading Hook
 * ----------------------------------------
 * Canonical, read-only hook that surfaces
 * the user's active reading sessions.
 *
 * SOURCE OF TRUTH:
 *  - reading_progress collection
 *
 * DEFINITIONS (LOCKED):
 *  - "Continue Reading" === status_state === 'currently_reading'
 *
 * GUARANTEES:
 *  - No writes
 *  - User-scoped only
 *  - Ordered by recency
 *  - Status-driven (no inference)
 *  - Safe for Home + Read reuse
 */

export interface ContinueReadingItem {
  bookId: string;
  progress: number; // display only (0.0 → 1.0)
  updatedAt: Timestamp | null;
}

interface UseContinueReadingResult {
  items: ContinueReadingItem[];
  isLoading: boolean;
}

export function useContinueReading(
  maxItems: number = 8
): UseContinueReadingResult {
  const { user } = useAuth();
  const enabled = !!user?.uid;

  const queryResult = useQuery({
    queryKey: ['continueReading', user?.uid, maxItems],
    enabled,

    queryFn: async () => {
      if (!user?.uid) return [];

      /**
       * 🔒 Canonical query (SSoT enforced)
       * ---------------------------------
       * Strategy:
       * - Order by updatedAt when present
       * - Safely fallback to createdAt
       * - Never silently fail due to null ordering fields
       */
      const q = query(
        collection(db.raw, 'reading_progress'),
        where('userId', '==', user.uid),
        where('status_state', '==', 'currently_reading'),
        orderBy('updatedAt', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(maxItems)
      );

      const snap = await getDocs(q);

      return snap.docs.map(doc => {
        const data = doc.data();

        return {
          bookId: data.bookId,
          progress: typeof data.progress === 'number' ? data.progress : 0,
          updatedAt: data.updatedAt ?? data.createdAt ?? null,
        } as ContinueReadingItem;
      });
    },

    // 🧠 Continue Reading is moderately volatile
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,   // 10 minutes

    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    keepPreviousData: true,
  } as any);

  const items = useMemo(
    () => queryResult.data ?? [],
    [queryResult.data]
  );

  return {
    items,
    isLoading: queryResult.isLoading,
  };
}