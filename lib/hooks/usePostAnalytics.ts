import { useQuery } from '../react-query.ts';
import { db } from '../firebase.ts';
import { doc, getDoc } from 'firebase/firestore';
import { queryKeys } from '../queryKeys.ts';

interface PostAnalyticsData {
    views: number;
    likes: number;
    comments_count: number;
    reposts: number;
    bookmarks: number;
    unique_viewers: number;
    lastUpdatedAt: any;
}

/**
 * usePostAnalytics
 * Implementation of POST_ANALYTICS_V1 read policy.
 * Scoped access: Authors and Admins only.
 */
export const usePostAnalytics = (postId: string | undefined) => {
    return useQuery<PostAnalyticsData | null>({
        queryKey: [...queryKeys.social.all, 'analytics', postId],
        queryFn: async () => {
            if (!postId || !db.raw) return null;
            
            const ref = doc(db.raw, 'post_analytics', postId);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const data = snap.data();
                return {
                    views: data.views || 0,
                    likes: data.likes || 0,
                    comments_count: data.comments_count || 0,
                    reposts: data.reposts || 0,
                    bookmarks: data.bookmarks || 0,
                    unique_viewers: data.unique_viewers || 0,
                    lastUpdatedAt: data.lastUpdatedAt
                };
            }
            
            return {
                views: 0,
                likes: 0,
                comments_count: 0,
                reposts: 0,
                bookmarks: 0,
                unique_viewers: 0,
                lastUpdatedAt: null
            };
        },
        enabled: !!postId,
        staleTime: 1000 * 60 * 5 // 5 min TTL
    });
};