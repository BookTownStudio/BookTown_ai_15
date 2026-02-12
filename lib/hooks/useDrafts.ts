
import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { PostDraft, PostAttachment } from '../../types/entities.ts';

export const useDrafts = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<PostDraft[]>({
        queryKey: ['drafts', uid],
        queryFn: () => dataService.social.getDrafts(uid!),
        enabled: !!uid,
    });
};

export const useDraft = (draftId?: string) => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<PostDraft>({
        queryKey: ['draft', uid, draftId],
        queryFn: () => dataService.social.getDraft(uid!, draftId!),
        enabled: !!uid && !!draftId,
    });
};

interface SaveDraftVariables {
    draftId?: string;
    content: string;
    attachment?: PostAttachment | null;
}

export const useSaveDraft = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ draftId, content, attachment }: SaveDraftVariables) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.social.saveDraft(uid, {
                id: draftId || `draft_${Date.now()}`,
                userId: uid,
                content,
                attachment: attachment || undefined
            });
        },
        onSuccess: (data) => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['drafts', uid]);
            queryClient.invalidateQueries(['draft', uid, data.id]);
        },
    });
};

export const useDeleteDraft = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (draftId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.social.deleteDraft(uid, draftId);
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['drafts', uid]);
        },
    });
};
