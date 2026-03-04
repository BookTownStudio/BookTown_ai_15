import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { admin } from "../firebaseAdmin";
import { getOrCreateAgentContextSnapshot } from "../intelligence/agentContextBuilder";
import { runLibrarianRecommendation } from "./librarian";

const LIBRARIAN_INTENT_VALUES = [
  "Reinforcement",
  "AdjacentExpansion",
  "StructuredContrast",
  "HighConfidencePrecision",
  "ReReadingReflection",
] as const;

const librarianCallableRequestSchema = z
  .object({
    normalizedQuery: z.string().min(1).max(280),
    intent: z.enum(LIBRARIAN_INTENT_VALUES).optional(),
  })
  .strict();

function normalizeLibrarianQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureAiConsent(uid: string): Promise<boolean> {
  const userSnap = await admin.firestore().collection("users").doc(uid).get();
  if (!userSnap.exists) return false;
  return userSnap.get("aiConsent") === true;
}

export const aiLibrarianCallable = onCall(
  {
    cors: true,
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 20,
    concurrency: 20,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
    }

    if (!request.app) {
      throw new HttpsError("failed-precondition", "APP_CHECK_REQUIRED");
    }

    const parsed = librarianCallableRequestSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "INVALID_REQUEST");
    }

    const normalizedQuery = normalizeLibrarianQuery(parsed.data.normalizedQuery);
    if (!normalizedQuery || normalizedQuery.length > 280) {
      throw new HttpsError("invalid-argument", "INVALID_REQUEST");
    }

    const consentGranted = await ensureAiConsent(uid);
    if (!consentGranted) {
      throw new HttpsError("permission-denied", "CONSENT_REQUIRED");
    }

    let context = null;
    try {
      context = await getOrCreateAgentContextSnapshot(uid);
    } catch (error) {
      logger.error("[AI][LIBRARIAN][CALLABLE_CONTEXT_LOAD_FAILED]", {
        uid,
        error: String(error),
      });
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }

    if (!context) {
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }

    try {
      const result = await runLibrarianRecommendation({
        uid,
        request: {
          normalizedQuery,
          intent: parsed.data.intent ?? "Reinforcement",
        },
        context,
      });

      logger.info("[AI][LIBRARIAN][CALLABLE_SUCCESS]", {
        uid,
        appId: request.app.appId,
        profileVersion: context.profileVersion,
        schemaVersion: context.schemaVersion,
        fromCache: result.fromCache,
        recommendationCount: result.recommendations.length,
        remainingQuota: result.remainingQuota,
        normalizedQuery: result.normalizedQuery,
      });

      return result;
    } catch (error) {
      const message = String(error);
      if (message.includes("QUOTA_EXCEEDED")) {
        throw new HttpsError("resource-exhausted", "QUOTA_EXCEEDED");
      }
      if (message.includes("INVALID_REQUEST")) {
        throw new HttpsError("invalid-argument", "INVALID_REQUEST");
      }
      logger.error("[AI][LIBRARIAN][CALLABLE_FAILED]", {
        uid,
        appId: request.app.appId,
        error: message,
      });
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }
  }
);
