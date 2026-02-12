import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { PostAttachment, PostVisibilityScope } from '../../types/entities.ts';

interface CreatePostVariables {
    content: string | { text: string };
    attachments?: PostAttachment[];
    visibility?: PostVisibilityScope;
    publishToken: string;
}

export const useCreatePost = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (variables: CreatePostVariables) => {
            if (!uid) throw new Error("Not authenticated");
            
            // POST_CREATION_FLOW_V1: Orchestrate Spec-Compliant Payload
            const postPayload = {
                content: typeof variables.content === 'string' 
                    ? { text: variables.content, attachments: [] }
                    : { ...variables.content, attachments: [] },
                attachments: variables.attachments || [],
                visibility: variables.visibility || 'public',
                publishToken: variables.publishToken
            };

            return dataService.social.createPost(uid, postPayload as any);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['social']);
        },
    });
};