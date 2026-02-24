import { useMutation, useQueryClient } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { callCallableEndpoint } from '../callable.ts';
import { useToast } from '../../store/toast.tsx';

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
        onSuccess: (_, variables) => {
            // Invalidate strictly
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(
                queryKeys.social.post(variables.postId) as unknown as any[]
            );
            queryClient.invalidateQueries(['social']);
            showPostDeleteUndo(variables.postId);
        }
    });
};
