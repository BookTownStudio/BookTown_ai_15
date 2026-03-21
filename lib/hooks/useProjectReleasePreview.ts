import { useQuery } from "../react-query.ts";
import { useAuth } from "../auth.tsx";
import { queryKeys } from "../queryKeys.ts";
import { dataService } from "../../services/dataService.ts";
import type { ProjectReleasePreview } from "../../services/firebaseProjectService.ts";

export const useProjectReleasePreview = (
  releaseId?: string,
  previewType?: "blog" | "ebook"
) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const shouldFetch = !!uid && !!releaseId && !!previewType;

  return useQuery<ProjectReleasePreview | null>({
    queryKey: queryKeys.user.projectReleasePreview(uid, releaseId, previewType) as unknown as any[],
    queryFn: async () => {
      return dataService.projects.getReleasePreview(releaseId!, previewType!);
    },
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 5,
  });
};
