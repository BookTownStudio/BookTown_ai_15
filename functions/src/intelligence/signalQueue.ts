import { createHash } from "crypto";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import {
  INTELLIGENCE_BATCH_WINDOW_MS,
  INTELLIGENCE_SIGNAL_RETRY_LIMIT,
  type IntelligenceSignalEnvelope,
  type IntelligenceSignalFamily,
} from "./types";

const db = admin.firestore();

function normalizeUid(uid: unknown): string {
  if (typeof uid !== "string") return "";
  const normalized = uid.trim();
  if (!normalized) return "";
  return normalized.slice(0, 128);
}

function normalizeSignalType(signalType: unknown): string {
  if (typeof signalType !== "string") return "unknown";
  const normalized = signalType.trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, "_");
  return (normalized || "unknown").slice(0, 96);
}

function normalizePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const normalized = path.trim();
  if (!normalized) return null;
  return normalized.slice(0, 300);
}

function normalizeErrorMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.slice(0, 500);
}

function deterministicSignalId(params: {
  uid: string;
  signalType: string;
  signalFamily: IntelligenceSignalFamily;
  sourceEventId: string | null;
  payload: Record<string, unknown>;
}): string {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(params.payload))
    .digest("hex")
    .slice(0, 20);

  const key = [
    params.uid,
    params.signalType,
    params.signalFamily,
    params.sourceEventId ?? "no_event",
    payloadHash,
  ].join("|");

  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

export async function enqueueIntelligenceSignal(params: {
  uid: string;
  signalType: string;
  signalFamily: IntelligenceSignalFamily;
  payload?: Record<string, unknown>;
  sourceEventId?: string | null;
  sourcePath?: string | null;
}): Promise<string | null> {
  const uid = normalizeUid(params.uid);
  if (!uid) {
    return null;
  }

  const signalType = normalizeSignalType(params.signalType);
  const payload = params.payload && typeof params.payload === "object" ? params.payload : {};
  const sourceEventId =
    typeof params.sourceEventId === "string" && params.sourceEventId.trim().length > 0
      ? params.sourceEventId.trim().slice(0, 180)
      : null;

  const now = Timestamp.now();
  const signalId = deterministicSignalId({
    uid,
    signalType,
    signalFamily: params.signalFamily,
    sourceEventId,
    payload,
  });

  const envelope: IntelligenceSignalEnvelope = {
    uid,
    signalType,
    signalFamily: params.signalFamily,
    payload,
    sourceEventId,
    sourcePath: normalizePath(params.sourcePath),
    createdAt: now,
    nextAttemptAt: Timestamp.fromMillis(now.toMillis() + INTELLIGENCE_BATCH_WINDOW_MS),
    processed: false,
    retryCount: 0,
    failed: false,
    failedReason: null,
  };

  const ref = db.collection("intelligence_signal_queue").doc(signalId);
  try {
    await ref.create({
      ...envelope,
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return signalId;
  } catch (error) {
    const code = (error as { code?: number }).code;
    // ALREADY_EXISTS (6) => idempotent duplicate from retried event delivery.
    if (code === 6) {
      logger.debug("[INTELLIGENCE][QUEUE][DUPLICATE]", {
        signalId,
        uid,
        signalType,
        signalFamily: params.signalFamily,
      });
      return signalId;
    }

    logger.error("[INTELLIGENCE][QUEUE][ENQUEUE_FAILED]", {
      signalId,
      uid,
      signalType,
      signalFamily: params.signalFamily,
      error: String(error),
    });
    throw error;
  }
}

export function toBackoffTimestamp(now: Timestamp, nextRetryCount: number): Timestamp {
  const step = Math.max(1, nextRetryCount);
  const backoffMs = Math.min(5 * 60_000, 15_000 * Math.pow(2, step - 1));
  return Timestamp.fromMillis(now.toMillis() + backoffMs);
}

export function shouldDeadLetter(nextRetryCount: number): boolean {
  return nextRetryCount >= INTELLIGENCE_SIGNAL_RETRY_LIMIT;
}

export function formatFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return normalizeErrorMessage(error.message || "unknown_error");
  }
  return normalizeErrorMessage(String(error));
}
