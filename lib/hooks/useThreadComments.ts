import { useCallback } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { ThreadComment } from '../../types/entities.ts';
import { dataService } from '../../services/dataService.ts';
import { useInfiniteQuery, useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { callCallableEndpoint } from '../callable.ts';
import { invalidateCommentConvergence } from '../socialCacheReconciliation.ts';

interface CommentsPage {
  comments: ThreadComment[];
  hasMore: boolean;
  nextCursor?: string;
}

interface InfiniteCommentsData {
  pages: CommentsPage[];
  pageParams: unknown[];
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
    onMutate: async () => {
      if (!user) {
        throw new Error('AUTH_REQUIRED');
      }

      await queryClient.cancelQueries({ queryKey: queryKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(queryKey);

      return {
        previousComments,
      };
    },
    onError: (_error, _variables, context) => {
      restoreCommentsSnapshot(queryClient, queryKey, context?.previousComments);
    },
    onSuccess: async () => {
      await invalidateCommentConvergence(queryClient, postId);
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
    onSettled: async () => {
      await invalidateCommentConvergence(queryClient, postId);
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
    onSettled: async () => {
      await invalidateCommentConvergence(queryClient, postId);
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
    onSettled: async () => {
      await invalidateCommentConvergence(queryClient, postId);
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
