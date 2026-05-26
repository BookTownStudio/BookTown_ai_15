import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export function useBookEditions(bookId?: string) {
  return useQuery({
    queryKey: ['catalog', 'bookEditions', { bookId: bookId || 'none' }],
    enabled: Boolean(bookId),
    queryFn: async () => {
      if (!bookId) return [];
      return dataService.librarySearch.listEditionsForBook(bookId, { limit: 12 });
    },
    staleTime: 1000 * 60 * 30,
  });
}
