import * as logger from "firebase-functions/logger";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { getOrCreateAgentContextSnapshot } from "../intelligence/agentContextBuilder";
import { assertActiveAuthenticatedUser } from "../shared/auth";

type AppendMessageMutation = {
  type: "append_message";
  message: {
    role?: unknown;
    text?: unknown;
    timestamp?: unknown;
  };
};

type UpsertSessionMutation = {
  type: "upsert_session";
  session: {
    agentId?: unknown;
    title?: unknown;
    lastMessage?: unknown;
    timestamp?: unknown;
    isPinned?: unknown;
  };
};

type AppendTurnMutation = {
  type: "append_turn";
  session: {
    agentId?: unknown;
    title?: unknown;
    lastMessage?: unknown;
    timestamp?: unknown;
    isPinned?: unknown;
  };
  turn: {
    userMessage?: {
      text?: unknown;
      timestamp?: unknown;
    };
    modelMessage?: {
      text?: unknown;
      timestamp?: unknown;
    };
    contextWindowSize?: unknown;
  };
};

type AgentSessionMutation = AppendMessageMutation | UpsertSessionMutation | AppendTurnMutation;

function readRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }

  const normalized = value.trim().slice(0, maxLength);
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }

  return normalized;
}

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalNonNegativeInteger(
  value: unknown,
  field: string,
  maxValue: number
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > maxValue) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a non-negative integer less than or equal to ${maxValue}.`
    );
  }

  return numeric;
}

export const mutateAgentSession = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const payload =
    request.data && typeof request.data === "object"
      ? (request.data as { sessionId?: unknown; mutation?: AgentSessionMutation })
      : null;

  const sessionId = readRequiredString(payload?.sessionId, "sessionId", 128);
  const mutation = payload?.mutation;

  if (!mutation || typeof mutation !== "object" || typeof mutation.type !== "string") {
    throw new HttpsError("invalid-argument", "mutation is required.");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("users").doc(uid).collection("agent_sessions").doc(sessionId);

  if (mutation.type === "append_message") {
    const role = mutation.message?.role === "model" ? "model" : mutation.message?.role === "user" ? "user" : null;
    const text = readRequiredString(mutation.message?.text, "message.text", 10000);
    const timestamp = readOptionalString(mutation.message?.timestamp, 64) ?? new Date().toISOString();

    if (!role) {
      throw new HttpsError("invalid-argument", "message.role must be user or model.");
    }

    const messageRef = sessionRef.collection("messages").doc();
    await messageRef.set({
      role,
      text,
      timestamp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  }

  if (mutation.type === "append_turn") {
    const agentId = readRequiredString(mutation.session?.agentId, "session.agentId", 64);
    const title = readOptionalString(mutation.session?.title, 180) ?? "Conversation";
    const userText = readRequiredString(
      mutation.turn?.userMessage?.text,
      "turn.userMessage.text",
      10000
    );
    const modelText = readRequiredString(
      mutation.turn?.modelMessage?.text,
      "turn.modelMessage.text",
      10000
    );
    const userTimestamp =
      readOptionalString(mutation.turn?.userMessage?.timestamp, 64) ??
      new Date().toISOString();
    const modelTimestamp =
      readOptionalString(mutation.turn?.modelMessage?.timestamp, 64) ??
      new Date().toISOString();
    const sessionTimestamp =
      readOptionalString(mutation.session?.timestamp, 64) ?? modelTimestamp;
    const lastMessage =
      readOptionalString(mutation.session?.lastMessage, 500) ??
      readOptionalString(modelText, 500) ??
      readOptionalString(userText, 500) ??
      "Conversation";
    const isPinned = mutation.session?.isPinned === true;
    const contextWindowSize = readOptionalNonNegativeInteger(
      mutation.turn?.contextWindowSize,
      "turn.contextWindowSize",
      50
    );

    let contextFields: Record<string, unknown> = {
      contextSource: "intelligence_profile",
      contextStatus: "unavailable",
    };

    try {
      const context = await getOrCreateAgentContextSnapshot(uid);
      if (context) {
        contextFields = {
          contextSource: "intelligence_profile",
          contextStatus: "ready",
          contextSchemaVersion: context.schemaVersion,
          contextProfileVersion: context.profileVersion,
          contextComputedAt: context.computedAt,
        };
      } else {
        logger.warn("[AI][AGENT_SESSION][CONTEXT_UNAVAILABLE]", {
          uid,
          sessionId,
          agentId,
        });
      }
    } catch (error) {
      logger.error("[AI][AGENT_SESSION][CONTEXT_LOAD_FAILED]", {
        uid,
        sessionId,
        agentId,
        error: String(error),
      });
    }

    const existing = await sessionRef.get();
    const batch = db.batch();
    batch.set(
      sessionRef,
      {
        agentId,
        title,
        lastMessage,
        timestamp: sessionTimestamp,
        isPinned,
        sessionContractVersion: 2,
        sessionAuthority: "backend_mutation",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...contextFields,
        ...(typeof contextWindowSize === "number" ? { contextWindowSize } : {}),
        ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    const userMessageRef = sessionRef.collection("messages").doc();
    batch.set(userMessageRef, {
      role: "user",
      text: userText,
      timestamp: userTimestamp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const modelMessageRef = sessionRef.collection("messages").doc();
    batch.set(modelMessageRef, {
      role: "model",
      text: modelText,
      timestamp: modelTimestamp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { ok: true };
  }

  if (mutation.type === "upsert_session") {
    const agentId = readOptionalString(mutation.session?.agentId, 64);
    const title = readOptionalString(mutation.session?.title, 180) ?? "Conversation";
    const lastMessage = readOptionalString(mutation.session?.lastMessage, 500);
    const timestamp = readOptionalString(mutation.session?.timestamp, 64) ?? new Date().toISOString();
    const isPinned = mutation.session?.isPinned === true;

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(sessionRef);
      const base = {
        title,
        timestamp,
        isPinned,
        sessionContractVersion: 2,
        sessionAuthority: "backend_mutation",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      tx.set(
        sessionRef,
        {
          ...base,
          ...(agentId ? { agentId } : {}),
          ...(lastMessage ? { lastMessage } : {}),
          ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    });

    return { ok: true };
  }

  throw new HttpsError("invalid-argument", "Unsupported mutation type.");
});
