import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Event } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useSpaceEvents = (venueId: string | undefined) => {
    return useQuery<Event[]>({
        queryKey: queryKeys.venues.events(venueId) as unknown as any[],
        queryFn: () => dataService.venues.getSpaceEvents(venueId!),
        enabled: !!venueId,
    });
};
