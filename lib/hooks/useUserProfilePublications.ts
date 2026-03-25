import { useQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import type { ProfilePublicationRecord } from "../../services/db.types.ts";

export const useUserProfilePublications = (
  profileUid: string | undefined,
  limit = 20,
  enabledOverride = true
) => {
  const { user } = useAuth();
  const sessionUid = user?.uid;
  const enabled = enabledOverride && !!profileUid;

  return useQuery<ProfilePublicationRecord[]>({
    queryKey: queryKeys.user.profilePublications(
      sessionUid ?? undefined,
      profileUid
    ) as unknown as any[],
    queryFn: () => dataService.users.getProfilePublications(profileUid!, limit),
    enabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
};
