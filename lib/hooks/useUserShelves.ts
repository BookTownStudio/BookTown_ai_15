// lib/hooks/useUserShelves.ts

import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Shelf, ShelfEntry, Book } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

/**
 * useUserShelves
 * ------------------------------------------------
 * Authoritative source for the user's shelf list.
 *
 * DECISION (STABILIZED):
 * - All shelves are real Firestore documents.
 * - System IDs: 'currently-reading', 'want-to-read', 'finished'.
 *
 * ARCHITECTURAL INVARIANT:
 * - Must use BookTown QueryClient bridge (NOT raw TanStack)
 */
export const useUserShelves = (ownerId?: string) => {
  const { effectiveUid } = useAuth();
  const finalUid = ownerId || effectiveUid;
  const enabled = !!finalUid;

  return useQuery<Shelf[]>({
    queryKey: queryKeys.user.shelves(finalUid ?? undefined) as unknown as any[],

    queryFn: async () => {
      // Invariant: if this runs, uid must exist
      const shelves = await dataService.shelves.getUserShelves(finalUid!);

      // Ensure we don't duplicate shelves if the backend returns multiple variants
      const seenIds = new Set<string>();
      return shelves.filter((s) => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });
    },

    enabled,

    // ✅ Performance tuning (user library = medium volatility)
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 15,   // 15 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useShelfEntries = (
  shelfId: string | undefined,
  ownerId?: string,
  options?: { resolveBooks?: boolean; limit?: number }
) => {
  const { effectiveUid } = useAuth();
  const finalUid = ownerId || effectiveUid;
  const requestUid = finalUid || 'public';

  const enabled = !!shelfId;

  return useQuery<(ShelfEntry & { book?: Book })[]>({
    queryKey: [
      ...queryKeys.user.shelfEntries(finalUid ?? undefined, shelfId),
      {
        resolveBooks: options?.resolveBooks ?? true,
        limit: typeof options?.limit === 'number' ? Math.trunc(options.limit) : undefined,
      },
    ] as unknown as any[],

    queryFn: async () => {
      return await dataService.shelves.getShelfEntries(
        requestUid,
        shelfId!,
        {
          resolveBooks: options?.resolveBooks ?? true,
          ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
        }
      );
    },

    enabled,

    // ✅ Shelf entries tuning
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};
