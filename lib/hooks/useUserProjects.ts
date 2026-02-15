
import { useQuery } from '../react-query.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Project } from '../../types/entities.ts';

export const useUserProjects = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<Project[]>({
        // FIX: Cast readonly queryKey tuple to mutable any[] through unknown to satisfy signature requirements.
        queryKey: queryKeys.user.projects(uid) as unknown as any[],
        queryFn: async () => {
            if (!uid) return [];
            // RULE: Use WriteRepository as the only path to project data
            return await WriteRepository.loadProjects(uid, false);
        },
        enabled: !!uid,
        // Ensure we don't stale-out authoritative syncs too quickly
        staleTime: 1000 * 60 * 2, 
    });
};
