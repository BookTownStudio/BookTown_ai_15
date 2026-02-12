// lib/react-query.ts

import { 
  QueryClient as TanStackQueryClient,
  QueryClientProvider as TanStackQueryClientProvider,
  useQuery as useTanStackQuery,
  useMutation as useTanStackMutation,
  useQueryClient as useTanStackQueryClient,
  useInfiniteQuery as useTanStackInfiniteQuery
} from "@tanstack/react-query";

// Explicit re-exports to ensure visibility in consuming hooks and components
export const QueryClientProvider = TanStackQueryClientProvider;
export const useQuery = useTanStackQuery;
export const useMutation = useTanStackMutation;
export const useQueryClient = useTanStackQueryClient;
export const useInfiniteQuery = useTanStackInfiniteQuery;

/**
 * Authoritative QueryClient Bridge
 * Preserves existing 'setUid' pattern for cache isolation while
 * using the real TanStack engine under the hood.
 */
export class QueryClient extends TanStackQueryClient {
  constructor(config: any = {}) {
    super({
      ...config,
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes default
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }

  /**
   * Authority: Identity Switch Handler
   * Clears all queries to prevent cross-user data leakage.
   */
  setUid(uid: string | null) {
    console.log(`[QUERY_CLIENT] Identity switch detected for UID: ${uid}. Purging cache.`);
    // Using super to explicitly call the base class clear() method
    super.clear();
  }

  /**
   * Compatibility Alias for legacy invalidate
   */
  invalidate(key: any[]) {
    // Using super to explicitly call the base class invalidateQueries() method
    return super.invalidateQueries({ queryKey: key });
  }
}