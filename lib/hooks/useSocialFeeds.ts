
import { useInfiniteQuery } from '../react-query.ts';
import type { InfiniteData } from '@tanstack/react-query';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

/**
 * Authoritative Social Feed Scopes per POST_FEED_EXECUTION_V1
 */
export type SocialFeedScope = 'explore' | 'following' | 'books' | 'discover';
export type SocialFeedFilter = 'media' | 'text' | 'book' | 'quote' | 'project';

type SocialFeedPage = {
    nextCursor?: string;
    posts?: unknown[];
};

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
    
    const queryKey = ['feed', scope, filters, uid] as const;

    return useInfiniteQuery<
        SocialFeedPage,
        Error,
        InfiniteData<SocialFeedPage, string | undefined>,
        typeof queryKey,
        string | undefined
    >({
        // Authoritative Keying Structure: feed:{scope}:{filters}:{uid}
        queryKey,
        queryFn: ({ pageParam }) => dataService.social.getFeed(uid, scope, filters, pageParam),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // Caching constraints per V1 Spec: stale_time_ms: 30000
        staleTime: 30000, 
    });
};
