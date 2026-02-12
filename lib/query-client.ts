import { QueryClient } from './react-query.ts';

/**
 * Tier-1 production QueryClient defaults.
 * - Avoid noisy refetching
 * - Keep UI stable between navigation changes
 * - Retry only when it makes sense
 * - Keep cache long enough for a PWA-like experience
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent "stale immediately" behavior
      staleTime: 60_000, // 1 min

      // Keep cached data around for back/forward and tab switches
      gcTime: 30 * 60_000, // 30 min (TanStack v5 uses gcTime)

      // Reduce surprise refetches during normal navigation
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,

      // Keep previous data while parameters change (smooth UI)
      // (Works best when keys are stable, which you fixed in Phase 4)
      placeholderData: (prev: any) => prev,

      // Retry policy: fail fast on most errors, but allow brief network blips
      retry: (failureCount, error: any) => {
        // If offline, don't hammer retries
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

        // Hard stop quickly
        if (failureCount >= 2) return false;

        // If backend says "permission" or "not found", don't retry
        const msg = String(error?.message || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('not found')) return false;

        return true;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
    },

    mutations: {
      // Retry mutations only once (avoid double writes)
      retry: (failureCount, error: any) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return failureCount < 1;
      },
      retryDelay: 1500,
    },
  },
});

// Optional but useful: surface query errors during dev
// FIXED: Use getQueryCache() method to access the cache. The 'queryCache' property is not public.
// FIX: Cast queryClient to any to access getQueryCache as it may be missing from the type definition in this environment.
(queryClient as any).getQueryCache().subscribe((event: any) => {
  if (event?.type === 'updated') {
    const query: any = event.query;
    const state = query?.state;
    if (state?.status === 'error') {
      console.warn('[ReactQuery][QueryError]', query?.queryKey, state?.error);
    }
  }
});
