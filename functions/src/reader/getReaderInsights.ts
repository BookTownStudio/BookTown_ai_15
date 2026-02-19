// functions/src/reader/getReaderInsights.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();
const ACTIVE_READING_STATES = new Set([
  "reading",
  "paused",
  "in_progress",
  "currently_reading",
]);

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }
  return 0;
}

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
      const statusState =
        typeof data.status_state === "string"
          ? data.status_state.trim().toLowerCase()
          : "";

      totalReadingTimeSeconds += data.totalActiveSeconds ?? 0;

      if (statusState === "completed") {
        finishedCount += 1;
      }

      if (ACTIVE_READING_STATES.has(statusState)) {
        const lastActiveAt = data.lastActiveAt ?? data.updatedAt ?? null;
        currentlyReading.push({
          bookId: data.bookId,
          progress: data.progress,
          lastPosition: data.lastPosition ?? null,
          lastActiveAt,
        });
      }
    });

    currentlyReading.sort(
      (a, b) => toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt)
    );

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
