import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useFollowAuthor = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (authorId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.catalog.followAuthor(uid, authorId);
        },
        onSuccess: (_data, authorId) => {
            queryClient.invalidateQueries(
                queryKeys.user.authorFollow(uid, authorId) as unknown as any[]
            );
            queryClient.invalidateQueries(
                queryKeys.catalog.author(authorId) as unknown as any[]
            );
        },
    });
};
