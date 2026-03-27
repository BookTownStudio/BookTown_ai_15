// lib/hooks/useContinueReading.ts

import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useCurrentlyReading } from './useCurrentlyReading.ts';
import { useShelfEntries, useUserShelves } from './useUserShelves.ts';

const CURRENTLY_READING_SHELF_ID = 'currently-reading';
const CONTINUE_READING_LIMIT = 200;

const toTimestampOrNull = (value: unknown): Timestamp | null => {
  if (value instanceof Timestamp) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return Timestamp.fromDate((value as { toDate: () => Date }).toDate());
    } catch {
      return null;
    }
  }
  return null;
};

const toMillisOrZero = (value: Timestamp | null): number => {
  if (!value) return 0;
  try {
    return value.toMillis();
  } catch {
    return 0;
  }
};

/**
 * Continue Reading Hook
 * ----------------------------------------
 * Canonical Home projection for the currently-reading shelf.
 *
 * DEFINITIONS (LOCKED):
 * - Shelf entries decide visibility
 * - reading_progress only enriches display metadata
 *
 * SOURCE OF TRUTH:
 * - shelves/{currently-reading}.entries
 *
 * GUARANTEES:
 * - No writes
 * - User-scoped only
 * - Never uses reading_progress as sole authority
 * - Ordering prefers latest reading progress activity
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
  const { data: shelves = [], isLoading: isShelvesLoading } = useUserShelves();
  const resolvedCurrentlyReadingShelfId = useMemo(() => {
    const exactMatch = shelves.find((shelf) => shelf.id === CURRENTLY_READING_SHELF_ID);
    if (exactMatch) return exactMatch.id;

    const suffixMatch = shelves.find((shelf) =>
      typeof shelf.id === 'string'
      && shelf.id.endsWith(`_${CURRENTLY_READING_SHELF_ID}`)
    );
    return suffixMatch?.id;
  }, [shelves]);

  const { data: shelfEntries = [], isLoading: isShelfEntriesLoading } = useShelfEntries(
    resolvedCurrentlyReadingShelfId,
    undefined,
    {
      resolveBooks: false,
      limit: Math.max(maxItems, CONTINUE_READING_LIMIT),
    }
  );
  const { items: progressItems } = useCurrentlyReading(
    Math.max(maxItems, CONTINUE_READING_LIMIT)
  );

  const items = useMemo(() => {
    const progressByBookId = new Map(
      progressItems.map((item) => [item.bookId, item] as const)
    );

    return shelfEntries
      .map((entry, index) => {
        const bookId =
          typeof entry?.bookId === 'string' ? entry.bookId.trim() : '';
        if (!bookId) return null;

        const progressEntry = progressByBookId.get(bookId);
        const shelfProgressRaw =
          typeof entry?.progress === 'number' && Number.isFinite(entry.progress)
            ? entry.progress
            : 0;
        const normalizedShelfProgress =
          shelfProgressRaw > 1
            ? Math.max(0, Math.min(1, shelfProgressRaw / 100))
            : Math.max(0, Math.min(1, shelfProgressRaw));

        return {
          item: {
            bookId,
            progress: progressEntry?.progress ?? normalizedShelfProgress,
            updatedAt:
              progressEntry?.updatedAt ?? toTimestampOrNull(entry?.addedAt),
          },
          index,
          progressUpdatedAtMs: toMillisOrZero(progressEntry?.updatedAt ?? null),
        };
      })
      .filter((
        row
      ): row is {
        item: ContinueReadingItem;
        index: number;
        progressUpdatedAtMs: number;
      } => row !== null)
      .sort((a, b) => {
        if (a.progressUpdatedAtMs !== b.progressUpdatedAtMs) {
          return b.progressUpdatedAtMs - a.progressUpdatedAtMs;
        }
        return a.index - b.index;
      })
      .map((row) => row.item)
      .slice(0, Math.max(1, maxItems));
  }, [maxItems, progressItems, shelfEntries]);

  return {
    items,
    isLoading: isShelvesLoading || isShelfEntriesLoading,
  };
}
