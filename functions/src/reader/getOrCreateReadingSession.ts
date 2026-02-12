import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * Canonical Reader Session (V1)
 * reading_sessions/{uid}_{editionId}
 */
export const getOrCreateReadingSession = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const { editionId, bookId } = request.data || {};
    const uid = request.auth.uid;

    if (!editionId || !bookId) {
      throw new HttpsError(
        "invalid-argument",
        "editionId and bookId are required"
      );
    }

    const sessionId = `${uid}_${editionId}`;
    const sessionRef = db.collection("reading_sessions").doc(sessionId);

    // --------------------------------------------------
    // 1. Canonical session exists
    // --------------------------------------------------
    const existing = await sessionRef.get();
    if (existing.exists) {
      return { session: existing.data() };
    }

    logger.info("[READER] Creating canonical session", {
      uid,
      editionId,
      bookId,
    });

    // --------------------------------------------------
    // 2. Legacy source: reading_progress
    // --------------------------------------------------
    let locator = { type: "percent", value: 0 };
    let progress = 0;
    let status = "reading";
    let source = "canonical";

    const legacyProgressId = `${uid}_${bookId}`;
    const legacyProgressRef = db
      .collection("reading_progress")
      .doc(legacyProgressId);

    const legacySnap = await legacyProgressRef.get();

    if (legacySnap.exists) {
      const data = legacySnap.data()!;
      progress = data.progress ?? 0;
      locator = {
        type: "percent",
        value: data.lastPosition ?? progress,
      };
      status = data.status_state ?? "reading";
      source = "migrated:reading_progress";
    } else {
      // --------------------------------------------------
      // 3. Legacy source: user_stats
      // --------------------------------------------------
      const statsRef = db
        .collection("user_stats")
        .doc(uid)
        .collection("reading")
        .doc(bookId);

      const statsSnap = await statsRef.get();

      if (statsSnap.exists) {
        const data = statsSnap.data()!;
        progress = data.progress ?? 0;
        locator = {
          type: "percent",
          value: progress,
        };
        status = data.status ?? "reading";
        source = "migrated:user_stats";
      }
    }

    // --------------------------------------------------
    // 4. Write canonical session (ONCE)
    // --------------------------------------------------
    const now = FieldValue.serverTimestamp();

    const canonicalSession = {
      userId: uid,
      editionId,
      bookId,
      locator,
      progress,
      status,
      source,
      createdAt: now,
      updatedAt: now,
    };

    await sessionRef.set(canonicalSession);

    logger.info("[READER] Canonical session materialized", {
      sessionId,
      source,
    });

    return { session: canonicalSession };
  }
);
