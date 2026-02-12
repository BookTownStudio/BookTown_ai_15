import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { queryKeys } from '../queryKeys.ts';

/**
 * useInteractionStatus
 * Authoritative point-check for user engagement signals per POST_INTERACTION_V1.
 * Truth resides in users/{uid}/{type}/{entityId}.
 */
export const useInteractionStatus = (entityId: string | undefined, entityType: string = 'post') => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<{ like: boolean, bookmark: boolean, repost: boolean }>({
        queryKey: [...queryKeys.user.all(uid), 'interaction', uid, entityType, entityId || 'none'],
        queryFn: async () => {
            if (!uid || !entityId) return { like: false, bookmark: false, repost: false };
            return await socialActionRepository.getInteractionStatus(uid, entityId, entityType);
        },
        enabled: !!uid && !!entityId,
        staleTime: 1000 * 30, // 30s TTL for interaction status
        initialData: { like: false, bookmark: false, repost: false }
    });
};