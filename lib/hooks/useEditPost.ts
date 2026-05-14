import { useMutation, useQueryClient } from '../react-query.ts';
import { PostVisibilityScope, PostAttachment } from '../../types/entities.ts';
import { callCallableEndpoint } from '../callable.ts';
import { invalidatePostConvergence } from '../socialCacheReconciliation.ts';

interface EditPostVariables {
    postId: string;
    text?: string;
    visibility?: PostVisibilityScope;
    attachments?: PostAttachment[];
}

/**
 * useEditPost
 * Implementation of POST_EDITING_POLICY_V1 aligned with POST_MODEL_V1.
 */
export const useEditPost = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (variables: EditPostVariables) => {
            return callCallableEndpoint<EditPostVariables, { success: boolean }>(
                'editSocialPost',
                variables
            );
        },
        onSuccess: async (_, variables) => {
            await invalidatePostConvergence(queryClient, variables.postId);
        }
    });
};
