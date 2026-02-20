// lib/hooks/useCurrentlyReading.ts

import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { Shelf } from '../../types/entities.ts';

/**
 * Currently Reading (Home Projection)
 * ----------------------------------------
 * UX CONTRACT (LOCKED):
 * - Visibility is driven by 'currently-reading' shelf membership
 * - Progress is optional display metadata from shelf entries
 * - Order is recency-first (updatedAt DESC)
 *
 * SOURCE OF TRUTH:
 * - shelves/{currently-reading}.entries
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

const CURRENTLY_READING_KEY = 'currently-reading';

const normalizeToken = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '-')
    : '';

const isCurrentlyReadingShelf = (shelf: Shelf): boolean => {
  const idToken = normalizeToken(shelf.id);
  const titleEnToken = normalizeToken(shelf.titleEn);

  return (
    idToken === CURRENTLY_READING_KEY ||
    idToken.endsWith(`_${CURRENTLY_READING_KEY}`) ||
    titleEnToken === CURRENTLY_READING_KEY
  );
};

const toTimestampOrNull = (value: unknown): Timestamp | null => {
  if (value instanceof Timestamp) return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Timestamp.fromDate(date);
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return null;
};

const progressToUnit = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
};

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

      const shelves = await dataService.shelves.getUserShelves(user.uid);
      const currentShelf = shelves.find(isCurrentlyReadingShelf);
      if (!currentShelf) return [];

      const entries = await dataService.shelves.getShelfEntries(
        user.uid,
        currentShelf.id,
        { resolveBooks: false }
      );

      const rows = [...entries].sort((a: any, b: any) => {
        const ta = Date.parse(String(a?.addedAt || ''));
        const tb = Date.parse(String(b?.addedAt || ''));
        const safeA = Number.isFinite(ta) ? ta : 0;
        const safeB = Number.isFinite(tb) ? tb : 0;
        return safeB - safeA;
      });

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
          progress: progressToUnit(progressRaw),
          updatedAt: toTimestampOrNull(row?.addedAt),
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
