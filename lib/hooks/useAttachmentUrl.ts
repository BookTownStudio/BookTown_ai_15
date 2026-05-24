// lib/hooks/useAttachmentUrl.ts

import { useQuery } from '../react-query.ts';
import { callCallableEndpoint } from '../callable.ts';
import type { RenderSurface } from '../../components/content/AttachmentRendererV1.tsx';

export type AttachmentDeliveryIntent =
    | 'timeline'
    | 'preview'
    | 'overlay_default'
    | 'high_detail'
    | 'full'
    | 'fallback';

export const fetchAttachmentUrl = (
    attachmentId: string,
    deliveryIntent: AttachmentDeliveryIntent,
    surface: 'read' | 'download' = 'read'
) => {
    return callCallableEndpoint<
        {
            attachmentId: string;
            surface: 'read' | 'download';
            deliveryIntent: AttachmentDeliveryIntent;
        },
        { url: string }
    >('getAttachmentUrl', {
        attachmentId,
        surface,
        deliveryIntent
    });
};

/**
 * useAttachmentUrl
 * Authoritative hook for ATTACHMENT_SECURITY_V1.
 * Fetches a short-lived signed URL for a private attachment.
 *
 * PERFORMANCE V1: cached for 5 minutes with a single retry.
 */
export const useAttachmentUrl = (
    attachmentId: string | undefined,
    surface: RenderSurface,
    deliveryIntent: AttachmentDeliveryIntent = 'full'
) => {
    return useQuery<{ url: string } | null>({
        queryKey: ['attachmentUrl', attachmentId, surface, deliveryIntent],
        queryFn: async () => {
            if (!attachmentId) return null;
            return fetchAttachmentUrl(attachmentId, deliveryIntent);
        },
        enabled: !!attachmentId,
        staleTime: 1000 * 60 * 5,
        retry: 1
    });
};
