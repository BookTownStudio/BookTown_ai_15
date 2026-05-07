import { useCallback } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { ThreadComment } from '../../types/entities.ts';
import { dataService } from '../../services/dataService.ts';
import { useInfiniteQuery, useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { callCallableEndpoint } from '../callable.ts';
import { queryKeys } from '../queryKeys.ts';

interface CommentsPage {
  comments: ThreadComment[];
  hasMore: boolean;
  nextCursor?: string;
}

interface InfiniteCommentsData {
  pages: CommentsPage[];
  pageParams: unknown[];
}

interface InteractionSnapshotData {
  counts?: {
    commentsCount?: number;
  };
}

interface FeedPageData {
  posts?: Array<{
    id?: string;
    counters?: {
      comments?: number;
    };
  }>;
}

interface UseThreadCommentsResult {
  comments: ThreadComment[];
  status: 'loading' | 'success' | 'error';
  hasMore: boolean;
  fetchNextPage: () => Promise<void>;
  retry: () => void;
  addComment: (text: string, parentId?: string) => Promise<void>;
  likeComment: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  editComment: (commentId: string, text: string) => Promise<void>;
  isSubmitting: boolean;
}

const buildOptimisticComment = ({
  authorAvatar,
  authorHandle,
  authorId,
  authorName,
  parentId,
  text,
  tempId,
}: {
  authorAvatar: string;
  authorHandle: string;
  authorId: string;
  authorName: string;
  parentId?: string;
  text: string;
  tempId: string;
}): ThreadComment => ({
  id: tempId,
  authorId,
  authorName,
  authorHandle,
  authorAvatar,
  createdAt: new Date().toISOString(),
  text: text.trim(),
  parentId: parentId?.trim() || null,
  liked: false,
  likesCount: 0,
});

const flattenPages = (data?: { pages?: CommentsPage[] }): ThreadComment[] =>
  Array.isArray(data?.pages)
    ? data!.pages.flatMap((page) => page.comments)
    : [];

const patchCommentPages = (
  old: InfiniteCommentsData | undefined,
  updater: (comment: ThreadComment) => ThreadComment | null
): InfiniteCommentsData | undefined => {
  if (!old) return old;

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      comments: page.comments.reduce<ThreadComment[]>((accumulator, comment) => {
        const nextComment = updater(comment);
        if (nextComment) {
          accumulator.push(nextComment);
        }
        return accumulator;
      }, []),
    })),
  };
};

const prependCommentToFirstPage = (
  old: InfiniteCommentsData | undefined,
  comment: ThreadComment
): InfiniteCommentsData => {
  if (!old || old.pages.length === 0) {
    return {
      pages: [{ comments: [comment], hasMore: false }],
      pageParams: [undefined],
    };
  }

  const firstPage = old.pages[0];
  const dedupedFirstPageComments = firstPage.comments.filter(
    (existingComment) => existingComment.id !== comment.id
  );

  return {
    ...old,
    pages: [
      {
        ...firstPage,
        comments: [comment, ...dedupedFirstPageComments],
      },
      ...old.pages.slice(1),
    ],
  };
};

const restoreCommentsSnapshot = (
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
  previousComments: InfiniteCommentsData | undefined
) => {
  if (previousComments) {
    queryClient.setQueryData(queryKey, previousComments);
    return;
  }

  queryClient.removeQueries({ queryKey: queryKey });
};

