import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { assertAuthenticated, canonicalizeRoleClaim } from "../shared/auth";
import { generateCorrelationId, getHeaderValue } from "../contracts/correlation";
import type { SubmitFeedbackRequest, SubmitFeedbackResponse } from "../contracts/shared/apiContracts";

const FEEDBACK_COLLECTION = "feedback_reports";
const MAX_PER_SOFT_COOLDOWN_WINDOW = 1;
const SOFT_COOLDOWN_SECONDS = 60;
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
  const cooldownWindowStart = admin.firestore.Timestamp.fromMillis(now.toMillis() - SOFT_COOLDOWN_SECONDS * 1000);
  const correlationId = resolveCorrelationId(
    request.rawRequest?.headers as Record<string, unknown> | undefined
  );
  const role = canonicalizeRoleClaim(caller.token.role);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const collectionRef = db.collection(FEEDBACK_COLLECTION);
      const cooldownQuery = collectionRef.where("uid", "==", uid).where("createdAt", ">", cooldownWindowStart);
      const cooldownSnap = await transaction.get(cooldownQuery);

      if (cooldownSnap.size >= MAX_PER_SOFT_COOLDOWN_WINDOW) {
        logger.warn("[FEEDBACK][QUOTA_EXCEEDED]", {
          uid,
          correlationId,
          window: `${SOFT_COOLDOWN_SECONDS}s`,
          count: cooldownSnap.size,
          limit: MAX_PER_SOFT_COOLDOWN_WINDOW,
          policy: "soft_cooldown",
        });
        throw new HttpsError("resource-exhausted", "FEEDBACK_SOFT_COOLDOWN_ACTIVE");
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
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    throw new HttpsError("internal", "FEEDBACK_SUBMISSION_FAILED");
  }
});
