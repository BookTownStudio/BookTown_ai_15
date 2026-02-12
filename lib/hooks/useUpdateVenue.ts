
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Venue, Event } from '../../types/entities.ts';

interface UpdateVenueVariables {
    venueId: string;
    data: Venue | Event;
}

export const useUpdateVenue = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: ({ venueId, data }: UpdateVenueVariables) => {
            if (!uid) throw new Error("User not authenticated");
            return dataService.venues.updateVenue(uid, venueId, data);
        },
        onSuccess: (data, variables) => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['venuesAndEvents']);
            queryClient.invalidateQueries(['venue', variables.venueId]);
        },
    });
};
