import { useMutation, useQueryClient } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { queryKeys } from '../queryKeys.ts';

/**
 * useRestorePost
 * Implementation of POST_DELETION_POLICY_V1 restoration reversal.
 */
export const useRestorePost = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (postId: string) => {
            const functions = getFunctions();
            const restorePostFn = httpsCallable(functions, 'restoreSocialPost');
            const result = await restorePostFn({ postId });
            return result.data;
        },
        onSuccess: (_, postId) => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(
                queryKeys.social.post(postId) as unknown as any[]
            );
            queryClient.invalidateQueries(['social']);
        }
    });
};