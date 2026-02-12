
import { useInfiniteQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

/**
 * Authoritative Social Feed Scopes per POST_FEED_EXECUTION_V1
 */
export type SocialFeedScope = 'explore' | 'following' | 'books' | 'discover';
export type SocialFeedFilter = 'media' | 'text' | 'book' | 'quote' | 'project';

/**
 * useSocialFeeds
 * ENFORCEMENT: POST_FEED_EXECUTION_V1 (LOCKED)
 * 
 * Purpose: Single authoritative source for all paged feed retrievals.
 * SECURITY: Handles missing index errors gracefully by returning empty state.
 */
export const useSocialFeeds = (
    scope: SocialFeedScope, 
    filters: SocialFeedFilter[] = []
) => {
    const { user } = useAuth();
    const uid = user?.uid || 'guest';
    
    return useInfiniteQuery({
        // Authoritative Keying Structure: feed:{scope}:{filters}:{uid}
        queryKey: ['feed', scope, filters, uid],
        queryFn: async ({ pageParam }) => {
            try {
                // Execution delegated to backend service which enforces PAGE_SIZE=20 and sorting
                return await dataService.social.getFeed(uid, scope, filters, pageParam);
            } catch (error: any) {
                // FIRESTORE_QUERY_GUARD_V1: Return empty state on index or permission errors to unblock UI
                const isConfigError = error?.code === 'failed-precondition' || error?.message?.includes("index");
                if (isConfigError) {
                    console.error("[SOCIAL][INDEX_MISSING] Returning empty state for stability:", error.message);
                    return { posts: [], nextCursor: undefined };
                }
                throw error;
            }
        },
        getNextPageParam: (lastPage: any) => lastPage.nextCursor,
        // Caching constraints per V1 Spec: stale_time_ms: 30000
        staleTime: 30000, 
    } as any);
};
