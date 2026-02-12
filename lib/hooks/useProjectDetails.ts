
import { useQuery } from '../react-query.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import { Project } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useProjectDetails = (projectId?: string) => {
    const { user, isGuest } = useAuth();
    const uid = isGuest ? 'alex_doe' : user?.uid;

    const shouldFetch = !!uid && !!projectId && projectId !== 'new';

    return useQuery<Project | null>({
        // FIX: Cast readonly queryKey tuple to mutable any[] through unknown to satisfy signature requirements.
        queryKey: queryKeys.user.project(uid, projectId) as unknown as any[],
        queryFn: async () => {
            // RULE: Firestore is the ONLY source for existing projects.
            // We use the WriteRepository contract which internally calls the data service.
            // This hook doesn't need ghost-audit as loadProjects handle list-wide audits,
            // but the dataService.projects.getProject handles the strict existence check.
            const projects = await WriteRepository.loadProjects(uid!, isGuest);
            const project = projects.find(p => p.id === projectId);
            
            if (!project) {
                console.error(`[WRITE][ERROR] AUTHORITY_VIOLATION: Project ${projectId} missing on server list.`);
                throw new Error(`Project Authority Refused: Document not found in Firestore.`);
            }

            return project;
        },
        enabled: shouldFetch,
        staleTime: 1000 * 60 * 5, 
    });
};
