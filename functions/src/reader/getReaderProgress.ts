// functions/src/reader/getReaderProgress.ts

import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * getReaderProgress
 *
 * 🔒 AUTHORITATIVE READER STATE FETCH
 *
 * Responsibilities:
 * - Return the caller’s reading progress for a given book
 * - Enforce user-only access
 * - Never expose other users’ data
 *
 * Firestore contract:
 * collection: reading_progress
 * docId: {uid}_{bookId}
 */
export const getReaderProgress = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to read progress."
    );
  }

  const uid = request.auth.uid;
  const { bookId } = request.data || {};

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "bookId is required and must be a string."
    );
  }

  const progressId = `${uid}_${bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);

  logger.info("[READER][GET_PROGRESS]", {
    uid,
    bookId,
    progressId,
  });

  const snap = await progressRef.get();

  // No progress yet → return deterministic empty state
  if (!snap.exists) {
    return {
      exists: false,
      bookId,
      progress: 0,
      lastPosition: null,
    };
  }

  const data = snap.data();

  // 🔒 Defensive validation (should never fail if rules are correct)
  if (data?.userId !== uid) {
    logger.error("[READER][SECURITY_VIOLATION]", {
      uid,
      bookId,
      storedUserId: data?.userId,
    });

    throw new HttpsError("permission-denied", "Access denied.");
  }

  return {
    exists: true,
    bookId: data.bookId,
    progress: data.progress ?? 0,
    lastPosition: data.lastPosition ?? null,
    updatedAt: data.updatedAt ?? null,
  };
});