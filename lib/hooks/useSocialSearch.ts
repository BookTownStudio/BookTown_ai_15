
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Post, User } from '../../types/entities.ts';

type SearchResult = {
    posts: Post[];
    users: User[];
    topics: string[];
}

export const useSocialSearch = (query: string) => {
    return useQuery<SearchResult>({
        queryKey: ['socialSearch', query],
        queryFn: () => dataService.social.search(query),
        enabled: !!query,
    });
};
