import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf } from '../../types/entities.ts';

interface UpdateShelfVariables {
    shelfId: string;
    updates: {
        titleEn: string;
        titleAr: string;
        userCoverUrl?: string;
    };
}

export const useUpdateShelf = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: ({ shelfId, updates }: UpdateShelfVariables) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.shelves.updateShelf(uid, shelfId, updates);
        },
        onMutate: async ({ shelfId, updates }) => {
            if (!uid) return;
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries(queryKeys.user.shelves(uid) as unknown as any[]);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousShelves = queryClient.getQueryData(queryKeys.user.shelves(uid) as unknown as any[]);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.shelves(uid) as unknown as any[], (old: Shelf[] = []) => {
                return old.map(shelf => 
                    shelf.id === shelfId ? { ...shelf, ...updates } : shelf
                );
            });

            return { previousShelves };
        },
        onError: (err, vars, context: any) => {
            if (uid && context?.previousShelves) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.shelves(uid) as unknown as any[], context.previousShelves);
            }
        },
        onSettled: (data, error, { shelfId }) => {
            if (uid) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.shelves(uid) as unknown as any[]);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.shelfDetails(uid, shelfId) as unknown as any[]);
            }
        },
    });
};