import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { User } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useUserFollowList = (
  profileUid: string | undefined,
  listType: 'followers' | 'following' | null
) => {
  const { effectiveUid } = useAuth();

  return useQuery<User[]>({
    queryKey: queryKeys.user.followList(
      effectiveUid ?? undefined,
      profileUid,
      listType ?? undefined
    ) as unknown as any[],
    queryFn: async () => {
      if (!profileUid || !listType) {
        return [];
      }

      if (listType === 'followers') {
        return dataService.users.listFollowers(profileUid);
      }

      return dataService.users.listFollowing(profileUid);
    },
    enabled: !!profileUid && !!listType,
    staleTime: 60_000,
  });
};
