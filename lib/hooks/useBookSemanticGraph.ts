import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import type { BookSemanticGraph } from '../../types/literaryGraph.ts';
import { queryKeys } from '../queryKeys.ts';

export function useBookSemanticGraph(
  bookId: string | undefined,
  options: { limit?: number; enabled?: boolean } = {}
) {
  const limit = options.limit ?? 12;
  const enabled =
    options.enabled !== undefined
      ? options.enabled && !!bookId
      : !!bookId;

  return useQuery<BookSemanticGraph>({
    queryKey: queryKeys.catalog.semanticGraph(bookId, limit),
    queryFn: async () => {
      if (!bookId) {
        throw new Error('BOOK_ID_MISSING');
      }
      return dataService.catalog.getBookSemanticGraph({ bookId, limit });
    },
    enabled,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 6,
    retry: false,
  });
}
