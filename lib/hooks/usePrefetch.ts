
import { useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { queryKeys } from '../queryKeys.ts';

export const usePrefetch = () => {
    const queryClient = useQueryClient();

    const prefetchBook = async (bookId: string) => {
        // We use setQueryData in our mock client to simulate prefetching
        // In a real react-query setup, this would be queryClient.prefetchQuery
        try {
            const book = await dataService.catalog.getBook(bookId);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.catalog.book(bookId) as unknown as any[], book);
        } catch (e) {
            // silent fail
        }
    };

    const prefetchProfile = async (userId: string) => {
        try {
            const profile = await dataService.users.getProfile(userId);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.profile(userId) as unknown as any[], profile);
        } catch (e) {}
    };
    
    const prefetchShelf = async (ownerId: string, shelfId: string) => {
        try {
            const entries = await dataService.shelves.getShelfEntries(ownerId, shelfId);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.shelfEntries(ownerId, shelfId) as unknown as any[], entries);
        } catch (e) {}
    };

    return { prefetchBook, prefetchProfile, prefetchShelf };
};