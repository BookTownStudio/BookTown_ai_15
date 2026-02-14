import { useQuery } from "../react-query.ts";
import { useAuth } from "../auth.tsx";
import { dataService } from "../../services/dataService.ts";
import { queryKeys } from "../queryKeys.ts";

export const useAuthorFollowStatus = (authorId: string | undefined) => {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<boolean>({
    queryKey: queryKeys.user.authorFollow(uid, authorId) as unknown as any[],
    enabled: !!uid && !!authorId,
    queryFn: async () => {
      if (!uid || !authorId) return false;
      return dataService.catalog.isAuthorFollowed(uid, authorId);
    },
    staleTime: 10_000,
    retry: false,
  });
};
