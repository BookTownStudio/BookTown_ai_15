import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { BookmarkType } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { dataService } from '../../services/dataService.ts';
import { invalidateBookmarkConvergence } from '../socialCacheReconciliation.ts';
import { toLiteraryEntityRefFromCompatIdentity } from '../../types/entityPlatformCompatibility.ts';

interface BookmarkToggleVariables {
    entityId: string;
    type: BookmarkType;
    isBookmarked: boolean; // Current state before toggle
}

/**
 * useBookmarkToggle
 * Normalized bookmark mutation. 
 * Reconciles both the aggregate list and the point-status query from server truth.
 */
export const useBookmarkToggle = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation<
        { bookmarked?: boolean; entityId?: string; entityType?: string },
        Error,
        BookmarkToggleVariables
    >({
        mutationFn: async ({ entityId, type, isBookmarked }) => {
            if (!uid) throw new Error("User not authenticated");
            if (type === 'attachment') {
                throw new Error("Unsupported bookmark type");
            }
            toLiteraryEntityRefFromCompatIdentity({ type, entityId });

            return dataService.social.toggleBookmark(uid, entityId, type, !isBookmarked);
        },
        onMutate: async ({ entityId, type, isBookmarked }) => {
            if (!uid) return;

            const statusKey = queryKeys.user.bookmarkStatus(uid, type, entityId);

            await queryClient.cancelQueries({ queryKey: statusKey as unknown as any[] });

            const previousStatus = queryClient.getQueryData<boolean>(statusKey as unknown as any[]);

            queryClient.setQueryData(statusKey as unknown as any[], !isBookmarked);

            return { previousStatus };
        },
        onSuccess: (data, { entityId, type }) => {
            if (!uid || typeof data?.bookmarked !== 'boolean') return;
            queryClient.setQueryData(
                queryKeys.user.bookmarkStatus(uid, type, entityId) as unknown as any[],
                data.bookmarked
            );
        },
        onError: (_err, { entityId, type }, context: any) => {
            if (!uid) return;
            if (context?.previousStatus !== undefined) {
                queryClient.setQueryData(queryKeys.user.bookmarkStatus(uid, type, entityId) as unknown as any[], context.previousStatus);
            }
        },
        onSettled: async (_data, _error, { entityId, type }) => {
            if (!uid) return;
            await invalidateBookmarkConvergence(queryClient, uid, type, entityId);
        }
    });
};
