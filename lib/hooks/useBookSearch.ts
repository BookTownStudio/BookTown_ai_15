import { useDebounce } from 'use-debounce';
import { useQuery } from '../react-query.ts';
import { bookSearchService } from '../../services/bookSearchService.ts';
import { SearchResponseDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../logging/bookEngineV2Log.ts';

type UseBookSearchOptions = {
  ebookOnly?: boolean;
  lang?: string;
  limit?: number;
};

export const useBookSearch = (
  query: string,
  options: UseBookSearchOptions = {}
) => {
  const [debouncedQuery] = useDebounce(query, 450);
  const normalizedQuery = debouncedQuery.trim();

  return useQuery<SearchResponseDTO>({
    queryKey: [
      'bookSearchV2',
      normalizedQuery,
      Boolean(options.ebookOnly),
      options.lang || '',
      typeof options.limit === 'number' ? options.limit : 15,
    ],
    queryFn: () =>
      {
        logBookEngineV2('BOOK_SEARCH_V2_CLIENT_QUERY', {
          query: normalizedQuery.slice(0, 80),
          enabled: normalizedQuery.length >= 2,
          ebookOnly: Boolean(options.ebookOnly),
          lang: options.lang || 'auto',
          limit:
            typeof options.limit === 'number'
              ? Math.max(1, Math.min(30, Math.trunc(options.limit)))
              : 15,
        });

        return bookSearchService.searchBooks({
          query: normalizedQuery,
          ebookOnly: options.ebookOnly,
          lang: options.lang,
          limit: options.limit,
        });
      },
    enabled: normalizedQuery.length >= 2,
    staleTime: 20_000,
    retry: false,
  });
};
