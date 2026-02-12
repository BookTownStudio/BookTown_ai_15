import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Quote } from '../../types/entities.ts';

export const useQuotes = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<Quote[]>({
        queryKey: ['userQuotes', uid],
        queryFn: () => dataService.users.getUserQuotes(uid!),
        enabled: !!uid,
    });
};