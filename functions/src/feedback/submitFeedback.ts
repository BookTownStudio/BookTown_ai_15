import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { assertAuthenticated, canonicalizeRoleClaim } from "../shared/auth";
import { generateCorrelationId, getHeaderValue } from "../contracts/correlation";
import type { SubmitFeedbackRequest, SubmitFeedbackResponse } from "../contracts/shared/apiContracts";

const FEEDBACK_COLLECTION = "feedback_reports";
const MAX_PER_24_HOURS = 10;
const MAX_PER_5_MINUTES = 3;
const SCHEMA_VERSION = 1;
const CALLABLE_REGION = "default";

const db = admin.firestore();

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveCorrelationId(headers: Record<string, unknown> | undefined): string {
  return getHeaderValue(headers, "x-correlation-id") ?? generateCorrelationId();
}

export const submitFeedback = onCall({ cors: true }, async (request): Promise<SubmitFeedbackResponse> => {
  const caller = assertAuthenticated(request.auth);
  const uid = caller.uid;
  const payload = request.data as SubmitFeedbackRequest;
  const now = admin.firestore.Timestamp.now();
  const receivedAt = now.toDate().toISOString();
  const dayAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);
  const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
  const correlationId = resolveCorrelationId(
    request.rawRequest?.headers as Record<string, unknown> | undefined
  );
  const role = canonicalizeRoleClaim(caller.token.role);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const collectionRef = db.collection(FEEDBACK_COLLECTION);
      const dayQuery = collectionRef.where("uid", "==", uid).where("createdAt", ">", dayAgo);
      const burstQuery = collectionRef.where("uid", "==", uid).where("createdAt", ">", fiveMinutesAgo);
      const [daySnap, burstSnap] = await Promise.all([
        transaction.get(dayQuery),
        transaction.get(burstQuery),
      ]);

      if (daySnap.size >= MAX_PER_24_HOURS) {
        logger.warn("[FEEDBACK][QUOTA_EXCEEDED]", {
          uid,
          correlationId,
          window: "24h",
          count: daySnap.size,
          limit: MAX_PER_24_HOURS,
        });
        throw new HttpsError("resource-exhausted", "FEEDBACK_DAILY_QUOTA_EXCEEDED");
      }

      if (burstSnap.size >= MAX_PER_5_MINUTES) {
        logger.warn("[FEEDBACK][QUOTA_EXCEEDED]", {
          uid,
          correlationId,
          window: "5m",
          count: burstSnap.size,
          limit: MAX_PER_5_MINUTES,
        });
        throw new HttpsError("resource-exhausted", "FEEDBACK_BURST_QUOTA_EXCEEDED");
      }

      const feedbackRef = collectionRef.doc();
      const report = {
        id: feedbackRef.id,
        uid,
        source: payload.source,
        intentType: payload.intentType,
        status: "new" as const,
        text: payload.text.trim(),
        contactEmail: normalizeOptionalEmail(payload.contactEmail),
        clientContext: payload.clientContext ?? null,
        serverContext: {
          authRole: role,
          callableRegion: CALLABLE_REGION,
          correlationId,
          schemaVersion: SCHEMA_VERSION,
        },
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(feedbackRef, report);
      return {
        feedbackId: feedbackRef.id,
        status: report.status,
        receivedAt,
        correlationId,
      };
    });

    logger.info("[FEEDBACK][SUBMITTED]", {
      uid,
      feedbackId: result.feedbackId,
      source: payload.source,
      intentType: payload.intentType,
      correlationId,
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("[FEEDBACK][SUBMISSION_FAILED]", {
      uid,
      correlationId,
      source: payload.source,
      intentType: payload.intentType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("internal", "FEEDBACK_SUBMISSION_FAILED");
  }
});
