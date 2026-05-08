import { devLog } from '../logging/devLog';
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf } from '../../types/entities.ts';
import type { ShelfCreateDTO } from '../../services/db.types.ts';

type CreateShelfVariables = Pick<ShelfCreateDTO, 'titleEn' | 'titleAr'>;

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
                    { titleEn, titleAr }
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
            const shelvesKey = [
                ...queryKeys.user.shelves(uid),
                { ownerId: uid }
            ] as unknown as any[];

            await queryClient.cancelQueries({ queryKey: shelvesKey });

            const previousShelves = queryClient.getQueryData(shelvesKey);

            queryClient.setQueryData(
                shelvesKey,
                (old: Shelf[] = []) => {
                    const optimisticShelf: Shelf = {
                        id: `temp-${Date.now()}`,
                        ownerId: uid,
                        titleEn,
                        titleAr,
                        bookIds: [],
                    };
                    return [...old, optimisticShelf];
                }
            );

            return { previousShelves };
        },

        onError: (err, _newShelf, context: any) => {
            console.error("[CREATE_SHELF] mutation error", err);

            if (uid && context?.previousShelves) {
                const shelvesKey = [
                    ...queryKeys.user.shelves(uid),
                    { ownerId: uid }
                ] as unknown as any[];
                queryClient.setQueryData(
                    shelvesKey,
                    context.previousShelves
                );
            }
        },

        onSettled: () => {
            if (uid) {
                devLog("[CREATE_SHELF] mutation settled → invalidating shelves");
                queryClient.invalidateQueries({ queryKey: queryKeys.user.shelves(uid) as unknown as any[] });
            }
        },
    });
};
