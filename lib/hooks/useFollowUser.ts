import { useMutation, useQueryClient, useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { db } from '../firebase.ts';
import { doc, getDoc } from 'firebase/firestore';

export const useFollowStatus = (targetUid: string | undefined) => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<boolean>({
        queryKey: [...queryKeys.user.all(uid), 'followStatus', uid, targetUid],
        queryFn: async () => {
            if (!uid || !targetUid) return false;
            const snap = await getDoc(doc(db.raw, 'users', uid, 'following', targetUid));
            return snap.exists();
        },
        enabled: !!uid && !!targetUid,
        staleTime: 30_000,
    });
};

export const useFollowUser = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: (userIdToFollow: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.followUser(uid, userIdToFollow);
        },
        onSuccess: (data, userId) => {
            queryClient.invalidateQueries({ queryKey: [...queryKeys.user.all(uid), 'followStatus', uid, userId] });
            queryClient.invalidateQueries({ queryKey: ['suggestedProfiles', uid] });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.stats(userId) as unknown as any[] });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.stats(uid) as unknown as any[] });
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.followList(uid, userId, 'followers')
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.followList(uid, uid, 'following')
            });
        },
    });
};

export const useUnfollowUser = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (userIdToUnfollow: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.unfollowUser(uid, userIdToUnfollow);
        },
        onSuccess: (data, userId) => {
            queryClient.invalidateQueries({ queryKey: [...queryKeys.user.all(uid), 'followStatus', uid, userId] });
            queryClient.invalidateQueries({ queryKey: ['suggestedProfiles', uid] });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.stats(userId) as unknown as any[] });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.stats(uid) as unknown as any[] });
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.followList(uid, userId, 'followers')
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.followList(uid, uid, 'following')
            });
        },
    });
};
