
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Venue, Event } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

type CreateVenueVariables = Omit<Venue, 'id' | 'ownerId'> | Omit<Event, 'id' | 'ownerId'>;

export const useCreateVenue = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (data: CreateVenueVariables) => {
            if (!uid) throw new Error("User not authenticated");
            return dataService.venues.createVenue(uid, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(queryKeys.venues.all as unknown as any[]);
        },
    });
};
