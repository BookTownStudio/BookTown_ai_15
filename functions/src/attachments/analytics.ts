import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

type AttachmentAnalyticsEvent =
  | "attachment_created"
  | "attachment_uploaded"
  | "attachment_rendered"
  | "attachment_opened"
  | "attachment_downloaded"
  | "attachment_deleted"
  | "attachment_failed";

type RenderSurface = "home" | "feed" | "drawer" | "read" | "write";

type AttachmentAnalyticsPayload = {
  events: Array<{
    event: AttachmentAnalyticsEvent;
    attachmentId: string;
    attachmentType: string;
    surface: RenderSurface;
    ownerUid?: string;
    fileSizeBytes?: number;
    renderMode?: string;
  }>;
};

const MAX_EVENTS_PER_CALL = 100;

export const logAttachmentEvents = onCall(
  { cors: true, timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const payload = request.data as AttachmentAnalyticsPayload;
    const events = Array.isArray(payload?.events)
      ? payload.events.slice(0, MAX_EVENTS_PER_CALL)
      : [];

    if (events.length > 0) {
      logger.info("[ATTACHMENTS][ANALYTICS][BATCH]", {
        eventCount: events.length,
        sampledEvents: events.slice(0, 5).map((event) => ({
          event: event.event,
          attachmentId: event.attachmentId,
          attachmentType: event.attachmentType,
          surface: event.surface,
          ownerUid: event.ownerUid ?? null,
          fileSizeBytes: event.fileSizeBytes ?? null,
          renderMode: event.renderMode ?? null,
        })),
      });
    }

    return {
      success: true,
    };
  }
);
