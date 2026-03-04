import { devLog } from '../logging/devLog';
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf } from '../../types/entities.ts';

interface CreateShelfVariables {
    titleEn: string;
    titleAr: string;
}

export const useCreateShelf = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ titleEn, titleAr }: CreateShelfVariables) => {
            if (!uid) throw new Error("Not authenticated");

            devLog("[CREATE_SHELF] mutation start", { uid, titleEn, titleAr });
            devLog("[CREATE_SHELF] about to write");

            try {
                const result = await dataService.shelves.createShelf(
                    uid,
                    { titleEn, titleAr, entries: {} }
                );

                devLog("[CREATE_SHELF] write success", result);
                return result;
            } catch (e) {
                console.error("[CREATE_SHELF] write failed", e);
                throw e;
            }
        },

        onMutate: async ({ titleEn, titleAr }) => {
            if (!uid) return;

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries(queryKeys.user.shelves(uid) as unknown as any[]);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousShelves =
                queryClient.getQueryData(queryKeys.user.shelves(uid) as unknown as any[]);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(
                queryKeys.user.shelves(uid) as unknown as any[],
                (old: Shelf[] = []) => {
                    const optimisticShelf: Shelf = {
                        id: `temp-${Date.now()}`,
                        ownerId: uid,
                        titleEn,
                        titleAr,
                        entries: {},
                    };
                    return [...old, optimisticShelf];
                }
            );

            return { previousShelves };
        },

        onError: (err, _newShelf, context: any) => {
            console.error("[CREATE_SHELF] mutation error", err);

            if (uid && context?.previousShelves) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(
                    queryKeys.user.shelves(uid) as unknown as any[],
                    context.previousShelves
                );
            }
        },

        onSettled: () => {
            if (uid) {
                devLog("[CREATE_SHELF] mutation settled → invalidating shelves");
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.shelves(uid) as unknown as any[]);
            }
        },
    });
};