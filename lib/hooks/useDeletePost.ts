import { useMutation, useQueryClient } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { queryKeys } from '../queryKeys.ts';

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

    return useMutation({
        mutationFn: async (variables: DeletePostVariables) => {
            // 🔒 Correct: rely on default Firebase app initialization
            const functions = getFunctions();
            const deletePostFn = httpsCallable(functions, 'deleteSocialPost');
            const result = await deletePostFn(variables);
            return result.data;
        },
        onSuccess: (_, variables) => {
            // Invalidate strictly
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(
                queryKeys.social.post(variables.postId) as unknown as any[]
            );
            queryClient.invalidateQueries(['social']);
        }
    });
};