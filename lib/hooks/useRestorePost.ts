import { useMutation, useQueryClient } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';
import { invalidatePostConvergence } from '../socialCacheReconciliation.ts';

/**
 * useRestorePost
 * Implementation of POST_DELETION_POLICY_V1 restoration reversal.
 */
export const useRestorePost = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (postId: string) => {
            return callCallableEndpoint<{ postId: string }, { success: boolean }>(
                'restoreSocialPost',
                { postId }
            );
        },
        onSuccess: async (_, postId) => {
            await invalidatePostConvergence(queryClient, postId);
        }
    });
};
