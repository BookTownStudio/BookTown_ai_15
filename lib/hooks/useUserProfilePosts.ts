import { useQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import type { Post } from "../../types/entities.ts";

export const useUserProfilePosts = (
  profileUid: string | undefined,
  limit = 20,
  enabledOverride = true
) => {
  const { user } = useAuth();
  const sessionUid = user?.uid;
  const enabled = enabledOverride && !!profileUid;

  return useQuery<Post[]>({
    queryKey: queryKeys.user.profilePosts(
      sessionUid ?? undefined,
      profileUid
    ) as unknown as any[],
    queryFn: () => dataService.users.getProfilePosts(profileUid!, limit),
    enabled,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
};
