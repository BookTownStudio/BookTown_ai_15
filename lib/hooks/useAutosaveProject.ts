
import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { Project } from '../../types/entities.ts';
import type { WriteProjectOperationAckInput } from '../editor/writeOperationalTypes.ts';
import { queryKeys } from '../queryKeys.ts';
import {
    getWriteTelemetryPayloadBytes,
    writeEditorTelemetry,
} from '../editor/writeEditorTelemetry.ts';

interface AutosaveVariables {
    projectId: string;
    expectedRevision?: number;
    updates: Partial<Project>;
    operation?: WriteProjectOperationAckInput;
}

export const useAutosaveProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: async ({ projectId, expectedRevision, updates, operation }: AutosaveVariables) => {
            if (!uid) throw new Error("Not authenticated");
            
            // RULE: AUTOSAVE_HARD_GATE
            // A projectId is INVALID until confirmed by Firestore.
            if (!projectId || projectId === 'new') {
                console.error("[WRITE][BLOCKED_AUTOSAVE] Attempted persistent write to ephemeral ID 'new'. Aborting.");
                throw new Error("WRITE_PERSISTENCE_VIOLATION: Ephemeral document cannot be autosaved.");
            }

            writeEditorTelemetry.autosaveAttempt(getWriteTelemetryPayloadBytes({
                projectId,
                expectedRevision,
                updates,
                operation,
            }));

            return dataService.projects.updateProject(uid, projectId, updates, {
                expectedRevision,
                operation,
            });
        },
        onSuccess: (result, { projectId, updates }) => {
            writeEditorTelemetry.log('autosave', 'mutation_success', {
                projectId,
                revision: result.revision,
                operationId: result.operationAck?.operationId,
                operationAckStatus: result.operationAck?.status,
            }, 'debug');
            if (result.operationAck?.duplicate) {
                writeEditorTelemetry.increment('sync.duplicateReplayRejected');
            }
            if (uid) {
                const cachePatch = result.operationAck?.duplicate
                    ? { revision: result.revision, updatedAt: result.updatedAt }
                    : { ...updates, revision: result.revision, updatedAt: result.updatedAt };
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData<Project>(queryKeys.user.project(uid, projectId) as unknown as any[], (old) => {
                    if (!old) return old;
                    return { ...old, ...cachePatch };
                });
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData<Project[]>(queryKeys.user.projects(uid) as unknown as any[], (old = []) =>
                    old.map((project) =>
                        project.id === projectId
                            ? { ...project, ...cachePatch }
                            : project
                    )
                );
            }
        },
        onSettled: (_, error, { projectId }) => {
            if (uid && error) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries({ queryKey: queryKeys.user.projects(uid) as unknown as any[] });
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries({ queryKey: queryKeys.user.project(uid, projectId) as unknown as any[] });
            }
            if (error) {
                writeEditorTelemetry.log('autosave', 'mutation_error', {
                    projectId,
                    message: error instanceof Error ? error.message : String(error),
                }, 'warn');
                console.error(`[WRITE][BLOCKED_AUTOSAVE] Persistence failure for ${projectId}:`, error);
            }
        }
    });
};