const incrementPostCommentCaches = (
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  uid: string | undefined,
  delta: number
) => {
  const applyDelta = (count: unknown) =>
    Math.max(
      0,
      (typeof count === 'number' && Number.isFinite(count) ? count : 0) + delta
    );

  queryClient.setQueryData<InteractionSnapshotData>(
    ['social', 'interactionSnapshot', uid || 'guest', postId],
    (current) =>
      current
        ? {
            ...current,
            counts: {
              ...current.counts,
              commentsCount: applyDelta(current.counts?.commentsCount),
            },
          }
        : current
  );

  queryClient.setQueryData(
    ['social', 'post-discussion', postId],
    (current: any) =>
      current
        ? {
            ...current,
            counters: {
              ...(current.counters || {}),
              comments: applyDelta(current.counters?.comments),
            },
          }
        : current
  );

  queryClient.setQueryData(
    queryKeys.social.post(postId) as unknown as any[],
    (current: any) =>
      current
        ? {
            ...current,
            counters: {
              ...(current.counters || {}),
              comments: applyDelta(current.counters?.comments),
            },
          }
        : current
  );

  queryClient.setQueriesData(
    { queryKey: ['feed'] },
    (current: any) => {
      if (!current || !Array.isArray(current.pages)) return current;

      return {
        ...current,
        pages: current.pages.map((page: FeedPageData) => ({
          ...page,
          posts: Array.isArray(page.posts)
            ? page.posts.map((post) =>
                post?.id === postId
                  ? {
                      ...post,
                      counters: {
                        ...(post.counters || {}),
                        comments: applyDelta(post.counters?.comments),
                      },
                    }
                  : post
              )
            : page.posts,
        })),
      };
    }
  );
};

/**
 * useThreadComments
 * Authoritative implementation of POST_DISCUSSION_DATA_FLOW_V1 and INTERACTIONS_V1.
 */
