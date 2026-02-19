import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import type { Review } from '../../types/entities.ts';

/**
 * Book Reviews (Callable Authoritative Read Path)
 * Source of truth:
 * - listBookReviews callable (server filtered visibility, deterministic envelope)
 */
export const useBookReviews = (bookId: string | undefined) => {
  return useQuery<Review[]>({
    queryKey: ['reviews', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      if (!bookId) return [];
      const page = await dataService.catalog.getReviewsPage(bookId, { limit: 20 });
      return page.items;
    },
    retry: false,
    staleTime: 0,
  });
};
