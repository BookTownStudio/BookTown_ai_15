import { useQuery } from "../react-query.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import { dataService } from "../../services/dataService.ts";
import type { OwnedLongformPublicationRecord } from "../../services/db.types.ts";

export const useOwnLongformPublications = () => {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<OwnedLongformPublicationRecord[]>({
    queryKey: queryKeys.user.longformPublications(uid) as unknown as any[],
    queryFn: async () => {
      if (!uid) return [];
      return dataService.catalog.listOwnLongformPublications();
    },
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
  });
};
