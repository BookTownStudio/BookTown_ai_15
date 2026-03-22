import { useQuery } from "../react-query.ts";
import { queryKeys } from "../queryKeys.ts";
import { dataService } from "../../services/dataService.ts";
import type { LongformPublicationRecord } from "../../services/db.types.ts";

export const useLongformPublication = (publicationId?: string) => {
  const normalizedPublicationId =
    typeof publicationId === "string" ? publicationId.trim() : "";

  return useQuery<LongformPublicationRecord>({
    queryKey: queryKeys.catalog.publication(normalizedPublicationId || undefined) as unknown as any[],
    queryFn: async () => {
      return dataService.catalog.getLongformPublication(normalizedPublicationId);
    },
    enabled: normalizedPublicationId.length > 0,
    staleTime: 1000 * 60 * 5,
  });
};
