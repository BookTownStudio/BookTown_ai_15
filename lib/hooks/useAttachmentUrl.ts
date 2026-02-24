// lib/hooks/useAttachmentUrl.ts

import { useQuery } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RenderSurface } from '../../components/content/AttachmentRendererV1.tsx';

type AttachmentUrlPayload = { url: string };
type AttachmentUrlEnvelope =
    | AttachmentUrlPayload
    | {
          success: boolean;
          data?: AttachmentUrlPayload;
          error?: { message?: string };
      };

const unwrapAttachmentUrl = (raw: unknown): AttachmentUrlPayload => {
    if (raw && typeof raw === 'object' && 'success' in (raw as Record<string, unknown>)) {
        const envelope = raw as {
            success: boolean;
            data?: AttachmentUrlPayload;
            error?: { message?: string };
        };
        if (!envelope.success || !envelope.data?.url) {
            throw new Error(envelope.error?.message || 'Attachment URL request failed.');
        }
        return { url: envelope.data.url };
    }

    const payload = raw as AttachmentUrlPayload;
    if (!payload?.url || typeof payload.url !== 'string') {
        throw new Error('Attachment URL response missing url.');
    }
    return { url: payload.url };
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
    surface: RenderSurface
) => {
    return useQuery<{ url: string } | null>({
        queryKey: ['attachmentUrl', attachmentId, surface],
        queryFn: async () => {
            if (!attachmentId) return null;
            const functions = getFunctions();
            const getUrlFn = httpsCallable(functions, 'getAttachmentUrl');
            const result = await getUrlFn({
                attachmentId,
                surface: 'read'
            });
            return unwrapAttachmentUrl(result.data as AttachmentUrlEnvelope);
        },
        enabled: !!attachmentId,
        staleTime: 1000 * 60 * 5,
        retry: 1
    });
};
