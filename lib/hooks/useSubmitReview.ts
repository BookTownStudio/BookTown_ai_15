// lib/hooks/useSubmitReview.ts

import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import type { LibrarianRecommendationContext } from '../../types/librarian.ts';

type ReviewVariables = {
  bookId: string;
  rating: number;
  text: string;
  visibility?: 'public' | 'private';
  recommendationContext?: LibrarianRecommendationContext;
};

export const useSubmitReview = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const mutation = useMutation({
    mutationFn: async ({ bookId, rating, text, visibility, recommendationContext }: ReviewVariables) => {
      if (!user?.uid) throw new Error('NOT_AUTHENTICATED');

      /**
       * 🔒 Authoritative write
       * Identity is resolved server-side from canonical user profile.
       */
      return dataService.catalog.addReview(user.uid, {
        bookId,
        rating,
        text,
        ...(visibility ? { visibility } : {}),
        ...(recommendationContext ? { recommendationContext } : {}),
      });
    },

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['reviews', variables.bookId],
      });
    },
  });

  return {
    submitReview: mutation.mutate,
    submitReviewAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
};
