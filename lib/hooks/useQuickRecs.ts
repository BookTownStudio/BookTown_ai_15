
import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';

export const useQuickRecs = () => {
    const { user, isGuest } = useAuth();
    const uid = user?.uid || 'guest';

    const { data: bookIds, isLoading, isError } = useQuery<string[]>({
        queryKey: ['quickRecs', uid],
        queryFn: () => dataService.catalog.getRecommendations(uid),
        enabled: !!user || isGuest, 
    });

    return {
        bookIds: Array.isArray(bookIds) ? bookIds : [],
        isLoading,
        isError,
    };
};
