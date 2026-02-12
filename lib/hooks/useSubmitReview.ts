// lib/hooks/useSubmitReview.ts

import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { useUserProfile } from './useUserProfile.ts';

type ReviewVariables = {
  bookId: string;
  rating: number;
  text: string;
};

export const useSubmitReview = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Fetch profile to get "New User" instead of Auth default "Anonymous"
  const { data: profile } = useUserProfile(user?.uid);

  const mutation = useMutation({
    mutationFn: async ({ bookId, rating, text }: ReviewVariables) => {
      if (!user?.uid) throw new Error('NOT_AUTHENTICATED');

      /**
       * 🔒 Authoritative write
       * Priority: Profile Name -> Auth Name -> Anonymous
       */
      return dataService.catalog.addReview(user.uid, {
        bookId,
        rating,
        text,
        authorName: profile?.name || user.displayName || 'Anonymous',
        authorHandle: profile?.handle?.replace('@', '') || user.email?.split('@')[0] || 'user',
        authorAvatar: profile?.avatarUrl || user.photoURL || null,
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