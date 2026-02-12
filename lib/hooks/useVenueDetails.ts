
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Venue, Event } from '../../types/entities.ts';

export const useVenueDetails = (venueId: string | undefined) => {
    return useQuery<Venue | Event>({
        queryKey: ['venue', venueId],
        queryFn: () => dataService.venues.getVenue(venueId!),
        enabled: !!venueId,
    });
};
