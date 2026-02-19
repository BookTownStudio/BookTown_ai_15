import { useQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import type { Book } from "../../types/entities.ts";

export const useUserProfileBooks = (
  profileUid: string | undefined,
  limit = 20,
  enabledOverride = true
) => {
  const { user } = useAuth();
  const sessionUid = user?.uid;
  const enabled = enabledOverride && !!sessionUid && !!profileUid;

  return useQuery<Book[]>({
    queryKey: queryKeys.user.profileBooks(
      sessionUid ?? undefined,
      profileUid
    ) as unknown as any[],
    queryFn: () => dataService.users.getProfileBooks(profileUid!, limit),
    enabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
};

