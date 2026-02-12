import { useMutation } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ReportPostVariables {
    postId: string;
    reason: string;
    details?: string;
}

/**
 * useReportPost
 * Implementation of POST_REPORTING_V1.
 * Authoritative mutation for reporting content.
 */
export const useReportPost = () => {
    return useMutation({
        mutationFn: async (variables: ReportPostVariables) => {
            const functions = getFunctions();
            const reportPostFn = httpsCallable(functions, 'reportSocialPost');
            const result = await reportPostFn(variables);
            return result.data;
        }
    });
};