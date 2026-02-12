
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

type ReviewVariables = {
    venueId: string;
    rating: number;
    text: string;
};

export const useSubmitVenueReview = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: ({ venueId, rating, text }: ReviewVariables) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.venues.submitVenueReview(uid, venueId, rating, text);
        },
        onSuccess: (data, variables) => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['venueReviews', variables.venueId]);
            queryClient.invalidateQueries(['venue', variables.venueId]);
        },
    });
};
