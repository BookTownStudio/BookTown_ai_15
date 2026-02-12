// lib/hooks/useBookCatalog.ts

import { useQuery } from '@tanstack/react-query';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

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
  const enabled =
    options.enabled !== undefined
      ? options.enabled && !!bookId
      : !!bookId;

  return useQuery<Book | null>({
    queryKey: bookId
      ? (queryKeys.catalog.book(bookId) as unknown as any[])
      : (['catalog', 'book', { id: 'none' }] as any[]),

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
        if (
          err?.message === 'BOOK_NOT_READY' ||
          err?.message === 'FIRESTORE_NOT_AVAILABLE'
        ) {
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
};