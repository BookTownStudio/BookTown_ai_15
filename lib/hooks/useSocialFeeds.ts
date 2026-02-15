
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
        queryFn: ({ pageParam }) => dataService.social.getFeed(uid, scope, filters, pageParam),
        getNextPageParam: (lastPage: any) => lastPage.nextCursor,
        // Caching constraints per V1 Spec: stale_time_ms: 30000
        staleTime: 30000, 
    } as any);
};
