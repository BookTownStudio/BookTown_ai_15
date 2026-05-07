import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { Bookmark, BookmarkType } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

interface BookmarkToggleVariables {
    entityId: string;
    type: BookmarkType;
    isBookmarked: boolean; // Current state before toggle
}

/**
 * useBookmarkToggle
 * Normalized bookmark mutation. 
 * Correctly updates both the aggregate list and the point-status queries.
 */
export const useBookmarkToggle = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation<void, Error, BookmarkToggleVariables>({
        mutationFn: async ({ entityId, type, isBookmarked }) => {
            if (!uid) throw new Error("User not authenticated");
            
            // Toggle logic
            if (isBookmarked) {
                await socialActionRepository.unbookmark(entityId, uid, type);
            } else {
                await socialActionRepository.bookmark(entityId, uid, type);
            }
        },
        onMutate: async ({ entityId, type, isBookmarked }) => {
            if (!uid) return;

            const bookmarksKey = queryKeys.user.bookmarks(uid);
            const statusKey = queryKeys.user.bookmarkStatus(uid, type, entityId);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries({ queryKey: bookmarksKey as unknown as any[] });
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries({ queryKey: statusKey as unknown as any[] });

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKey as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousStatus = queryClient.getQueryData<boolean>(statusKey as unknown as any[]);

            // 1. Optimistically update point status (Essential for Rail isolation)
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(statusKey as unknown as any[], !isBookmarked);

            // 2. Optimistically update list (Essential for Bookmarks page)
            if (previousBookmarks) {
                if (isBookmarked) {
                    // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                    queryClient.setQueryData(bookmarksKey as unknown as any[], previousBookmarks.filter(b => b.entityId !== entityId));
                } else {
                    const optimisticBookmark: Bookmark = {
                        id: `temp-${Date.now()}`,
                        entityId,
                        type,
                        timestamp: new Date().toISOString()
                    };
                    // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                    queryClient.setQueryData(bookmarksKey as unknown as any[], [optimisticBookmark, ...previousBookmarks]);
                }
            }

            return { previousBookmarks, previousStatus };
        },
        onError: (err, { entityId, type }, context: any) => {
            if (!uid) return;
            if (context?.previousBookmarks) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.bookmarks(uid) as unknown as any[], context.previousBookmarks);
            }
            if (context?.previousStatus !== undefined) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.bookmarkStatus(uid, type, entityId) as unknown as any[], context.previousStatus);
            }
        },
        onSettled: (data, error, { entityId, type }) => {
            if (!uid) return;
            // Precise invalidations
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries({ queryKey: queryKeys.user.bookmarks(uid) as unknown as any[] });
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries({ queryKey: queryKeys.user.bookmarkStatus(uid, type, entityId) as unknown as any[] });
            
            if (type === 'post') {
                queryClient.invalidateQueries({ queryKey: [...queryKeys.social.all, 'stats', entityId] });
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries({ queryKey: queryKeys.social.post(entityId) as unknown as any[] });
            }
        }
    });
};
