import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { type Project } from '../../types/entities.ts';
import { ManuscriptRepository } from '../../services/manuscriptRepository.ts';

export const useProjectManuscriptSnapshot = (project?: Project) => {
    const { user } = useAuth();
    const uid = user?.uid;
    const projectId = project?.id;

    return useQuery({
        queryKey: [...queryKeys.user.project(uid || 'anonymous', projectId || 'none'), 'manuscriptSnapshot'] as unknown as any[],
        queryFn: async () => {
            if (!uid || !project) {
                throw new Error('Project manuscript snapshot requires an authenticated project.');
            }
            return ManuscriptRepository.loadSnapshot(uid, project);
        },
        enabled: Boolean(uid && projectId && project),
        staleTime: 10_000,
    });
};
