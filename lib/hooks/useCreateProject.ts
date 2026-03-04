import { devLog } from '../logging/devLog';

import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { Project } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useCreateProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (newProject: Omit<Project, 'id' | 'updatedAt' | 'createdAt'>) => {
            if (!uid) throw new Error("User not authenticated");
            
            // RULE: PROJECT_CREATION_SINGLE_AUTHORITY
            // All write-project creation MUST go through the authoritative data service.
            devLog("[WRITE][MATERIALIZATION] Requesting server-issued ID...");
            return dataService.projects.createProject(uid, newProject);
        },
        onSuccess: (data) => {
            if (uid && data.id) {
                devLog(`[WRITE][PERSISTENT] Materialization confirmed. Canonical ID: ${data.id}`);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.project(uid, data.id) as unknown as any[], data);
            }
        },
    });
};