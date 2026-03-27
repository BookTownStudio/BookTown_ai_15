import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Post } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import { callCallableEndpoint } from '../callable.ts';
import { dataService } from '../../services/dataService.ts';
import { socialActionRepository } from '../../services/socialActionRepository.ts';

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

const updateSnapshotCounts = (
  snapshot: PostInteractionSnapshot,
  field: 'likesCount' | 'repostsCount' | 'bookmarksCount',
  delta: number
): PostInteractionSnapshot => ({
  ...snapshot,
  counts: {
    ...snapshot.counts,
    [field]: Math.max(0, snapshot.counts[field] + delta),
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
    () => ['social', 'interactionSnapshot', uid || 'guest', postId || 'none'],
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

  const isOwner = post && uid && post.authorId === uid;
  const isDeleted = post && post.status === 'deleted';

  const loginPrompt = () =>
    showToast(lang === 'en' ? 'Please sign in to interact.' : 'يرجى تسجيل الدخول للتفاعل.');

  const likeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isGuest || !uid) throw new Error('AUTH_REQUIRED');
      return callCallableEndpoint<{ postId: string }, { success: boolean; liked?: boolean }>(
        'likeSocialPost',
        { postId: id }
      );
    },
    onMutate: async () => {
      if (isGuest || !uid || isDeleted) return;

      await queryClient.cancelQueries(interactionKey);
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
  });

  const repostMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isGuest || !uid) throw new Error('AUTH_REQUIRED');
      if (isOwner) throw new Error('OWNER_REPOST_BLOCKED');
      return callCallableEndpoint<{ postId: string }, { success: boolean; reposted?: boolean }>(
        'repostSocialPost',
        { postId: id }
      );
    },
    onMutate: async () => {
      if (isGuest || !uid || isOwner || isDeleted) return;

      await queryClient.cancelQueries(interactionKey);
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

      if (err.message === 'OWNER_REPOST_BLOCKED') {
        showToast(
          lang === 'en'
            ? 'You cannot repost your own post.'
            : 'لا يمكنك إعادة نشر منشورك الخاص.'
        );
      } else if (err.message !== 'AUTH_REQUIRED') {
        showToast(lang === 'en' ? 'Failed to repost.' : 'فشل إعادة النشر.');
      }
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!uid || isGuest) throw new Error('AUTH_REQUIRED');

      const current = queryClient.getQueryData<PostInteractionSnapshot>(interactionKey) || seedSnapshot;
      if (current.status.bookmark) {
        await socialActionRepository.unbookmark(id, uid, 'post');
      } else {
        await socialActionRepository.bookmark(id, uid, 'post');
      }
    },
    onMutate: async () => {
      if (!uid || isGuest || isDeleted) return;

      await queryClient.cancelQueries(interactionKey);
      const previousSnapshot =
        queryClient.getQueryData<PostInteractionSnapshot>(interactionKey) || seedSnapshot;
      const isNowBookmarked = !previousSnapshot.status.bookmark;

      queryClient.setQueryData<PostInteractionSnapshot>(interactionKey, {
        ...previousSnapshot,
        status: {
          ...previousSnapshot.status,
          bookmark: isNowBookmarked,
        },
        counts: {
          ...previousSnapshot.counts,
          bookmarksCount: Math.max(
            0,
            previousSnapshot.counts.bookmarksCount + (isNowBookmarked ? 1 : -1)
          ),
        },
      });

      return { previousSnapshot };
    },
    onError: (_err, _id, context: any) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(interactionKey, context.previousSnapshot);
      }
      showToast(lang === 'en' ? 'Failed to update bookmark.' : 'فشل تحديث الحفظ.');
    },
  });

  const snapshot = interactionSnapshot.data || seedSnapshot;

  return {
    isLiked: snapshot.status.like,
    isBookmarked: snapshot.status.bookmark,
    isReposted: snapshot.status.repost,
    counts: snapshot.counts,
    isLoading: interactionSnapshot.isLoading,
    isTransitioning:
      likeMutation.isLoading || repostMutation.isLoading || bookmarkMutation.isLoading,
    actions: {
      toggleLike: () => {
        if (isGuest) return loginPrompt();
        if (postId) likeMutation.mutate(postId);
      },
      toggleBookmark: () => {
        if (isGuest) return loginPrompt();
        if (postId) bookmarkMutation.mutate(postId);
      },
      toggleRepost: () => {
        if (isGuest) return loginPrompt();
        if (!postId) return;
        if (isOwner) {
          showToast(
            lang === 'en'
              ? 'You cannot repost your own post.'
              : 'لا يمكنك إعادة نشر منشورك الخاص.'
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
      },
    },
  };
};
