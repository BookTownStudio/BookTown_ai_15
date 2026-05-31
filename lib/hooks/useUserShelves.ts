// lib/hooks/useUserShelves.ts

import { useEffect } from 'react';
import { useQuery } from '../react-query.ts';
import { useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Shelf, ShelfEntry, Book } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { callCallableEndpoint } from '../callable.ts';

const WANT_TO_READ_SUFFIX = '_want-to-read';
const FINISHED_SUFFIX = '_finished';
const WANT_TO_READ_TITLE = 'want to read';
const FINISHED_TITLE = 'finished';
const repairedDefaultShelfUids = new Set<string>();
const inFlightDefaultShelfRepairUids = new Set<string>();

function normalizeShelfText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSemanticSystemShelf(
  shelves: Shelf[],
  uid: string,
  semanticId: 'want-to-read' | 'finished',
  title: string
): boolean {
  const suffix = semanticId === 'want-to-read' ? WANT_TO_READ_SUFFIX : FINISHED_SUFFIX;
  const expectedSystemId = `${uid}${suffix}`.toLowerCase();

  return shelves.some((shelf) => {
    const normalizedId = shelf.id.trim().toLowerCase();
    const normalizedTitleEn = normalizeShelfText(shelf.titleEn);
    const normalizedTitleAr = normalizeShelfText(shelf.titleAr);

    return (
      normalizedId === expectedSystemId
      || normalizedId === semanticId
      || normalizedId.endsWith(suffix)
      || normalizedTitleEn === title
      || normalizedTitleAr === title
    );
  });
}

export function hasRequiredDefaultShelves(shelves: Shelf[], uid: string): boolean {
  return (
    hasSemanticSystemShelf(shelves, uid, 'want-to-read', WANT_TO_READ_TITLE) &&
    hasSemanticSystemShelf(shelves, uid, 'finished', FINISHED_TITLE)
  );
}

/**
 * useUserShelves
 */
export const useUserShelves = (ownerId?: string) => {
  const { effectiveUid, isAuthReady } = useAuth() as any;

  const queryClient = useQueryClient();
  const finalUid = ownerId || effectiveUid;

  // 🔒 FIX: wait for auth readiness if available
  const enabled = (isAuthReady ?? true) && !!finalUid;

  const isOwnerView = !!effectiveUid && finalUid === effectiveUid;

  const query = useQuery<Shelf[]>({
    queryKey: [
      ...queryKeys.user.shelves(effectiveUid ?? undefined),
      { ownerId: finalUid ?? undefined },
    ] as unknown as any[],

    queryFn: async () => {
      if (!finalUid) return [];

      const shelves = await dataService.shelves.getUserShelves(finalUid);

      const seenIds = new Set<string>();
      return shelves.filter((s) => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });
    },

    enabled,

    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (!isOwnerView || !effectiveUid) return;
    if (query.isLoading || query.isError) return;
    if (!Array.isArray(query.data)) return;
    if (repairedDefaultShelfUids.has(effectiveUid)) return;
    if (inFlightDefaultShelfRepairUids.has(effectiveUid)) return;
    if (hasRequiredDefaultShelves(query.data, effectiveUid)) return;

    repairedDefaultShelfUids.add(effectiveUid);
    inFlightDefaultShelfRepairUids.add(effectiveUid);

    void callCallableEndpoint<{}, { ok: boolean; created?: string[] }>(
      'createDefaultShelves',
      {}
    )
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.user.shelves(effectiveUid) as unknown as any[],
        });
      })
      .catch((error) => {
        console.error('[SHELVES][REPAIR_DEFAULT_SHELVES_FAILED]', {
          uid: effectiveUid,
          error,
        });
      })
      .finally(() => {
        inFlightDefaultShelfRepairUids.delete(effectiveUid);
      });
  }, [
    effectiveUid,
    isOwnerView,
    query.data,
    query.isError,
    query.isLoading,
    queryClient,
  ]);

  return query;
};

/**
 * useShelfEntries
 */
export const useShelfEntries = (
  shelfId: string | undefined,
  ownerId?: string,
  options?: { resolveBooks?: boolean; limit?: number; enabled?: boolean }
) => {
  const { effectiveUid, isAuthReady } = useAuth() as any;

  const finalUid = ownerId || effectiveUid;

  // 🔒 FINAL FIX: block until auth fully ready
  const enabled =
    (options?.enabled ?? true) &&
    (isAuthReady ?? true) &&
    !!finalUid &&
    !!shelfId;

  return useQuery<(ShelfEntry & { book?: Book })[]>({
    queryKey: [
      ...queryKeys.user.shelfEntries(finalUid ?? undefined, shelfId),
      {
        resolveBooks: options?.resolveBooks ?? true,
        limit: typeof options?.limit === 'number'
          ? Math.trunc(options.limit)
          : undefined,
      },
    ] as unknown as any[],

    queryFn: async () => {
      if (!(isAuthReady ?? true) || !finalUid || !shelfId) return [];

      return await dataService.shelves.getShelfEntries(
        finalUid,
        shelfId,
        {
          resolveBooks: options?.resolveBooks ?? true,
          ...(typeof options?.limit === 'number'
            ? { limit: options.limit }
            : {}),
        }
      );
    },

    enabled,

    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};
