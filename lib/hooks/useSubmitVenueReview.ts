
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

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
            queryClient.invalidateQueries(queryKeys.venues.reviews(variables.venueId) as unknown as any[]);
            queryClient.invalidateQueries(queryKeys.venues.detail(variables.venueId) as unknown as any[]);
        },
    });
};
