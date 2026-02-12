// lib/hooks/useIngestBook.ts

import { useEffect } from 'react';
import { Book } from '../../types/entities.ts';

/**
 * useIngestBook
 *
 * 🔒 ARCHITECTURAL STATUS: DISABLED (by design)
 *
 * REASON:
 * Passive ingestion on component mount violates the
 * "Ingest on explicit user intent only" rule.
 *
 * This hook is retained ONLY to:
 * - avoid breaking legacy imports
 * - preserve tree stability
 * - allow controlled reactivation in future phases
 *
 * CURRENT BEHAVIOR:
 * - NO backend calls
 * - NO side effects
 * - Emits a single diagnostic warning in dev
 */
export const useIngestBook = (book: Book | undefined) => {
  useEffect(() => {
    if (!book?.id) return;

    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[USE_INGEST_BOOK][DISABLED]',
        'Passive ingestion on mount is disabled by architecture.',
        {
          bookId: book.id
        }
      );
    }
  }, [book?.id]);
};