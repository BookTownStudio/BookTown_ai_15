import { useQuery } from '@tanstack/react-query';
import { dataService } from '../../services/dataService.ts';
import { Shelf } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

export const useShelfDetails = (shelfId?: string, ownerId?: string) => {
    const { effectiveUid } = useAuth();
    const finalUid = ownerId || effectiveUid;
    const requestUid = finalUid || 'public';

    return useQuery<Shelf>({
        queryKey: queryKeys.user.shelfDetails(finalUid ?? undefined, shelfId) as unknown as any[],
        queryFn: async () => {
            // External shelf deep-links can resolve without an authenticated session.
            return await dataService.shelves.getShelf(requestUid, shelfId!);
        },
        enabled: !!shelfId,

        // ✅ Performance tuning (aligned with shelves + entries)
        staleTime: 1000 * 60 * 2,        // 2 minutes fresh
        gcTime: 1000 * 60 * 30,          // keep in cache 30 min
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        keepPreviousData: true,
    });
};
