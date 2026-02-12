
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Author } from '../../types/entities.ts';

export const useAuthorDetails = (authorId: string | undefined) => {
    return useQuery<Author | null>({
        queryKey: ['author', authorId],
        queryFn: () => dataService.catalog.getAuthor(authorId!),
        enabled: !!authorId,
    });
};
