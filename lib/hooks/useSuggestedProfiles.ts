import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { User } from '../../types/entities.ts';

export const useSuggestedProfiles = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<User[]>({
        queryKey: ['suggestedProfiles', uid],
        queryFn: () => dataService.users.getSuggestedProfiles(uid!),
        enabled: !!uid,
    });
};