// lib/hooks/useCurrentlyReading.ts

import { useMemo } from 'react';
import {
  collection,
  query,
  where,
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
 * - Visibility is driven by "Currently Reading" shelf
 * - Progress is OPTIONAL enhancement from reading_progress
 * - Never hide books due to missing progress
 *
 * SOURCE OF TRUTH:
 * - Shelf membership (visibility)
 * - reading_progress (progress only)
 */

const SYSTEM_CURRENTLY_READING_SHELF_ID = 'currently-reading';

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

      // ✅ FIX: Firestore instance is authoritative (no db.raw)
      const db = getFirebaseDb();
      if (!db) return [];

      /**
       * ----------------------------------
       * 1️⃣ Load Currently Reading shelf
       * ----------------------------------
       */
      const shelfQuery = query(
        collection(db, 'shelves'),
        where('ownerId', '==', user.uid),
        where('id', '==', SYSTEM_CURRENTLY_READING_SHELF_ID),
        limit(1)
      );

      const shelfSnap = await getDocs(shelfQuery);
      if (shelfSnap.empty) return [];

      const shelf = shelfSnap.docs[0].data();
      const entries = shelf.entries ?? {};

      const bookIds: string[] = Object.keys(entries);
      if (bookIds.length === 0) return [];

      /**
       * ----------------------------------
       * 2️⃣ Load reading_progress (optional)
       * ----------------------------------
       */
      const progressQuery = query(
        collection(db, 'reading_progress'),
        where('userId', '==', user.uid),
        where('status_state', '==', 'currently_reading')
      );

      const progressSnap = await getDocs(progressQuery);

      const progressMap = new Map<
        string,
        { progress: number; updatedAt: Timestamp | null }
      >();

      progressSnap.forEach(doc => {
        const data = doc.data();
        progressMap.set(data.bookId, {
          progress: data.progress ?? 0,
          updatedAt: data.updatedAt ?? null,
        });
      });

      /**
       * ----------------------------------
       * 3️⃣ Merge (shelf ⊕ progress)
       * ----------------------------------
       */
      return bookIds
        .map(bookId => {
          const progressEntry = progressMap.get(bookId);

          return {
            bookId,
            progress: progressEntry?.progress ?? 0,
            updatedAt: progressEntry?.updatedAt ?? null,
          } as CurrentlyReadingItem;
        })
        .slice(0, maxItems);
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