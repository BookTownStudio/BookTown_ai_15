
import { useMutation, useQueryClient } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';
import { invalidatePostConvergence } from '../socialCacheReconciliation.ts';

/**
 * useTransitionModerationStage
 * Implements POST_MODERATION_PIPELINE_V1 stage management.
 */
export const useTransitionModerationStage = () => {
    const queryClient = useQueryClient();

    return useMutation<any, Error, { reportId: string, nextStage: 'under_review' | 'action_taken' | 'dismissed' }>({
        mutationFn: async (variables) => {
            return callCallableEndpoint<typeof variables, { success: boolean }>(
                'transitionModerationStage',
                variables
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
        }
    });
};

/**
 * useApplyModerationAction
 * Implements POST_MODERATION_PIPELINE_V1 outcome execution.
 */
// FIX: Updated variables type to include 'note' and corrected the 'action' union to match the backend's expected values ('dismiss', 'hide', 'restrict', 'soft_delete', 'hard_delete').
export const useApplyModerationAction = () => {
    const queryClient = useQueryClient();

    return useMutation<any, Error, { postId: string, action: 'dismiss' | 'hide' | 'restrict' | 'soft_delete' | 'hard_delete', reportId?: string, note?: string }>({
        mutationFn: async (variables) => {
            return callCallableEndpoint<typeof variables, { success: boolean }>(
                'applyModerationAction',
                variables
            );
        },
        onSuccess: async (_result, variables) => {
            await invalidatePostConvergence(queryClient, variables.postId);
            queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
        }
    });
};
