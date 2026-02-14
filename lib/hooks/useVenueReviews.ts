
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { VenueReview } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useVenueReviews = (venueId: string | undefined) => {
    return useQuery<VenueReview[]>({
        queryKey: queryKeys.venues.reviews(venueId) as unknown as any[],
        queryFn: () => dataService.venues.getVenueReviews(venueId!),
        enabled: !!venueId,
    });
};
