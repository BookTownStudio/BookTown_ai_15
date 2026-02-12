// functions/src/reader/getReaderInsights.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * getReaderInsights
 * ---------------------------------
 * 🔒 AUTHORITATIVE READER INSIGHTS API
 *
 * Read-only. Derived. Deterministic.
 */
export const getReaderInsights = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = request.auth.uid;

  try {
    // -------------------------------------------------
    // Reading progress aggregation
    // -------------------------------------------------
    const progressSnap = await db
      .collection("reading_progress")
      .where("uid", "==", uid)
      .get();

    let totalReadingTimeSeconds = 0;
    let finishedCount = 0;

    const currentlyReading: any[] = [];

    progressSnap.forEach((doc) => {
      const data = doc.data();

      totalReadingTimeSeconds += data.totalActiveSeconds ?? 0;

      if (data.status_state === "finished") {
        finishedCount += 1;
      }

      if (data.status_state === "reading") {
        currentlyReading.push({
          bookId: data.bookId,
          progress: data.progress,
          lastPosition: data.lastPosition ?? null,
          lastActiveAt: data.lastActiveAt ?? null,
        });
      }
    });

    // -------------------------------------------------
    // Streak calculation (event-derived)
    // -------------------------------------------------
    const eventsSnap = await db
      .collection("reader_events")
      .where("uid", "==", uid)
      .where("event", "==", "read_start")
      .orderBy("occurredAt", "desc")
      .limit(90)
      .get();

    const days = new Set<string>();

    eventsSnap.forEach((doc) => {
      const ts: Timestamp = doc.data().occurredAt;
      const day = ts.toDate().toISOString().slice(0, 10);
      days.add(day);
    });

    const sortedDays = Array.from(days).sort().reverse();

    let currentStreakDays = 0;
    let longestStreakDays = 0;

    let prevDate: Date | null = null;
    let running = 0;

    for (const day of sortedDays) {
      const date = new Date(day);

      if (!prevDate) {
        running = 1;
      } else {
        const diff =
          (prevDate.getTime() - date.getTime()) /
          (1000 * 60 * 60 * 24);

        if (diff === 1) {
          running += 1;
        } else {
          longestStreakDays = Math.max(longestStreakDays, running);
          running = 1;
        }
      }

      prevDate = date;
      longestStreakDays = Math.max(longestStreakDays, running);
    }

    currentStreakDays = running;

    return {
      currentlyReading,
      finishedCount,
      totalReadingTimeSeconds,
      currentStreakDays,
      longestStreakDays,
    };
  } catch (err: any) {
    logger.error("[READER][INSIGHTS_FAILED]", {
      uid,
      error: err?.message || err,
    });

    throw new HttpsError(
      "internal",
      "Failed to compute reader insights."
    );
  }
});
