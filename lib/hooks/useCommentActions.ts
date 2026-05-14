import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { callCallableEndpoint } from '../callable.ts';

/**
 * useCommentActions
 * Authoritative implementation of POST_DISCUSSION_MODERATION_V1.
 */
export const useCommentActions = (postId: string) => {
    const { user } = useAuth();
    const uid = user?.uid;
    const { showToast } = useToast();
    const { lang } = useI18n();
    const queryClient = useQueryClient();

    const reportMutation = useMutation({
        mutationFn: async (vars: { commentId: string; reason: string; note?: string }) => {
            if (!uid) throw new Error("AUTH_REQUIRED");
            return callCallableEndpoint<
                { postId: string; commentId: string; reason: string; note?: string },
                { success: boolean; alreadyReported?: boolean }
            >('reportSocialComment', {
                postId,
                commentId: vars.commentId,
                reason: vars.reason,
                note: vars.note
            });
        },
        onSuccess: () => {
            showToast(lang === 'en' ? "Report submitted. Content hidden for you." : "تم إرسال البلاغ. المحتوى مخفي بالنسبة لك.");
            queryClient.invalidateQueries({ queryKey: ['comments', 'byPostId', postId] });
        }
    });

    const blockMutation = useMutation({
        mutationFn: async (targetUid: string) => {
            if (!uid) throw new Error("AUTH_REQUIRED");
            return callCallableEndpoint<
                { targetUid: string },
                { targetUid: string; blocked: boolean }
            >('blockUser', { targetUid });
        },
        onSuccess: () => {
            showToast(lang === 'en' ? "User blocked." : "تم حظر المستخدم.");
            queryClient.invalidateQueries({ queryKey: ['comments', 'byPostId', postId] });
        }
    });

    return {
        report: reportMutation.mutate,
        isReporting: reportMutation.isPending,
        block: blockMutation.mutate,
        isBlocking: blockMutation.isPending
    };
};
