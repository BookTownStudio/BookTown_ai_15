import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Post } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import { callCallableEndpoint } from '../callable.ts';
import { queryKeys } from '../queryKeys.ts';
import { dataService } from '../../services/dataService.ts';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { invalidateBookmarkConvergence, invalidatePostConvergence } from '../socialCacheReconciliation.ts';
import { measureSocialAsync } from '../socialPerformanceDiagnostics.ts';

type PostInteractionSnapshot = {
  counts: {
    likesCount: number;
    commentsCount: number;
    repostsCount: number;
    bookmarksCount: number;
  };
  status: {
    like: boolean;
    bookmark: boolean;
    repost: boolean;
  };
};

const buildSnapshotFromPost = (post?: Post): PostInteractionSnapshot => ({
  counts: {
    likesCount: post?.counters?.likes ?? 0,
    commentsCount: post?.counters?.comments ?? 0,
    repostsCount: post?.counters?.reposts ?? 0,
    bookmarksCount: post?.counters?.bookmarks ?? 0,
  },
  status: {
    like: post?.viewerState?.liked === true,
    bookmark: post?.viewerState?.bookmarked === true,
    repost: post?.viewerState?.reposted === true,
  },
});

const buildEmptySnapshot = (): PostInteractionSnapshot => ({
  counts: {
    likesCount: 0,
    commentsCount: 0,
    repostsCount: 0,
    bookmarksCount: 0,
  },
  status: {
    like: false,
    bookmark: false,
    repost: false,
  },
});

/**
 * usePostInteractions
 * Single authoritative interaction snapshot per rendered post.
 */
