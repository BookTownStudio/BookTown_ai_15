
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

// Replaced with useAddReaction for cleaner API
export const useLikeBook = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useMutation({
        mutationFn: (bookId: string) => dataService.social.addReaction(uid || 'guest', bookId, 'like'),
    });
};

export const useAddReaction = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useMutation({
        mutationFn: ({ entityId, reaction }: { entityId: string; reaction: string }) => {
            return dataService.social.addReaction(uid || 'guest', entityId, reaction);
        }
    });
};
