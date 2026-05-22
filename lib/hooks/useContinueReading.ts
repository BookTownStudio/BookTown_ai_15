// lib/hooks/useContinueReading.ts

import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useCurrentlyReading } from './useCurrentlyReading.ts';

const CONTINUE_READING_LIMIT = 50;

/**
 * Continue Reading Hook
 * ----------------------------------------
 * Canonical active-reading projection for Home and Read.
 *
 * SOURCE OF TRUTH:
 * - getReaderInsights -> reading_progress
 *
 * GUARANTEES:
 * - No writes
 * - User-scoped only
 * - Never reads or gates on shelf membership
 * - Preserves the existing Home/Read return shape
 */
export interface ContinueReadingItem {
  bookId: string;
  progress: number; // display only (0.0 -> 1.0)
  updatedAt: Timestamp | null;
}

interface UseContinueReadingResult {
  items: ContinueReadingItem[];
  isLoading: boolean;
}

export function useContinueReading(
  maxItems: number = 8
): UseContinueReadingResult {
  const limit = Math.max(1, Math.min(CONTINUE_READING_LIMIT, Math.trunc(maxItems)));
  const { items: activeReadingItems, isLoading } = useCurrentlyReading(CONTINUE_READING_LIMIT);

  const items = useMemo(
    () =>
      activeReadingItems
        .filter((item) => item.status_state === 'reading' || item.status_state === 'paused')
        .map((item) => ({
          bookId: item.bookId,
          progress: item.progress,
          updatedAt: item.updatedAt,
        }))
        .slice(0, limit),
    [activeReadingItems, limit]
  );

  return {
    items,
    isLoading,
  };
}