export const usePostInteractions = (postId: string | undefined, post?: Post) => {
  const queryClient = useQueryClient();
  const { user, isGuest } = useAuth();
  const { lang } = useI18n();
  const { showToast } = useToast();
  const uid = user?.uid;

  const interactionKey = useMemo(
    () => ['social', 'interactionSnapshot', uid || 'guest', postId || 'none'] as const,
    [postId, uid]
  );
  const seedSnapshot = useMemo(
    () => (post ? buildSnapshotFromPost(post) : buildEmptySnapshot()),
    [post]
  );

  const interactionSnapshot = useQuery<PostInteractionSnapshot>({
    queryKey: interactionKey,
    queryFn: async () => {
      if (!postId) return buildEmptySnapshot();

      if (!uid) {
        return post ? buildSnapshotFromPost(post) : buildEmptySnapshot();
      }

      if (post) {
        const status = post.viewerState
          ? {
              like: post.viewerState.liked === true,
              bookmark: post.viewerState.bookmarked === true,
              repost: post.viewerState.reposted === true,
            }
          : await socialActionRepository.getInteractionStatus(uid, postId, 'post');

        return {
          counts: buildSnapshotFromPost(post).counts,
          status,
        };
      }

      const [stats, status] = await Promise.all([
        dataService.social.getPostStats(postId),
        socialActionRepository.getInteractionStatus(uid, postId, 'post'),
      ]);

      return {
        counts: {
          likesCount: stats.likesCount ?? 0,
          commentsCount: stats.commentsCount ?? 0,
          repostsCount: stats.repostsCount ?? 0,
          bookmarksCount: stats.bookmarksCount ?? 0,
        },
        status,
      };
    },
    enabled: !!postId && (!post || (!!uid && !post.viewerState)),
    staleTime: 1000 * 30,
    initialData: seedSnapshot,
  });

  useEffect(() => {
    if (!postId || !post) return;
    queryClient.setQueryData<PostInteractionSnapshot>(
      interactionKey,
      buildSnapshotFromPost(post)
    );
  }, [interactionKey, post, postId, queryClient]);

  const isDeleted = post && post.status === 'deleted';

  const loginPrompt = useCallback(() =>
    showToast(lang === 'en' ? 'Please sign in to interact.' : 'يرجى تسجيل الدخول للتفاعل.'),
    [lang, showToast]
  );

  const likeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isGuest || !uid) throw new Error('AUTH_REQUIRED');
      return measureSocialAsync(
        'social_interaction_mutation',
        { kind: 'like' },
        () => callCallableEndpoint<{ postId: string }, { success: boolean; liked?: boolean }>(
          'likeSocialPost',
          { postId: id }
        )
      );
    },
    onMutate: async () => {
      if (isGuest || !uid || isDeleted) return;

      await queryClient.cancelQueries({ queryKey: interactionKey });
      const previousSnapshot = queryClient.getQueryData<PostInteractionSnapshot>(interactionKey);

      if (previousSnapshot) {
        const isNowLiked = !previousSnapshot.status.like;
        queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, {
          ...previousSnapshot,
          status: {
            ...previousSnapshot.status,
            like: isNowLiked,
          },
          counts: {
            ...previousSnapshot.counts,
            likesCount: Math.max(
              0,
              previousSnapshot.counts.likesCount + (isNowLiked ? 1 : -1)
            ),
          },
        });
      }

      return { previousSnapshot };
    },
    onError: (err: any, _id, context: any) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(interactionKey, context.previousSnapshot);
      }

      if (err.message !== 'AUTH_REQUIRED') {
        showToast(lang === 'en' ? 'Failed to like post.' : 'فشل الإعجاب بالمنشور.');
      }
    },
    onSuccess: (result) => {
      if (typeof result?.liked !== 'boolean') return;
      queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, (current) =>
        current
          ? {
              ...current,
              status: { ...current.status, like: result.liked === true },
            }
          : current
      );
    },
    onSettled: async (_data, _error, id) => {
      await measureSocialAsync(
        'social_cache_invalidation',
        { kind: 'postInteraction' },
        () => invalidatePostConvergence(queryClient, id)
      );
    },
  });

  const repostMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isGuest || !uid) throw new Error('AUTH_REQUIRED');
      return measureSocialAsync(
        'social_interaction_mutation',
        { kind: 'repost' },
        () => callCallableEndpoint<{ postId: string }, { success: boolean; reposted?: boolean }>(
          'repostSocialPost',
          { postId: id }
        )
      );
    },
    onMutate: async () => {
      if (isGuest || !uid || isDeleted) return;

      await queryClient.cancelQueries({ queryKey: interactionKey });
      const previousSnapshot = queryClient.getQueryData<PostInteractionSnapshot>(interactionKey);

      if (previousSnapshot) {
        const isNowReposted = !previousSnapshot.status.repost;
        queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, {
          ...previousSnapshot,
          status: {
            ...previousSnapshot.status,
            repost: isNowReposted,
          },
          counts: {
            ...previousSnapshot.counts,
            repostsCount: Math.max(
              0,
              previousSnapshot.counts.repostsCount + (isNowReposted ? 1 : -1)
            ),
          },
        });
      }

      return { previousSnapshot };
    },
    onError: (err: any, _id, context: any) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(interactionKey, context.previousSnapshot);
      }

      if (err.message !== 'AUTH_REQUIRED') {
        showToast(lang === 'en' ? 'Failed to repost.' : 'فشل إعادة النشر.');
      }
    },
    onSuccess: (result) => {
      if (typeof result?.reposted !== 'boolean') return;
      queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, (current) =>
        current
          ? {
              ...current,
              status: { ...current.status, repost: result.reposted === true },
            }
          : current
      );
    },
    onSettled: async (_data, _error, id) => {
      await measureSocialAsync(
        'social_cache_invalidation',
        { kind: 'postInteraction' },
        () => invalidatePostConvergence(queryClient, id)
      );
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (variables: { id: string; shouldBookmark: boolean }) => {
      if (!uid || isGuest) throw new Error('AUTH_REQUIRED');
      return measureSocialAsync(
        'social_interaction_mutation',
        { kind: 'bookmark' },
        () => dataService.social.toggleBookmark(uid, variables.id, 'post', variables.shouldBookmark)
      );
    },

    onMutate: async (variables) => {
      if (!uid || isGuest || isDeleted) return;

      await queryClient.cancelQueries({ queryKey: interactionKey });

      const previousSnapshot =
        queryClient.getQueryData<PostInteractionSnapshot>(interactionKey) || seedSnapshot;

      queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, {
        ...previousSnapshot,
        status: {
          ...previousSnapshot.status,
          bookmark: variables.shouldBookmark,
        },
        counts: {
          ...previousSnapshot.counts,
          bookmarksCount: Math.max(
            0,
            previousSnapshot.counts.bookmarksCount + (variables.shouldBookmark ? 1 : -1)
          ),
        },
      });

      return { previousSnapshot };
    },

    onSuccess: async (data, variables) => {
      if (typeof data?.bookmarked === 'boolean') {
        queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, (current) =>
          current
            ? {
                ...current,
                status: { ...current.status, bookmark: data.bookmarked === true },
              }
            : current
        );
      }
      if (uid) {
        await measureSocialAsync(
          'social_cache_invalidation',
          { kind: 'bookmark' },
          () => invalidateBookmarkConvergence(queryClient, uid, 'post', variables.id)
        );
      }
    },

    onError: (_err, _id, context: any) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(interactionKey, context.previousSnapshot);
      }

      showToast(lang === 'en' ? 'Failed to update bookmark.' : 'فشل تحديث الحفظ.');
    },
  });

  const snapshot = interactionSnapshot.data || seedSnapshot;

  const toggleLike = useCallback(() => {
    if (isGuest) return loginPrompt();
    if (postId) likeMutation.mutate(postId);
  }, [isGuest, likeMutation.mutate, loginPrompt, postId]);

  const toggleBookmark = useCallback(() => {
    if (isGuest) return loginPrompt();
    if (!postId) return;
    const current =
      queryClient.getQueryData<PostInteractionSnapshot>(interactionKey) || seedSnapshot;
    bookmarkMutation.mutate({
      id: postId,
      shouldBookmark: !current.status.bookmark,
    });
  }, [bookmarkMutation.mutate, interactionKey, isGuest, loginPrompt, postId, queryClient, seedSnapshot]);

  const toggleRepost = useCallback(() => {
    if (isGuest) return loginPrompt();
    if (!postId) return;
    repostMutation.mutate(postId);
  }, [isGuest, loginPrompt, postId, repostMutation.mutate]);

  const share = useCallback(() => {
    const url = `${window.location.origin}/post/${postId}`;
    if (navigator.share) {
      navigator.share({ title: 'BookTown 11 Post', url });
    } else {
      navigator.clipboard.writeText(url);
      showToast(lang === 'en' ? 'Link copied!' : 'تم نسخ الرابط!');
    }
  }, [lang, postId, showToast]);

  const actions = useMemo(() => ({
    toggleLike,
    toggleBookmark,
    toggleRepost,
    share,
  }), [share, toggleBookmark, toggleLike, toggleRepost]);

  return {
    isLiked: snapshot.status.like,
    isBookmarked: snapshot.status.bookmark,
    isReposted: snapshot.status.repost,
    counts: snapshot.counts,
    isLoading: interactionSnapshot.isLoading,
    pending: {
      like: likeMutation.isPending,
      bookmark: bookmarkMutation.isPending,
      repost: repostMutation.isPending,
    },
    isRepostTransitioning: repostMutation.isPending,
    isTransitioning:
      likeMutation.isPending ||
      repostMutation.isPending ||
      bookmarkMutation.isPending,
    actions,
  };
};
