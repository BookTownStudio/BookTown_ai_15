
import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { queryKeys } from '../queryKeys.ts';
import { BookmarkType } from '../../types/entities.ts';

/**
 * useBookmarkStatus
 * Authoritative point-check for whether a specific user has bookmarked a specific entity.
 * Scoped by UID and EntityID to prevent shared-state leakage.
 */
export const useBookmarkStatus = (entityId: string | undefined, type: BookmarkType = 'post') => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<boolean>({
        // FIX: Cast readonly queryKey tuple to mutable any[] through unknown to satisfy signature requirements.
        queryKey: queryKeys.user.bookmarkStatus(uid, type, entityId || 'none') as unknown as any[],
        queryFn: async () => {
            if (!uid || !entityId) return false;
            return await socialActionRepository.hasBookmarked(entityId, uid, type);
        },
        enabled: !!uid && !!entityId,
        staleTime: 1000 * 60 * 5, // 5 min cache
    });
};
