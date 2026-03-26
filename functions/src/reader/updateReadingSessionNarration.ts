import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeNarrationSessionState(
  value: unknown
): { provider: "browser_speech_synthesis"; playbackRate: number; paused: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "narration is required");
  }

  const record = value as Record<string, unknown>;
  const provider =
    record.provider === "browser_speech_synthesis" ? "browser_speech_synthesis" : null;
  const playbackRateRaw = record.playbackRate;
  const playbackRate =
    typeof playbackRateRaw === "number" &&
    Number.isFinite(playbackRateRaw) &&
    playbackRateRaw >= 0.5 &&
    playbackRateRaw <= 3
      ? Math.round(playbackRateRaw * 100) / 100
      : null;
  const paused = typeof record.paused === "boolean" ? record.paused : null;

  if (!provider || playbackRate === null || paused === null) {
    throw new HttpsError("invalid-argument", "narration payload is invalid");
  }

  return {
    provider,
    playbackRate,
    paused,
  };
}

export const updateReadingSessionNarrationHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const bookId = asNonEmptyString(request.data?.bookId);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "bookId is required");
  }

  const narration = sanitizeNarrationSessionState(request.data?.narration);
  const sessionId = `${uid}_${bookId}`;

  logger.info("[READER][NARRATION_SESSION_UPDATE_REQUEST]", {
    uid,
    bookId,
    sessionId,
    provider: narration.provider,
    playbackRate: narration.playbackRate,
    paused: narration.paused,
  });

  await db.collection("reading_sessions").doc(sessionId).set(
    {
      userId: uid,
      bookId,
      status: "reading",
      narration,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("[READER][NARRATION_SESSION_UPDATED]", {
    uid,
    bookId,
    sessionId,
    provider: narration.provider,
    playbackRate: narration.playbackRate,
    paused: narration.paused,
  });

  return { ok: true as const };
};

export const updateReadingSessionNarration = onCall(
  { cors: true },
  updateReadingSessionNarrationHandler
);
