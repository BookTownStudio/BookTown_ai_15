
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Author } from '../../types/entities.ts';

export const useSearchUserAuthors = (query: string) => {
    return useQuery<Author[]>({
        queryKey: ['searchUserAuthors', query],
        queryFn: () => dataService.catalog.searchAuthors(query),
        enabled: true,
    });
};
