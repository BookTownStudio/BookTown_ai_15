import { Post, ThreadPost } from '../../types/entities.ts';

export type PostDetailsStatus = 'idle' | 'success' | 'error';
export type PostDetailsError = 'not_found' | 'invalid_payload' | 'forbidden';

/**
 * usePostDetails
 * Authoritative point-of-entry for the Post Thread view.
 * Implements POST_DISCUSSION_DATA_FLOW_V1 (LOCKED).
 * 
 * DATA_AUTHORITY: post_data: prefetched_from_feed_only.
 * EXPLICIT_PROHIBITION: no refetch of post data.
 */
export const usePostDetails = (postId: string | undefined, prefetchedPost?: Post) => {
    let status: PostDetailsStatus = 'idle';
    let errorType: PostDetailsError | undefined;
    let threadData: ThreadPost | undefined;

    // DATA_AUTHORITY: Post data MUST come from prefetched snapshot to ensure zero-spinner post render
    if (!postId || !prefetchedPost) {
        // DISCUSSION_DATA_FLOW_V1: If no prefetched post, we cannot proceed per authority rule
        status = 'error';
        errorType = 'not_found';
    } else if (prefetchedPost.id !== postId) {
        status = 'error';
        errorType = 'invalid_payload';
    } else {
        // POST_RENDER: Spinner explicitly forbidden for post data
        threadData = {
            id: prefetchedPost.id,
            authorId: prefetchedPost.authorId,
            authorName: prefetchedPost.authorName,
            authorHandle: prefetchedPost.authorHandle,
            authorAvatar: prefetchedPost.authorAvatar,
            createdAt: prefetchedPost.timestamps.createdAt,
            visibility: prefetchedPost.visibility,
            status: prefetchedPost.status,
            content: {
                text: prefetchedPost.content.text,
                attachments: prefetchedPost.content.attachments
            },
            attachments: prefetchedPost.attachments,
            interactionCounts: {
                likes: prefetchedPost.counters.likes || 0,
                comments: prefetchedPost.counters.comments || 0,
                bookmarks: prefetchedPost.counters.bookmarks || 0
            },
            viewerState: {
                liked: false, 
                bookmarked: false,
                canComment: true,
                canEdit: false
            }
        };
        status = 'success';
    }

    return {
        data: threadData,
        isLoading: false, // Explicitly false per post_render: spinner_allowed: false
        isError: status === 'error',
        refetch: () => Promise.resolve(), // Explicitly forbidden: no refetch of post data
        status: status as PostDetailsStatus,
        errorType
    };
};