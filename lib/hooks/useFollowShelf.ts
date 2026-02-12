import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useFollowShelf = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (shelfId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.shelves.followShelf(uid, shelfId);
        },
        onSuccess: (data, shelfId) => {
            console.log(`Successfully followed shelf ${shelfId}`);
        },
    });
};