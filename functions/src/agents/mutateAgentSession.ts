import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
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

type AgentSessionMutation = AppendMessageMutation | UpsertSessionMutation;

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
