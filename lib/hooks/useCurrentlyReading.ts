// lib/hooks/useCurrentlyReading.ts

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
import { getFirebaseDb } from '../firebase.ts';
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
    queryKey: ['currentlyReading', user?.uid, maxItems],
    enabled,
    queryFn: async () => {
      if (!user?.uid) return [];

      const db = getFirebaseDb();
      if (!db) return [];

      const progressQuery = query(
        collection(db, 'reading_progress'),
        where('uid', '==', user.uid),
        where('status_state', '==', 'reading'),
        orderBy('updatedAt', 'desc'),
        limit(maxItems)
      );

      const progressSnap = await getDocs(progressQuery);
      return progressSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          bookId: data.bookId,
          progress: typeof data.progress === 'number' ? data.progress : 0,
          updatedAt: data.updatedAt ?? null,
        } as CurrentlyReadingItem;
      });
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,   // 10 minutes
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
