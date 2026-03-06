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

const librarianMemoryMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(280),
  })
  .strict();

const librarianCallableRequestSchema = z
  .object({
    normalizedQuery: z.string().min(1).max(280),
    intent: z.enum(LIBRARIAN_INTENT_VALUES).optional(),
    messages: z.array(librarianMemoryMessageSchema).max(6).optional(),
  })
  .strict();

const librarianCallableResponseSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            bookId: z.string().min(1),
            title: z.string().min(1),
            author: z.string().min(1),
            short_reason: z.string().min(1),
            source: z.literal("librarian").optional(),
            suggestionSessionId: z.string().min(1).max(96).optional(),
            suggestionId: z.string().min(1).max(96).optional(),
            rankPosition: z.number().int().min(1).max(3).optional(),
            mode: z.enum(LIBRARIAN_INTENT_VALUES).optional(),
          })
          .strict()
      )
      .max(3),
    fromCache: z.boolean(),
    remainingQuota: z.number().int().nonnegative(),
    normalizedQuery: z.string().min(1).max(280),
    intent: z
      .enum([
        "book_recommendation",
        "author_request",
        "theme_request",
        "clarification",
        "out_of_scope",
      ])
      .optional(),
    conversation: z
      .object({
        explanation: z.string().min(1),
        tone: z.enum(["warm", "intellectual", "neutral"]),
        follow_up_question: z.string().min(1).nullable(),
        needs_clarification: z.boolean(),
      })
      .strict()
      .optional(),
    authorRecommendations: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type: z.literal("author"),
            name: z.string().min(1),
            photo_url: z.string(),
            birth_year: z.number().int(),
            death_year: z.number().int().nullable(),
            nationality: z.string(),
            short_bio: z.string(),
            notable_books: z.array(z.string()).max(5),
            why_recommended: z.string().min(1),
            verification: z
              .object({
                source: z.enum(["openlibrary", "wikidata", "internal"]),
              })
              .strict(),
          })
          .strict()
      )
      .max(3)
      .optional(),
    metadata: z
      .object({
        suggestionSessionId: z.string().min(1).max(96),
        verified: z.boolean(),
        source: z.literal("vertex_llm + external_verification"),
        confidence: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
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
          messages: parsed.data.messages,
        },
        context,
      });

      const validatedResult = librarianCallableResponseSchema.safeParse(result);
      if (!validatedResult.success) {
        logger.error("[AI][LIBRARIAN][CALLABLE_RESPONSE_INVALID]", {
          uid,
          issues: validatedResult.error.issues.map((issue) => issue.path.join(".")).slice(0, 12),
        });
        throw new HttpsError("internal", "ENGINE_FAILURE");
      }

      logger.info("[AI][LIBRARIAN][CALLABLE_SUCCESS]", {
        uid,
        appId: request.app.appId,
        profileVersion: context.profileVersion,
        schemaVersion: context.schemaVersion,
        fromCache: validatedResult.data.fromCache,
        recommendationCount: validatedResult.data.recommendations.length,
        remainingQuota: validatedResult.data.remainingQuota,
        normalizedQuery: validatedResult.data.normalizedQuery,
      });

      return validatedResult.data;
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
