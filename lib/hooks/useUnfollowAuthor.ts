import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useUnfollowAuthor = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid;

  return useMutation({
    mutationFn: (authorId: string) => {
      if (!uid) throw new Error("Not authenticated");
      return dataService.catalog.unfollowAuthor(uid, authorId);
    },
    onSuccess: (_data, authorId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.authorFollow(uid, authorId)
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.catalog.author(authorId)
      });
    },
  });
};
