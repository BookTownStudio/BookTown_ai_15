// lib/hooks/useAttachmentUrl.ts

import { useQuery } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';
import { RenderSurface } from '../../components/content/AttachmentRendererV1.tsx';

/**
 * useAttachmentUrl
 * Authoritative hook for ATTACHMENT_SECURITY_V1.
 * Fetches a short-lived signed URL for a private attachment.
 *
 * PERFORMANCE V1: cached for 5 minutes with a single retry.
 */
export const useAttachmentUrl = (
    attachmentId: string | undefined,
    surface: RenderSurface
) => {
    return useQuery<{ url: string } | null>({
        queryKey: ['attachmentUrl', attachmentId, surface],
        queryFn: async () => {
            if (!attachmentId) return null;
            return callCallableEndpoint<
                { attachmentId: string; surface: RenderSurface },
                { url: string }
            >('getAttachmentUrl', {
                attachmentId,
                surface: 'read'
            });
        },
        enabled: !!attachmentId,
        staleTime: 1000 * 60 * 5,
        retry: 1
    });
};
