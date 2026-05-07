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
            queryClient.invalidateQueries({
                queryKey: queryKeys.social.post(variables.postId)
            });
            queryClient.invalidateQueries({ queryKey: ['social'] });
            showPostDeleteUndo(variables.postId);
        }
    });
};