export const useThreadComments = (postId: string): UseThreadCommentsResult => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queryKey = ['comments', 'byPostId', postId] as const;

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage: fetchNextPageRaw,
    isFetchingNextPage,
  } = useInfiniteQuery<
    CommentsPage,
    Error,
    InfiniteData<CommentsPage, string | undefined>,
    typeof queryKey,
    string | undefined
  >({
    queryKey,
    queryFn: ({ pageParam }) =>
      dataService.social.getComments(
        postId,
        typeof pageParam === 'string' ? pageParam : undefined
      ),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: CommentsPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30000,
    enabled: !!postId,
  });

  const comments = flattenPages(data);

  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage || isError || isLoading) return;
    await fetchNextPageRaw();
  }, [fetchNextPageRaw, hasNextPage, isError, isFetchingNextPage, isLoading]);

  const addCommentMutation = useMutation({
    mutationFn: async ({ parentId, text }: { text: string; parentId?: string }) =>
      callCallableEndpoint<
        { postId: string; text: string; parentId?: string },
        { success: boolean; commentId?: string }
      >('addSocialComment', { postId, text, parentId }),
    onMutate: async ({ parentId, text }) => {
      if (!user) {
        throw new Error('AUTH_REQUIRED');
      }

      await queryClient.cancelQueries({ queryKey: queryKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(queryKey);
      const previousInteractionSnapshot = queryClient.getQueryData<InteractionSnapshotData>([
        'social',
        'interactionSnapshot',
        user.uid,
        postId,
      ]);
      const previousDiscussionPost = queryClient.getQueryData(['social', 'post-discussion', postId]);
      const previousPost = queryClient.getQueryData(
        queryKeys.social.post(postId) as unknown as any[]
      );
      const previousFeeds = queryClient.getQueriesData({ queryKey: ['feed'] });
      const tempId = `temp_comment_${Date.now()}`;
      const optimisticComment = buildOptimisticComment({
        authorAvatar: user.photoURL || `https://api.dicebear.com/8.x/lorelei/svg?seed=${user.uid}`,
        authorHandle: `@${(user.email || 'user').split('@')[0]}`,
        authorId: user.uid,
        authorName: user.displayName || (user.email || 'Anonymous').split('@')[0],
        parentId,
        text,
        tempId,
      });

      queryClient.setQueryData<InfiniteCommentsData>(queryKey, (old) =>
        prependCommentToFirstPage(old, optimisticComment)
      );
      incrementPostCommentCaches(queryClient, postId, user.uid, 1);

      return {
        optimisticComment,
        previousComments,
        previousInteractionSnapshot,
        previousDiscussionPost,
        previousPost,
        previousFeeds,
        tempId,
      };
    },
    onError: (_error, _variables, context) => {
      restoreCommentsSnapshot(queryClient, queryKey, context?.previousComments);
      if (context?.previousInteractionSnapshot) {
        queryClient.setQueryData(
          ['social', 'interactionSnapshot', user?.uid || 'guest', postId],
          context.previousInteractionSnapshot
        );
      }
      if (typeof context?.previousDiscussionPost !== 'undefined') {
        queryClient.setQueryData(['social', 'post-discussion', postId], context.previousDiscussionPost);
      }
      if (typeof context?.previousPost !== 'undefined') {
        queryClient.setQueryData(
          queryKeys.social.post(postId) as unknown as any[],
          context.previousPost
        );
      }
      if (Array.isArray(context?.previousFeeds)) {
        context.previousFeeds.forEach(([key, value]: [unknown, unknown]) => {
          queryClient.setQueryData(key as any, value);
        });
      }
    },
    onSuccess: (result, _variables, context) => {
      if (!context) return;

      queryClient.setQueryData<InfiniteCommentsData>(queryKey, (old) =>
        patchCommentPages(old, (comment) => {
          if (comment.id !== context.tempId) return comment;
          return {
            ...comment,
            id: result.commentId || comment.id,
          };
        })
      );
    },
  });

  const likeCommentMutation = useMutation({
    mutationFn: async ({ commentId }: { commentId: string }) =>
      callCallableEndpoint<
        { postId: string; commentId: string },
        { success: boolean; liked?: boolean }
      >('likeSocialComment', { postId, commentId }),
    onMutate: async ({ commentId }) => {
      await queryClient.cancelQueries({ queryKey: queryKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(queryKey);
      queryClient.setQueryData<InfiniteCommentsData>(queryKey, (old) =>
        patchCommentPages(old, (comment) => {
          if (comment.id !== commentId) return comment;
          const currentlyLiked = comment.liked === true;
          return {
            ...comment,
            liked: !currentlyLiked,
            likesCount: Math.max(0, (comment.likesCount || 0) + (currentlyLiked ? -1 : 1)),
          };
        })
      );

      return { previousComments };
    },
    onError: (_error, _variables, context) => {
      restoreCommentsSnapshot(queryClient, queryKey, context?.previousComments);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async ({ commentId }: { commentId: string }) =>
      callCallableEndpoint<
        { postId: string; commentId: string },
        { success: boolean }
      >('deleteSocialComment', { postId, commentId }),
    onMutate: async ({ commentId }) => {
      await queryClient.cancelQueries({ queryKey: queryKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(queryKey);
      queryClient.setQueryData<InfiniteCommentsData>(queryKey, (old) =>
        patchCommentPages(old, (comment) => (comment.id === commentId ? null : comment))
      );

      return { previousComments };
    },
    onError: (_error, _variables, context) => {
      restoreCommentsSnapshot(queryClient, queryKey, context?.previousComments);
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) =>
      callCallableEndpoint<
        { postId: string; commentId: string; text: string },
        { success: boolean }
      >('editSocialComment', { postId, commentId, text }),
    onMutate: async ({ commentId, text }) => {
      await queryClient.cancelQueries({ queryKey: queryKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(queryKey);
      queryClient.setQueryData<InfiniteCommentsData>(queryKey, (old) =>
        patchCommentPages(old, (comment) =>
          comment.id === commentId
            ? { ...comment, text: text.trim() }
            : comment
        )
      );

      return { previousComments };
    },
    onError: (_error, _variables, context) => {
      restoreCommentsSnapshot(queryClient, queryKey, context?.previousComments);
    },
  });

  return {
    comments,
    status: isError ? 'error' : isLoading ? 'loading' : 'success',
    hasMore: hasNextPage === true,
    fetchNextPage,
    retry: () => {
      void refetch();
    },
    addComment: async (text: string, parentId?: string) => {
      await addCommentMutation.mutateAsync({ text, parentId });
    },
    likeComment: async (commentId: string) => {
      await likeCommentMutation.mutateAsync({ commentId });
    },
    deleteComment: async (commentId: string) => {
      await deleteCommentMutation.mutateAsync({ commentId });
    },
    editComment: async (commentId: string, text: string) => {
      await editCommentMutation.mutateAsync({ commentId, text });
    },
    isSubmitting: addCommentMutation.isPending,
  };
};
