import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { usePostStats } from './usePostStats.ts';
import { useInteractionStatus } from './useInteractionStatus.ts';
import { useBookmarkToggle } from './useBookmarkToggle.ts';
import { useI18n } from '../../store/i18n.tsx';
import { Post } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';

/**
 * usePostInteractions
 * Implementation of POST_INTERACTION_V1 Contract.
 * Enforces: Auth gating, ownership rules, denormalized stat sync signals.
 */
export const usePostInteractions = (postId: string | undefined, post?: Post) => {
    const queryClient = useQueryClient();
    const { user, isGuest } = useAuth();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const uid = user?.uid;

    const stats = usePostStats(postId);
    const status = useInteractionStatus(postId, 'post');
    const bookmarkMutation = useBookmarkToggle();

    const isOwner = post && uid && post.authorId === uid;
    const isDeleted = post && post.status === 'deleted';

    const loginPrompt = () =>
        showToast(lang === 'en' ? "Please sign in to interact." : "يرجى تسجيل الدخول للتفاعل.");

    // Authoritative Like Mutation
    const likeMutation = useMutation({
        mutationFn: async (id: string) => {
            if (isGuest || !uid) throw new Error("AUTH_REQUIRED");

            const functions = getFunctions();
            const likeFn = httpsCallable(functions, 'likeSocialPost');
            const result = await likeFn({ postId: id });
            return result.data;
        },
        onMutate: async (id) => {
            if (isGuest || !uid || isDeleted) return;

            const statusKey = [...queryKeys.user.all(uid), 'interaction', uid, 'post', id];
            const statsKey = [...queryKeys.social.all, 'stats', id];

            await queryClient.cancelQueries(statusKey);
            await queryClient.cancelQueries(statsKey);

            const previousStatus = queryClient.getQueryData(statusKey);
            const previousStats = queryClient.getQueryData(statsKey);

            if (previousStatus) {
                const isNowLiked = !(previousStatus as any).like;
                queryClient.setQueryData(statusKey, {
                    ...(previousStatus as any),
                    like: isNowLiked
                });

                if (previousStats) {
                    queryClient.setQueryData(statsKey, {
                        ...(previousStats as any),
                        likesCount: Math.max(
                            0,
                            (previousStats as any).likesCount + (isNowLiked ? 1 : -1)
                        )
                    });
                }
            }

            return { previousStatus, previousStats };
        },
        onError: (err: any, id, context: any) => {
            if (context?.previousStatus) {
                queryClient.setQueryData(
                    [...queryKeys.user.all(uid), 'interaction', uid, 'post', id],
                    context.previousStatus
                );
            }
            if (context?.previousStats) {
                queryClient.setQueryData(
                    [...queryKeys.social.all, 'stats', id],
                    context.previousStats
                );
            }

            if (err.message !== "AUTH_REQUIRED") {
                showToast(lang === 'en' ? "Failed to like post." : "فشل الإعجاب بالمنشور.");
            }
        },
        onSettled: (_, __, id) => {
            if (uid) {
                queryClient.invalidateQueries(
                    [...queryKeys.user.all(uid), 'interaction', uid, 'post', id]
                );
            }
            queryClient.invalidateQueries([...queryKeys.social.all, 'stats', id]);
        }
    });

    // Authoritative Repost Mutation
    const repostMutation = useMutation({
        mutationFn: async (id: string) => {
            if (isGuest || !uid) throw new Error("AUTH_REQUIRED");
            if (isOwner) throw new Error("OWNER_REPOST_BLOCKED");

            const functions = getFunctions();
            const repostFn = httpsCallable(functions, 'repostSocialPost');
            const result = await repostFn({ postId: id });
            return result.data;
        },
        onMutate: async (id) => {
            if (isGuest || !uid || isOwner || isDeleted) return;

            const statusKey = [...queryKeys.user.all(uid), 'interaction', uid, 'post', id];
            const statsKey = [...queryKeys.social.all, 'stats', id];

            await queryClient.cancelQueries(statusKey);
            await queryClient.cancelQueries(statsKey);

            const previousStatus = queryClient.getQueryData(statusKey);
            const previousStats = queryClient.getQueryData(statsKey);

            if (previousStatus) {
                const isNowReposted = !(previousStatus as any).repost;
                queryClient.setQueryData(statusKey, {
                    ...(previousStatus as any),
                    repost: isNowReposted
                });

                if (previousStats) {
                    queryClient.setQueryData(statsKey, {
                        ...(previousStats as any),
                        repostsCount: Math.max(
                            0,
                            (previousStats as any).repostsCount + (isNowReposted ? 1 : -1)
                        )
                    });
                }
            }

            return { previousStatus, previousStats };
        },
        onError: (err: any, id, context: any) => {
            if (context?.previousStatus) {
                queryClient.setQueryData(
                    [...queryKeys.user.all(uid), 'interaction', uid, 'post', id],
                    context.previousStatus
                );
            }
            if (context?.previousStats) {
                queryClient.setQueryData(
                    [...queryKeys.social.all, 'stats', id],
                    context.previousStats
                );
            }

            if (err.message === "OWNER_REPOST_BLOCKED") {
                showToast(
                    lang === 'en'
                        ? "You cannot repost your own post."
                        : "لا يمكنك إعادة نشر منشورك الخاص."
                );
            } else if (err.message !== "AUTH_REQUIRED") {
                showToast(lang === 'en' ? "Failed to repost." : "فشل إعادة النشر.");
            }
        },
        onSettled: (_, __, id) => {
            if (uid) {
                queryClient.invalidateQueries(
                    [...queryKeys.user.all(uid), 'interaction', uid, 'post', id]
                );
            }
            queryClient.invalidateQueries([...queryKeys.social.all, 'stats', id]);
        }
    });

    return {
        isLiked: status.data?.like || false,
        isBookmarked: status.data?.bookmark || false,
        isReposted: status.data?.repost || false,
        counts: stats.data || {
            likesCount: 0,
            commentsCount: 0,
            repostsCount: 0,
            bookmarksCount: 0
        },
        isLoading: stats.isLoading || status.isLoading,
        isTransitioning:
            likeMutation.isLoading ||
            repostMutation.isLoading ||
            bookmarkMutation.isLoading,
        actions: {
            toggleLike: () => {
                if (isGuest) return loginPrompt();
                if (postId) likeMutation.mutate(postId);
            },
            toggleBookmark: () => {
                if (isGuest) return loginPrompt();
                if (postId) {
                    bookmarkMutation.mutate({
                        entityId: postId,
                        type: 'post',
                        isBookmarked: status.data?.bookmark || false
                    });
                }
            },
            toggleRepost: () => {
                if (isGuest) return loginPrompt();
                if (!postId) return;
                if (isOwner) {
                    showToast(
                        lang === 'en'
                            ? "You cannot repost your own post."
                            : "لا يمكنك إعادة نشر منشورك الخاص."
                    );
                    return;
                }
                repostMutation.mutate(postId);
            },
            share: () => {
                const url = `${window.location.origin}/post/${postId}`;
                if (navigator.share) {
                    navigator.share({ title: 'BookTown 11 Post', url });
                } else {
                    navigator.clipboard.writeText(url);
                    showToast(lang === 'en' ? 'Link copied!' : 'تم نسخ الرابط!');
                }
            }
        }
    };
};