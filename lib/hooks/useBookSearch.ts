import { useDebounce } from 'use-debounce';
import { useQuery } from '../react-query.ts';
import { assertValidSearchModes, bookSearchService } from '../../services/bookSearchService.ts';
import { SearchResponseDTO } from '../../types/bookSearch.ts';
import { logBookEngineV2 } from '../logging/bookEngineV2Log.ts';

type UseBookSearchOptions = {
  ebookOnly?: boolean;
  availabilityOnly?: boolean;
  lang?: string;
  limit?: number;
};

export const buildBookSearchQueryKey = (
  query: string,
  options: UseBookSearchOptions = {}
) => [
  'bookSearchV2',
  query.trim(),
  Boolean(options.ebookOnly),
  Boolean(options.availabilityOnly),
  options.lang || '',
  typeof options.limit === 'number' ? options.limit : 15,
] as const;

export const useBookSearch = (
  query: string,
  options: UseBookSearchOptions = {}
) => {
  const [debouncedQuery] = useDebounce(query, 450);
  const normalizedQuery = query.trim();
  const debouncedNormalizedQuery = debouncedQuery.trim();

  return useQuery<SearchResponseDTO>({
    queryKey: buildBookSearchQueryKey(normalizedQuery, options),
    queryFn: async () => {
        logBookEngineV2('BOOK_SEARCH_V2_CLIENT_QUERY', {
          query: normalizedQuery.slice(0, 80),
          enabled: normalizedQuery.length >= 2,
          ebookOnly: Boolean(options.ebookOnly),
          availabilityOnly: Boolean(options.availabilityOnly),
          lang: options.lang || 'auto',
          limit:
            typeof options.limit === 'number'
              ? Math.max(1, Math.min(30, Math.trunc(options.limit)))
              : 15,
        });

        assertValidSearchModes({
          ebookOnly: options.ebookOnly,
          availabilityOnly: options.availabilityOnly,
        });

        const response = await bookSearchService.searchBooks({
          query: normalizedQuery,
          ebookOnly: options.ebookOnly,
          availabilityOnly: options.availabilityOnly,
          lang: options.lang,
          limit: options.limit,
        });

        return response;
      },
    enabled: normalizedQuery.length >= 2 && normalizedQuery === debouncedNormalizedQuery,
    staleTime: 20_000,
    retry: false,
  });
};
