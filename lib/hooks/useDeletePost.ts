import { useMutation, useQueryClient } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';
import { useToast } from '../../store/toast.tsx';
import { invalidatePostConvergence } from '../socialCacheReconciliation.ts';

interface DeletePostVariables {
    postId: string;
    type?: 'soft' | 'hard';
}

/**
 * useDeletePost
 * Implementation of POST_DELETION_POLICY_V1.
 * Authoritative mutation for post removal.
 */
export const useDeletePost = () => {
    const queryClient = useQueryClient();
    const { showPostDeleteUndo } = useToast();

    return useMutation({
        mutationFn: async (variables: DeletePostVariables) => {
            return callCallableEndpoint<DeletePostVariables, { success: boolean; mode?: 'soft' | 'hard' }>(
                'deleteSocialPost',
                variables
            );
        },
        onSuccess: async (_, variables) => {
            await invalidatePostConvergence(queryClient, variables.postId);
            showPostDeleteUndo(variables.postId);
        }
    });
};
