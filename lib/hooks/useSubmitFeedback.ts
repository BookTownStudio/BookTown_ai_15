import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { FeedbackType } from '../../types/entities.ts';

interface SubmitFeedbackVariables {
    type: FeedbackType;
    text: string;
    email?: string;
    attachments: string[];
}

export const useSubmitFeedback = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (variables: SubmitFeedbackVariables) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.users.submitFeedback(uid, variables);
        },
    });
};