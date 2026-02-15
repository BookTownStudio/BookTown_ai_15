
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

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
            if (!uid) return;
            queryClient.invalidateQueries(queryKeys.user.profile(uid) as unknown as any[]);
        },
    });
};
