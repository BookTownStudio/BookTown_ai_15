/**
 * ATTACHMENT_ANALYTICS_V1
 * Authority: passive_observability_client
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from '../firebase.ts';
import { AttachmentV1, PostAttachment } from '../../types/entities.ts';
import { RenderSurface } from '../../components/content/AttachmentRendererV1.tsx';

// ATTACHMENT_ANALYTICS_V1: Collection Policy
const SAMPLING_RATE = 0.15; // 15% sampling for rendering events
const BATCH_THRESHOLD = 10;
const FLUSH_INTERVAL_MS = 10000;

// FIX: Added 'attachment_downloaded' to AnalyticsEventV1 union type to resolve type mismatch in ViewerOverlay.
type AnalyticsEventV1 =
  | 'attachment_created'
  | 'attachment_uploaded'
  | 'attachment_rendered'
  | 'attachment_opened'
  | 'attachment_downloaded'
  | 'attachment_deleted'
  | 'attachment_failed';

interface EventPayload {
    event: AnalyticsEventV1;
    attachmentId: string;
    attachmentType: string;
    surface: RenderSurface;
    ownerUid?: string;
    fileSizeBytes?: number;
    renderMode?: string;
}

let eventQueue: EventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const readNonEmptyString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

const readFiniteNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const flush = async () => {
    if (eventQueue.length === 0) return;

    const eventsToFlush = [...eventQueue];
    eventQueue = [];
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;

    try {
        const functions = getFirebaseFunctions();
        if (!functions) return;

        const logFn = httpsCallable(functions, 'logAttachmentEvents');
        await logFn({ events: eventsToFlush });
    } catch (e) {
        // Passive failure: Analytics should never interrupt UI
        console.debug("[ANALYTICS] Flush failed (silent)", e);
    }
};

export const AttachmentAnalytics = {
    /**
     * Track an attachment signal.
     * Implements sampling and batching as per spec.
     */
    track: (
        event: AnalyticsEventV1,
        attachment: PostAttachment,
        surface: RenderSurface,
        options: { renderMode?: string } = {}
    ) => {
        // 1. Sampling Gate (High-frequency events only)
        if (event === 'attachment_rendered' && Math.random() > SAMPLING_RATE) {
            return;
        }

        // 2. Data Resolution
        const isV1 = 'attachmentId' in attachment;
        const v1 = isV1 ? (attachment as AttachmentV1) : null;
        const metadata =
            isV1 && v1?.metadata && typeof v1.metadata === 'object'
                ? (v1.metadata as Record<string, unknown>)
                : {};
        const uploaderRaw = metadata.uploader;
        const uploader =
            uploaderRaw && typeof uploaderRaw === 'object'
                ? (uploaderRaw as Record<string, unknown>)
                : {};

        const payload: EventPayload = {
            event,
            attachmentId:
                isV1 && typeof v1?.attachmentId === 'string' && v1.attachmentId.trim().length > 0
                    ? v1.attachmentId
                    : 'legacy',
            attachmentType: isV1
                ? (typeof v1?.type === 'string' && v1.type.trim().length > 0 ? v1.type : 'UNKNOWN')
                : (attachment as any).type?.toUpperCase() || 'UNKNOWN',
            surface,
            ownerUid: isV1 ? (readNonEmptyString(uploader.uid) || undefined) : undefined,
            fileSizeBytes: isV1 ? (readFiniteNumber(metadata.size) ?? 0) : 0,
            renderMode: options.renderMode
        };

        // 3. Batching
        eventQueue.push(payload);

        if (eventQueue.length >= BATCH_THRESHOLD) {
            flush();
        } else if (!flushTimer) {
            flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
        }
    },

    /**
     * Force immediate flush (used on critical flows like successful upload)
     */
    forceFlush: () => flush()
};
