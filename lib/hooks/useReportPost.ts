import { useMutation } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';

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
            return callCallableEndpoint<ReportPostVariables, { success: boolean; alreadyReported?: boolean }>(
                'reportSocialPost',
                variables
            );
        }
    });
};
