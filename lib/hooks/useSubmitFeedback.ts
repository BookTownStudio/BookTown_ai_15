import { useMutation } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import type { SubmitFeedbackRequest } from '../../contracts/apiContracts.ts';

export const useSubmitFeedback = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (variables: SubmitFeedbackRequest) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.submitFeedback(uid, variables);
        },
    });
};
