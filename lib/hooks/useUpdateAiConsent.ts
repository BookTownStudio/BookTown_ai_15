
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useUpdateAiConsent = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (consent: boolean) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.updateProfile(uid, { aiConsent: consent });
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['userProfile', uid]);
        },
    });
};
