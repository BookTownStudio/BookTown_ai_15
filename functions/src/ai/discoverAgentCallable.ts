import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { VertexAI } from "@google-cloud/vertexai";
import { z } from "zod";
import { admin } from "../firebaseAdmin";
import { getOrCreateAgentContextSnapshot } from "../intelligence/agentContextBuilder";

const DISCOVER_AGENT_MODEL = "gemini-2.5-flash";
const DISCOVER_AGENT_REGION = "us-central1";
const DISCOVER_AGENT_IDS = ["mentor", "quotes", "lore"] as const;

const discoverAgentRequestSchema = z
  .object({
    agentId: z.enum(DISCOVER_AGENT_IDS),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "model"]),
            content: z.string().min(1).max(2000),
          })
          .strict()
      )
      .min(1)
      .max(20),
    systemInstruction: z.string().min(1).max(5000),
  })
  .strict();

const discoverAgentResponseSchema = z
  .object({
    text: z.string().min(1).max(12000),
  })
  .strict();

type VertexContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

let vertexAiSingleton: VertexAI | null = null;

function getProjectId(): string {
  return (
    String(process.env.GCP_PROJECT || "").trim() ||
    String(process.env.GCLOUD_PROJECT || "").trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT || "").trim() ||
    "booktown-ai"
  );
}

function getVertexAi(): VertexAI {
  if (vertexAiSingleton) {
    return vertexAiSingleton;
  }

  vertexAiSingleton = new VertexAI({
    project: getProjectId(),
    location: DISCOVER_AGENT_REGION,
  });

  return vertexAiSingleton;
}

function extractVertexResponseText(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const directText = (payload as { text?: unknown }).text;
    if (typeof directText === "string" && directText.trim().length > 0) {
      return directText.trim();
    }
  }

  const response =
    payload && typeof payload === "object"
      ? ((payload as { response?: unknown }).response ?? null)
      : null;
  if (!response || typeof response !== "object") {
    return "";
  }

  const candidates = Array.isArray(
    (response as { candidates?: unknown[] }).candidates
  )
    ? ((response as { candidates: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates)
    : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        return part.text.trim();
      }
    }
  }

  return "";
}

async function ensureAiConsent(uid: string): Promise<boolean> {
  const userSnap = await admin.firestore().collection("users").doc(uid).get();
  if (!userSnap.exists) return false;
  return userSnap.get("aiConsent") === true;
}

function toVertexContents(messages: Array<{ role: "user" | "model"; content: string }>): VertexContent[] {
  return messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));
}

export const aiDiscoverAgentCallable = onCall(
  {
    cors: true,
    region: DISCOVER_AGENT_REGION,
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

    const parsed = discoverAgentRequestSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
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
      logger.error("[AI][DISCOVER_AGENT][CONTEXT_LOAD_FAILED]", {
        uid,
        agentId: parsed.data.agentId,
        error: String(error),
      });
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }

    if (!context) {
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }

    try {
      const model = getVertexAi().getGenerativeModel({
        model: DISCOVER_AGENT_MODEL,
        systemInstruction: parsed.data.systemInstruction,
        generationConfig: {
          maxOutputTokens: 800,
        },
      });

      const result = await model.generateContent({
        contents: toVertexContents(parsed.data.messages),
      });

      const text = extractVertexResponseText(result);
      const validated = discoverAgentResponseSchema.safeParse({ text });
      if (!validated.success) {
        logger.error("[AI][DISCOVER_AGENT][RESPONSE_INVALID]", {
          uid,
          agentId: parsed.data.agentId,
          issues: validated.error.issues.map((issue) => issue.path.join(".")).slice(0, 12),
        });
        throw new HttpsError("internal", "ENGINE_FAILURE");
      }

      logger.info("[AI][DISCOVER_AGENT][SUCCESS]", {
        uid,
        appId: request.app.appId,
        agentId: parsed.data.agentId,
        profileVersion: context.profileVersion,
        schemaVersion: context.schemaVersion,
        messageCount: parsed.data.messages.length,
      });

      return validated.data;
    } catch (error) {
      logger.error("[AI][DISCOVER_AGENT][FAILED]", {
        uid,
        appId: request.app.appId,
        agentId: parsed.data.agentId,
        error: String(error),
      });
      throw new HttpsError("internal", "ENGINE_FAILURE");
    }
  }
);
