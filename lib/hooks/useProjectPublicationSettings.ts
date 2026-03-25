import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { queryKeys } from '../queryKeys.ts';
import type { ProjectPublicationSettings } from '../../services/firebaseProjectService.ts';

export const useProjectPublicationSettings = (
    projectId?: string,
    enabled = true
) => {
    const { user } = useAuth();
    const uid = user?.uid;
    const shouldFetch = enabled && !!uid && !!projectId && projectId !== 'new';

    return useQuery<ProjectPublicationSettings | null>({
        queryKey: queryKeys.user.projectPublicationSettings(uid, projectId) as unknown as any[],
        queryFn: async () => {
            return dataService.projects.getProjectPublicationSettings(projectId!);
        },
        enabled: shouldFetch,
        staleTime: 1000 * 60,
    });
};
