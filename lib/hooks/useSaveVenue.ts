import { useMutation } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useSaveVenue = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useMutation({
        mutationFn: (venueId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.venues.saveVenue(uid, venueId);
        },
    });
};