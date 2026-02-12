
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';

export const useBooksByAuthor = (authorId: string | undefined) => {
    return useQuery<Book[]>({
        queryKey: ['booksByAuthor', authorId],
        queryFn: () => dataService.catalog.getBooksByAuthor(authorId!),
        enabled: !!authorId,
    });
};
