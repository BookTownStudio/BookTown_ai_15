import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf } from '../../types/entities.ts';

export const useDeleteShelf = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (shelfId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.shelves.deleteShelf(uid, shelfId);
        },
        onMutate: async (shelfId) => {
            if (!uid) return;
            const shelvesKey = [
                ...queryKeys.user.shelves(uid),
                { ownerId: uid }
            ] as unknown as any[];
            await queryClient.cancelQueries({ queryKey: queryKeys.user.shelves(uid) as unknown as any[] });

            const previousShelves = queryClient.getQueryData(shelvesKey);

            queryClient.setQueryData(shelvesKey, (old: Shelf[] = []) => {
                return old.filter(shelf => shelf.id !== shelfId);
            });

            return { previousShelves };
        },
        onError: (err, shelfId, context: any) => {
            if (uid && context?.previousShelves) {
                const shelvesKey = [
                    ...queryKeys.user.shelves(uid),
                    { ownerId: uid }
                ] as unknown as any[];
                queryClient.setQueryData(shelvesKey, context.previousShelves);
            }
        },
        onSettled: () => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            if (uid) queryClient.invalidateQueries({ queryKey: queryKeys.user.shelves(uid) as unknown as any[] });
        },
    });
};
