import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { PostStats } from '../../services/db.types.ts';
import { queryKeys } from '../queryKeys.ts';

/**
 * usePostStats
 * Authoritative read path for post engagement counters.
 * POST_MODEL_V1: Maps post_stats document 'counters' object to UI interface.
 */
export const usePostStats = (postId: string | undefined) => {
    return useQuery<PostStats>({
        queryKey: [...queryKeys.social.all, 'stats', postId],
        queryFn: async () => {
            const stats = await dataService.social.getPostStats(postId!);
            return {
                likesCount: stats.likesCount ?? 0,
                bookmarksCount: stats.bookmarksCount ?? 0,
                repostsCount: stats.repostsCount ?? 0,
                commentsCount: stats.commentsCount ?? 0
            };
        },
        enabled: !!postId,
        staleTime: 1000 * 15,
        initialData: { likesCount: 0, bookmarksCount: 0, repostsCount: 0, commentsCount: 0 }
    });
};
