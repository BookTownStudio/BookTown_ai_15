
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { VenueReview } from '../../types/entities.ts';

export const useVenueReviews = (venueId: string | undefined) => {
    return useQuery<VenueReview[]>({
        queryKey: ['venueReviews', venueId],
        queryFn: () => dataService.venues.getVenueReviews(venueId!),
        enabled: !!venueId,
    });
};
