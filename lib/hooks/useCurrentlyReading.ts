// lib/hooks/useCurrentlyReading.ts

import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import type { ReaderContinuityDTO, ReaderInsightsDTO } from '../../types/readerRuntime.ts';

/**
 * Currently Reading (Home Projection)
 * ----------------------------------------
 * UX CONTRACT (LOCKED):
 * - Visibility is driven by reading_progress state
 * - Progress is server-derived display metadata
 * - Order is recency-first (lastActiveAt DESC)
 *
 * SOURCE OF TRUTH:
 * - getReaderInsights -> reading_progress
 */

export type CurrentlyReadingItem = ReaderContinuityDTO;

interface UseCurrentlyReadingResult {
  items: CurrentlyReadingItem[];
  isLoading: boolean;
}

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
  if (
    value &&
    typeof value === 'object' &&
    (
      (typeof (value as { seconds?: unknown }).seconds === 'number'
        && Number.isFinite((value as { seconds: number }).seconds))
      || (typeof (value as { _seconds?: unknown })._seconds === 'number'
        && Number.isFinite((value as { _seconds: number })._seconds))
    )
  ) {
    const seconds =
      typeof (value as { seconds?: unknown }).seconds === 'number'
        ? Math.trunc((value as { seconds: number }).seconds)
        : Math.trunc((value as { _seconds: number })._seconds);
    const nanoseconds =
      typeof (value as { nanoseconds?: unknown }).nanoseconds === 'number'
        ? Math.max(0, Math.trunc((value as { nanoseconds: number }).nanoseconds))
        : typeof (value as { _nanoseconds?: unknown })._nanoseconds === 'number'
          ? Math.max(0, Math.trunc((value as { _nanoseconds: number })._nanoseconds))
          : 0;
    return new Timestamp(seconds, nanoseconds);
  }
  return null;
};

const progressToUnit = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
};

const toContinuityState = (value: unknown): CurrentlyReadingItem['status_state'] | undefined => {
  if (
    value === 'reading' ||
    value === 'rereading' ||
    value === 'paused' ||
    value === 'abandoned' ||
    value === 'completed'
  ) {
    return value;
  }
  return undefined;
};

const toOptionalString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function useCurrentlyReading(
  maxItems: number = 50
): UseCurrentlyReadingResult {
  const { user } = useAuth();
  const enabled = !!user?.uid;
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(maxItems)));

  const queryResult = useQuery({
    queryKey: ['currentlyReading', user?.uid, { limit: boundedLimit }],
    enabled,
    queryFn: async () => {
      if (!user?.uid) return [];
      const fn = httpsCallable<{ limit: number }, ReaderInsightsDTO>(
        getFunctions(),
        'getReaderInsights'
      );
      const res = await fn({ limit: boundedLimit });
      const envelope = res.data as any;
      if (envelope?.success === false) {
        const code =
          typeof envelope?.error?.code === 'string' ? envelope.error.code : 'UNKNOWN';
        const message =
          typeof envelope?.error?.message === 'string'
            ? envelope.error.message
            : 'Reader insights request failed.';
        throw new Error(`[${code}] ${message}`);
      }

      const payload = (envelope?.success === true ? envelope.data : envelope) as ReaderInsightsDTO;

      const rows = Array.isArray(payload?.currentlyReading)
        ? payload.currentlyReading
        : [];

      return rows
        .map((row): CurrentlyReadingItem | null => {
          const bookId =
            typeof row?.bookId === 'string' ? row.bookId.trim() : '';
          if (!bookId) return null;

          return {
            bookId,
            progress: progressToUnit(row?.progress),
            updatedAt: toTimestampOrNull(row?.lastActiveAt),
            status_state: toContinuityState(row?.status_state),
            continuityLevel: toOptionalString(row?.continuityLevel),
            sourceType: toOptionalString(row?.sourceType),
          };
        })
        .filter((item): item is CurrentlyReadingItem => item !== null);
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,   // 10 minutes
  });

  const items = useMemo(
    () => (queryResult.data ?? []).slice(0, boundedLimit),
    [boundedLimit, queryResult.data]
  );

  return {
    items,
    isLoading: queryResult.isLoading,
  };
}
