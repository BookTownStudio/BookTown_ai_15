// lib/hooks/useAttachmentUrl.ts

import { useQuery } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RenderSurface } from '../../components/content/AttachmentRendererV1.tsx';

/**
 * useAttachmentUrl
 * Authoritative hook for ATTACHMENT_SECURITY_V1.
 * Fetches a short-lived signed URL for a private attachment.
 * 
 * PERFORMANCE V1: 8s timeout and single retry policy.
 */
export const useAttachmentUrl = (
    attachmentId: string | undefined,
    surface: RenderSurface
) => {
    return useQuery<{ url: string } | null>({
        queryKey: ['attachmentUrl', attachmentId, surface],
        queryFn: async () => {
            if (!attachmentId) return null;

            const fetchWithTimeout = async (
                retryCount = 0
            ): Promise<{ url: string }> => {
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    8000 // 8s timeout (LOCKED)
                );

                try {
                    const functions = getFunctions();
                    const getUrlFn = httpsCallable(
                        functions,
                        'getAttachmentUrl'
                    );

                    const result = await getUrlFn({
                        attachmentId,
                        surface: 'read'
                    });

                    clearTimeout(timeoutId);
                    return result.data as { url: string };
                } catch (error: any) {
                    clearTimeout(timeoutId);

                    if (
                        (error.name === 'AbortError' ||
                            error.code === 'deadline-exceeded') &&
                        retryCount < 1
                    ) {
                        console.warn(
                            `[PERFORMANCE][RETRY] Attachment ${attachmentId} timed out. Retrying...`
                        );
                        return fetchWithTimeout(retryCount + 1);
                    }

                    throw error;
                }
            };

            return fetchWithTimeout();
        },
        enabled: !!attachmentId,
        staleTime: 1000 * 60 * 5 // 5 minutes (LOCKED)
        // retry is intentionally handled internally
    });
};
