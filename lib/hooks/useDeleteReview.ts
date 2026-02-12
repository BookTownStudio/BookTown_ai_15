// lib/hooks/useDeleteReview.ts

import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { useToast } from '../../store/toast.tsx';
import type { Review } from '../../types/entities.ts';

/**
 * 🔒 Authoritative Review Deletion Hook
 */
export const useDeleteReview = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({ bookId }: { bookId: string }) => {
      if (!user?.uid) throw new Error('NOT_AUTHENTICATED');
      if (!bookId) throw new Error('BOOK_ID_MISSING');
      return dataService.catalog.deleteReview(user.uid, bookId);
    },

    /**
     * ⚡ Optimistic delete with physical node removal
     */
    onMutate: async ({ bookId }) => {
      const queryKey = ['reviews', bookId];
      await queryClient.cancelQueries(queryKey as any);

      const previousReviews = queryClient.getQueryData<Review[]>(queryKey as any);

      queryClient.setQueryData<Review[] | undefined>(
        queryKey as any,
        (old) => old ? old.filter(r => r.userId !== user?.uid) : []
      );

      return { previousReviews };
    },

    onError: (_err, { bookId }, context: any) => {
      if (context?.previousReviews) {
        queryClient.setQueryData(['reviews', bookId], context.previousReviews);
      }
      showToast('Failed to delete review.');
    },

    onSettled: (_data, _err, { bookId }) => {
      queryClient.invalidateQueries(['reviews', bookId] as any);
      queryClient.invalidateQueries(['catalog', 'book', { id: bookId }] as any);
    },

    onSuccess: () => {
      showToast('Review deleted.');
    },
  });
};