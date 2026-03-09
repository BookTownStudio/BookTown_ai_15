
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Author } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useSearchUserAuthors = (query: string) => {
    const normalizedQuery = query.trim();

    return useQuery<Author[]>({
        queryKey: queryKeys.catalog.authors({
            query: normalizedQuery || null,
            limit: 12,
        }),
        queryFn: () => normalizedQuery
            ? dataService.catalog.discoverAuthors({ query: normalizedQuery, limit: 12 })
            : Promise.resolve([]),
        enabled: true,
    });
};
