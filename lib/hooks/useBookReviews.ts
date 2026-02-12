// lib/hooks/useBookReviews.ts

import { useQuery } from '../react-query.ts';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.ts';
import { Review } from '../../types/entities.ts';

/**
 * 📖 Book Reviews (Authoritative Read Path)
 * ----------------------------------------
 * SOURCE OF TRUTH:
 *  - books/{bookId}/reviews/{userId}
 *
 * GUARANTEES:
 *  - Server-authoritative
 *  - Deterministic ordering
 *  - React Query–compatible invalidation
 *  - No mock leakage
 */
export const useBookReviews = (bookId: string | undefined) => {
  return useQuery<Review[]>({
    queryKey: ['reviews', bookId],

    enabled: !!bookId,

    queryFn: async () => {
      // HARD GUARD: Firebase not initialized or invalid input
      // This must silently fail and never throw.
      if (!bookId || !db.raw) return [];

      const q = query(
        collection(db.raw, 'books', bookId, 'reviews'),
        orderBy('updatedAt', 'desc')
      );

      const snap = await getDocs(q);

      return snap.docs.map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          bookId: data.bookId,
          userId: data.userId,
          rating: data.rating,
          text: data.text,
          authorName: data.authorName,
          authorHandle: data.authorHandle,
          authorAvatar: data.authorAvatar,

          // Timestamp resolution (Firestore Timestamp → ISO → fallback)
          timestamp:
            data.updatedAt?.toDate?.()?.toISOString() ||
            data.updatedAt ||
            data.createdAt?.toDate?.()?.toISOString() ||
            data.createdAt ||
            new Date().toISOString(),

          upvotes: data.upvotes ?? 0,
          downvotes: data.downvotes ?? 0,
          commentsCount: data.commentsCount ?? 0,
        } as Review;
      });
    },

    /**
     * Reviews must always reflect server truth.
     * No retries, no optimistic ghosts.
     */
    retry: false,
    staleTime: 0,
  });
};