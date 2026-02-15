
import { useQuery } from '../react-query.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import { Project } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useProjectDetails = (projectId?: string) => {
    const { user } = useAuth();
    const uid = user?.uid;

    const shouldFetch = !!uid && !!projectId && projectId !== 'new';

    return useQuery<Project | null>({
        // FIX: Cast readonly queryKey tuple to mutable any[] through unknown to satisfy signature requirements.
        queryKey: queryKeys.user.project(uid, projectId) as unknown as any[],
        queryFn: async () => {
            // RULE: Point reads MUST be direct by canonical projectId.
            return await WriteRepository.getProject(uid!, projectId!);
        },
        enabled: shouldFetch,
        staleTime: 1000 * 60 * 5, 
    });
};
