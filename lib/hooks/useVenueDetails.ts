
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Venue, Event } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useVenueDetails = (venueId: string | undefined) => {
    return useQuery<Venue | Event>({
        queryKey: queryKeys.venues.detail(venueId) as unknown as any[],
        queryFn: () => dataService.venues.getVenue(venueId!),
        enabled: !!venueId,
    });
};
