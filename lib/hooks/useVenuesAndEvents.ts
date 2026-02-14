
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Venue, Event } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useVenuesAndEvents = (query: string) => {
    return useQuery<(Venue | Event)[]>({
        queryKey: queryKeys.venues.search(query) as unknown as any[],
        queryFn: () => dataService.venues.searchVenues(query),
    });
};
