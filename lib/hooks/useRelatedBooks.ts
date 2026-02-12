import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';

export const useRelatedBooks = (currentBook: Book | undefined) => {
    return useQuery<Book[]>({
        queryKey: ['relatedBooks', currentBook?.id],
        queryFn: async () => {
            // OPTIONAL_CAPABILITY_GUARD: Ensure method exists to prevent crash on incomplete catalog implementations
            if (typeof dataService.catalog.getRelatedBooks !== 'function') {
                return [];
            }
            return dataService.catalog.getRelatedBooks(currentBook!.id);
        },
        enabled: !!currentBook,
        retry: false, // Prevent infinite retry loops for unimplemented capabilities
    });
};