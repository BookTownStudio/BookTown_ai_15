import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useFollowUser = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: (userIdToFollow: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.followUser(uid, userIdToFollow);
        },
        onSuccess: (data, userId) => {
            console.log(`Successfully followed user ${userId}`);
        },
    });
};

export const useUnfollowUser = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (userIdToUnfollow: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.unfollowUser(uid, userIdToUnfollow);
        },
        onSuccess: (data, userId) => {
            console.log(`Successfully unfollowed user ${userId}`);
        },
    });
};