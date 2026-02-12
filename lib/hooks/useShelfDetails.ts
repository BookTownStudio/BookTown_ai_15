import { useQuery } from '@tanstack/react-query';
import { dataService } from '../../services/dataService.ts';
import { Shelf } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useShelfDetails = (shelfId?: string, ownerId?: string) => {
    const { effectiveUid } = useAuth();
    const finalUid = ownerId || effectiveUid;

    return useQuery<Shelf>({
        queryKey: queryKeys.user.shelfDetails(finalUid ?? undefined, shelfId) as unknown as any[],
        queryFn: async () => {
            // Invariant: if this runs, uid and shelfId must exist
            return await dataService.shelves.getShelf(finalUid!, shelfId!);
        },
        enabled: !!finalUid && !!shelfId,

        // ✅ Performance tuning (aligned with shelves + entries)
        staleTime: 1000 * 60 * 2,        // 2 minutes fresh
        gcTime: 1000 * 60 * 30,          // keep in cache 30 min
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        keepPreviousData: true,
    });
};