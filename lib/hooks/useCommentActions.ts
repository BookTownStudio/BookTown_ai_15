import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';

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
        mutationFn: async (vars: { commentId: string; authorId: string; reason: string; note?: string }) => {
            if (!uid) throw new Error("AUTH_REQUIRED");
            return socialActionRepository.reportComment(postId, vars.commentId, uid, vars.authorId, vars.reason, vars.note);
        },
        onSuccess: () => {
            showToast(lang === 'en' ? "Report submitted. Content hidden for you." : "تم إرسال البلاغ. المحتوى مخفي بالنسبة لك.");
            queryClient.invalidateQueries(['thread_comments', postId]);
        }
    });

    const blockMutation = useMutation({
        mutationFn: async (targetUid: string) => {
            if (!uid) throw new Error("AUTH_REQUIRED");
            return socialActionRepository.blockUser(uid, targetUid);
        },
        onSuccess: () => {
            showToast(lang === 'en' ? "User blocked." : "تم حظر المستخدم.");
            queryClient.invalidateQueries(['thread_comments', postId]);
        }
    });

    return {
        report: reportMutation.mutate,
        isReporting: reportMutation.isLoading,
        block: blockMutation.mutate,
        isBlocking: blockMutation.isLoading
    };
};