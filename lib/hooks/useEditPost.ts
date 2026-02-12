import { useMutation, useQueryClient } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PostVisibilityScope, PostAttachment } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

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
            const functions = getFunctions();
            const editPostFn = httpsCallable(functions, 'editSocialPost');
            const result = await editPostFn(variables);
            return result.data;
        },
        onSuccess: (_, variables) => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(
                queryKeys.social.post(variables.postId) as unknown as any[]
            );
            queryClient.invalidateQueries(['social']);
        }
    });
};