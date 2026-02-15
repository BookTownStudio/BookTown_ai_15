
import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { Project } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

interface AutosaveVariables {
    projectId: string;
    updates: Partial<Pick<Project, 'titleEn' | 'titleAr' | 'content' | 'wordCount'>>;
}

export const useAutosaveProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: async ({ projectId, updates }: AutosaveVariables) => {
            if (!uid) throw new Error("Not authenticated");
            
            // RULE: AUTOSAVE_HARD_GATE
            // A projectId is INVALID until confirmed by Firestore.
            if (!projectId || projectId === 'new') {
                console.error("[WRITE][BLOCKED_AUTOSAVE] Attempted persistent write to ephemeral ID 'new'. Aborting.");
                throw new Error("WRITE_PERSISTENCE_VIOLATION: Ephemeral document cannot be autosaved.");
            }
            
            const currentProject = queryClient.getQueryData<Project>(
                queryKeys.user.project(uid, projectId) as unknown as any[]
            );

            const updatesWithRevision: Partial<Project> = {
                ...updates,
                ...(typeof currentProject?.revision === 'number' ? { revision: currentProject.revision } : {})
            };

            await dataService.projects.updateProject(uid, projectId, updatesWithRevision);
            return { success: true };
        },
        onSuccess: (_, { projectId, updates }) => {
            if (uid) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData<Project>(queryKeys.user.project(uid, projectId) as unknown as any[], (old) => {
                    if (!old) return old;
                    const nextRevision =
                        typeof old.revision === 'number' && Number.isInteger(old.revision)
                            ? old.revision + 1
                            : 2;
                    return { ...old, ...updates, revision: nextRevision, updatedAt: new Date().toISOString() };
                });
            }
        },
        onSettled: (_, error, { projectId }) => {
            if (uid) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.project(uid, projectId) as unknown as any[]);
            }
            if (error) {
                console.error(`[WRITE][BLOCKED_AUTOSAVE] Persistence failure for ${projectId}:`, error);
            }
        }
    });
};
