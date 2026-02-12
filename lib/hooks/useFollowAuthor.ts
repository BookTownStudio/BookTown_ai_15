import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useFollowAuthor = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (authorId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.catalog.followAuthor(uid, authorId);
        },
        onSuccess: (data, authorId) => {
            console.log(`Successfully followed author ${authorId}`);
        },
    });
};