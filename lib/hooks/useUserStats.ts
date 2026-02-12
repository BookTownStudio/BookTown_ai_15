
// lib/hooks/useUserStats.ts

import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { UserStats } from '../../services/db.types.ts';
import { queryKeys } from '../queryKeys.ts';
// FIX: Import useAuth to resolve current user identity when no UID is provided.
import { useAuth } from '../auth.tsx';

/**
 * useUserStats
 * ------------------------------------------------
 * Authoritative, read-only access to derived user contribution stats.
 *
 * LOCKED PRINCIPLES:
 * - Backend is the sole aggregation authority
 * - Client NEVER derives or guesses stats
 * - Safe defaults to guarantee profile stability
 * - Intelligence-neutral (signals only)
 */
// FIX: Make uid optional to support usage without arguments (e.g. in ReadScreen).
export const useUserStats = (uid?: string) => {
  const { effectiveUid } = useAuth();
  const finalUid = uid || effectiveUid;

  return useQuery<UserStats>({
    // FIX: Use finalUid to ensure query key and execution identity are consistent.
    queryKey: queryKeys.user.stats(finalUid ?? undefined) as unknown as any[],

    queryFn: async (): Promise<UserStats> => {
      // 🔒 Hard fallback for unauthenticated / missing UID
      // FIX: Check finalUid instead of the potentially missing uid parameter.
      if (!finalUid) {
        return {
          followers: 0,
          following: 0,
          postsPublished: 0,
          shelvesCreated: 0,
          quotesAuthored: 0,
          posts: 0,
          reviews: 0,
          booksRead: 0,
          booksPublished: 0,
          wordsWritten: 0,
        };
      }

      try {
        // FIX: Pass finalUid to dataService.
        const stats = await dataService.users.getStats(finalUid);

        // 🔒 Defensive normalization (never trust partial backend data)
        return {
          followers: stats.followers ?? 0,
          following: stats.following ?? 0,
          postsPublished: stats.postsPublished ?? 0,
          shelvesCreated: stats.shelvesCreated ?? 0,
          quotesAuthored: stats.quotesAuthored ?? 0,
          posts: stats.posts ?? 0,
          reviews: stats.reviews ?? 0,
          booksRead: stats.booksRead ?? 0,
          booksPublished: stats.booksPublished ?? 0,
          wordsWritten: stats.wordsWritten ?? 0,
          profileCompletionScore: stats.profileCompletionScore,
        };
      } catch (error) {
        console.warn('[USER_STATS_FALLBACK]', finalUid, error);

        // 🔒 Absolute safety fallback — profile must render
        return {
          followers: 0,
          following: 0,
          postsPublished: 0,
          shelvesCreated: 0,
          quotesAuthored: 0,
          posts: 0,
          reviews: 0,
          booksRead: 0,
          booksPublished: 0,
          wordsWritten: 0,
        };
      }
    },

    enabled: !!finalUid,

    // ✅ Derived counters = low volatility
    staleTime: 1000 * 60 * 5,  // 5 minutes
    gcTime: 1000 * 60 * 20,    // 20 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};
