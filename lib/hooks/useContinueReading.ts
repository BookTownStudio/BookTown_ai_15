// lib/hooks/useContinueReading.ts

import { Timestamp } from 'firebase/firestore';
import { useCurrentlyReading } from './useCurrentlyReading.ts';

/**
 * Continue Reading Hook
 * ----------------------------------------
 * Canonical alias to the active-reading projection.
 *
 * DEFINITIONS (LOCKED):
 * - "Continue Reading" === status_state === "reading"
 *
 * SOURCE OF TRUTH:
 * - reading_progress collection
 *
 * GUARANTEES:
 * - No writes
 * - User-scoped only
 * - Ordered by recency (delegated)
 * - Safe for Home + Read reuse
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
  const { items, isLoading } = useCurrentlyReading(maxItems);
  return { items, isLoading };
}
