
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';

export const useDiscoveryFeeds = () => {
    return useQuery<Book[]>({
        queryKey: ['discoveryFeeds', 'trending'],
        queryFn: () => dataService.catalog.getTrendingBooks(),
    });
};
