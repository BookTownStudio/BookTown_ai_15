import { devLog } from '../logging/devLog';

import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useGoodreadsImport = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    // FIX: Added generics to useMutation to specify the return type and variables type, resolving 'unknown' property access errors in components.
    return useMutation<{ booksImported: number; shelvesCreated: number; reviewsImported: number }, File>({
        mutationFn: (file: File) => {
            if (!uid) throw new Error("User not authenticated");
            return dataService.users.importGoodreadsData(uid, file);
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['userShelves', uid]);
            devLog("[GoodreadsImport] Import successful, queries invalidated.");
        }
    });
};
