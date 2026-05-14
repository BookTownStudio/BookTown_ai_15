import { queryKeys } from './queryKeys.ts';

type QueryClientLike = {
  invalidateQueries: (filters: { queryKey: readonly unknown[] | unknown[]; exact?: boolean }) => Promise<unknown> | unknown;
};

export const interactionSnapshotRootKey = ['social', 'interactionSnapshot'] as const;
export const postDiscussionKey = (postId: string) => ['social', 'post-discussion', postId] as const;
export const commentsByPostKey = (postId: string) => ['comments', 'byPostId', postId] as const;

export async function invalidatePostConvergence(
  queryClient: QueryClientLike,
  postId: string | undefined
): Promise<void> {
  if (!postId) return;

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['feed'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.social.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.social.post(postId) as unknown as unknown[] }),
    queryClient.invalidateQueries({ queryKey: postDiscussionKey(postId) }),
    queryClient.invalidateQueries({ queryKey: interactionSnapshotRootKey }),
  ]);
}

export async function invalidateCommentConvergence(
  queryClient: QueryClientLike,
  postId: string | undefined
): Promise<void> {
  if (!postId) return;

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: commentsByPostKey(postId) }),
    invalidatePostConvergence(queryClient, postId),
  ]);
}

export async function invalidateBookmarkConvergence(
  queryClient: QueryClientLike,
  uid: string | undefined,
  entityType: string,
  entityId: string
): Promise<void> {
  if (!uid || !entityId) return;

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.user.bookmarks(uid) as unknown as unknown[] }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.user.bookmarkStatus(uid, entityType, entityId) as unknown as unknown[],
    }),
    entityType === 'post'
      ? invalidatePostConvergence(queryClient, entityId)
      : Promise.resolve(),
  ]);
}

export async function invalidateNotificationConvergence(
  queryClient: QueryClientLike,
  uid: string | undefined
): Promise<void> {
  if (!uid) return;
  await queryClient.invalidateQueries({ queryKey: queryKeys.user.notifications(uid) });
}
