import { useQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import type { Review } from "../../types/entities.ts";

export const useUserProfileReviews = (
  profileUid: string | undefined,
  limit = 20,
  enabledOverride = true
) => {
  const { user } = useAuth();
  const sessionUid = user?.uid;
  const enabled = enabledOverride && !!sessionUid && !!profileUid;

  return useQuery<Review[]>({
    queryKey: queryKeys.user.profileReviews(
      sessionUid ?? undefined,
      profileUid
    ) as unknown as any[],
    queryFn: () => dataService.users.getProfileReviews(profileUid!, limit),
    enabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
};

