import { useMutation, useQueryClient } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { callCallableEndpoint } from '../callable.ts';

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
        onSuccess: (_, postId) => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(
                queryKeys.social.post(postId) as unknown as any[]
            );
            queryClient.invalidateQueries(['social']);
        }
    });
};
