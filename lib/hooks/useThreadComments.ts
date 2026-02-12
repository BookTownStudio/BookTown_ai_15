import { useState, useEffect, useRef, useCallback } from 'react';
import { ThreadComment } from '../../types/entities.ts';
import { dataService } from '../../services/dataService.ts';
import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth.tsx';

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

/**
 * useThreadComments
 * Authoritative implementation of POST_DISCUSSION_DATA_FLOW_V1 and INTERACTIONS_V1.
 */
export const useThreadComments = (postId: string): UseThreadCommentsResult => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [comments, setComments] = useState<ThreadComment[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const cursorRef = useRef<string | undefined>(undefined);
    const isFetchingRef = useRef(false);

    const queryKey = ['comments', 'byPostId', postId];

    const { isLoading, isError, refetch } = useQuery<any>({
        queryKey,
        queryFn: async () => {
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            try {
                const result = await dataService.social.getComments(postId);
                setComments(result.comments);
                setHasMore(result.hasMore);
                cursorRef.current = result.nextCursor;
                return result;
            } finally {
                isFetchingRef.current = false;
            }
        },
        staleTime: 30000,
    });

    useEffect(() => {
        return () => {
            queryClient.invalidateQueries(queryKey);
        };
    }, [postId]);

    const fetchNextPage = async () => {
        if (!hasMore || isFetchingRef.current || isError || isLoading) return;
        isFetchingRef.current = true;
        try {
            const result = await dataService.social.getComments(postId, cursorRef.current);
            setComments(prev => [...prev, ...result.comments]);
            setHasMore(result.hasMore);
            cursorRef.current = result.nextCursor;
        } finally {
            isFetchingRef.current = false;
        }
    };

    // --- Write Handlers (Interactions V1) ---

    const { mutate: submitComment, isLoading: isSubmitting } = useMutation({
        mutationFn: async ({ text, parentId }: { text: string; parentId?: string }) => {
            const functions = getFunctions();
            const addCommentFn = httpsCallable(functions, 'addSocialComment');
            const result = await addCommentFn({ postId, text, parentId });
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(queryKey);
        }
    });

    const likeComment = useCallback(async (commentId: string) => {
        if (!user) return;
        // Optimistic UI for like toggle
        setComments(prev => prev.map(c => 
            c.id === commentId 
                ? { ...c, liked: !c.liked, likesCount: (c.likesCount || 0) + (c.liked ? -1 : 1) } 
                : c
        ));
        
        try {
            const functions = getFunctions();
            const likeFn = httpsCallable(functions, 'likeSocialComment');
            await likeFn({ commentId });
        } catch (e) {
            // Rollback on failure
            queryClient.invalidateQueries(queryKey);
        }
    }, [user, queryKey, queryClient]);

    const deleteComment = useCallback(async (commentId: string) => {
        // Optimistic hide
        setComments(prev => prev.filter(c => c.id !== commentId));
        try {
            const functions = getFunctions();
            const deleteFn = httpsCallable(functions, 'deleteSocialComment');
            await deleteFn({ commentId });
        } catch (e) {
            queryClient.invalidateQueries(queryKey);
        }
    }, [queryKey, queryClient]);

    const editComment = useCallback(async (commentId: string, text: string) => {
        try {
            const functions = getFunctions();
            const editFn = httpsCallable(functions, 'editSocialComment');
            await editFn({ commentId, text });
            queryClient.invalidateQueries(queryKey);
        } catch (e) {
            console.error("Edit failed", e);
        }
    }, [queryKey, queryClient]);

    return {
        comments,
        status: isError ? 'error' : isLoading ? 'loading' : 'success',
        hasMore,
        fetchNextPage,
        retry: refetch,
        addComment: (text: string, parentId?: string) => submitComment({ text, parentId }),
        likeComment,
        deleteComment,
        editComment,
        isSubmitting
    };
};
