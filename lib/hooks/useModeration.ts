
import { useMutation, useQueryClient } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * useTransitionModerationStage
 * Implements POST_MODERATION_PIPELINE_V1 stage management.
 */
export const useTransitionModerationStage = () => {
    const queryClient = useQueryClient();

    return useMutation<any, { reportId: string, nextStage: 'under_review' | 'action_taken' | 'dismissed' }>({
        mutationFn: async (variables) => {
            const functions = getFunctions();
            const transitionFn = httpsCallable(functions, 'transitionModerationStage');
            const result = await transitionFn(variables);
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['admin_reports']);
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

    return useMutation<any, { postId: string, action: 'dismiss' | 'hide' | 'restrict' | 'soft_delete' | 'hard_delete', reportId?: string, note?: string }>({
        mutationFn: async (variables) => {
            const functions = getFunctions();
            const actionFn = httpsCallable(functions, 'applyModerationAction');
            const result = await actionFn(variables);
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['social']);
            queryClient.invalidateQueries(['admin_reports']);
        }
    });
};
