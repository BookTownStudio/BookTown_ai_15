
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Venue, Event } from '../../types/entities.ts';

export const useVenuesAndEvents = (query: string) => {
    return useQuery<(Venue | Event)[]>({
        queryKey: ['venuesAndEvents', query],
        queryFn: () => dataService.venues.searchVenues(query),
    });
};
