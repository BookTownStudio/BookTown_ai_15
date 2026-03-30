// lib/hooks/useBookCatalog.ts

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, onSnapshot } from 'firebase/firestore';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { getFirebaseDb } from '../firebase.ts';

/**
 * MaterializingEntity-compliant catalog hook
 *
 * Semantics:
 * - null   → PREPARING (expected, retriable)
 * - Book   → READY
 * - throw  → FAILED (terminal)
 */
export const useBookCatalog = (
  bookId: string | undefined,
  options: { enabled?: boolean } = {}
) => {
  const queryClient = useQueryClient();
  const enabled =
    options.enabled !== undefined
      ? options.enabled && !!bookId
      : !!bookId;

  const queryKey = useMemo(
    () =>
      bookId
        ? (queryKeys.catalog.book(bookId) as unknown as any[])
        : (['catalog', 'book', { id: 'none' }] as any[]),
    [bookId]
  );

  const query = useQuery<Book | null>({
    queryKey,

    queryFn: async () => {
      if (!bookId) {
        // Missing ID is a real failure
        throw new Error('BOOK_ID_MISSING');
      }

      try {
        const book = await dataService.catalog.getBook(bookId);

        /**
         * 🔑 MATERIALIZING CONTRACT
         *
         * Absence is NOT an error.
         * It means the entity is still being materialized.
         */
        if (!book) {
          return null; // PREPARING
        }

        return book; // READY
      } catch (err: any) {
        /**
         * 🔒 ERROR DISCIPLINE
         *
         * Only propagate *real* failures.
         * Materialization-related conditions must not throw.
         */
        if (err?.message === 'BOOK_NOT_READY') {
          return null; // PREPARING
        }

        throw err; // FAILED
      }
    },

    enabled,

    // Catalog data is slow-changing
    staleTime: 1000 * 60 * 60 * 6,   // 6 hours
    gcTime: 1000 * 60 * 60 * 24,     // 24 hours

    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    keepPreviousData: true,

    /**
     * 🔁 RETRY STRATEGY
     *
     * Retry only while the entity is PREPARING.
     * Never retry terminal failures.
     */
    retry: (failureCount, error: any) => {
      if (error?.message === 'BOOK_ID_MISSING') {
        return false; // terminal
      }
      return failureCount < 6;
    },

    retryDelay: attempt =>
      Math.min(500 * 2 ** attempt, 2000),
  } as any);

  useEffect(() => {
    if (!enabled || !bookId) return;

    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const db = getFirebaseDb();
      const bookRef = doc(db, 'books', bookId);

      unsubscribe = onSnapshot(
        bookRef,
        async (snapshot) => {
          if (!isActive) return;

          if (!snapshot.exists()) {
            queryClient.setQueryData(queryKey, null);
            return;
          }

          try {
            const liveBook = await dataService.catalog.getBook(bookId);
            if (!isActive) return;
            queryClient.setQueryData(queryKey, liveBook ?? null);
          } catch (err: any) {
            if (err?.message === 'BOOK_NOT_READY') {
              queryClient.setQueryData(queryKey, null);
              return;
            }
            queryClient.invalidateQueries({ queryKey, exact: true });
          }
        },
        () => {
          if (!isActive) return;
          queryClient.invalidateQueries({ queryKey, exact: true });
        }
      );
    } catch (err) {
      console.warn('[useBookCatalog][LIVE_SUBSCRIBE_SKIPPED]', {
        bookId,
        error: String(err),
      });
      return () => {
        isActive = false;
      };
    }

    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [bookId, enabled, queryClient, queryKey]);

  return query;
};
