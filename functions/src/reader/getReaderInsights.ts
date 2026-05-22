// functions/src/reader/getReaderInsights.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();
const ACTIVE_READING_STATES = ["reading", "paused", "rereading"] as const;
const DEFAULT_CONTINUE_READING_LIMIT = 50;
const MAX_CONTINUE_READING_LIMIT = 50;

function toBoundedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONTINUE_READING_LIMIT;
  }
  return Math.max(1, Math.min(MAX_CONTINUE_READING_LIMIT, Math.trunc(value)));
}

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

function statusRank(value: unknown): number {
  return value === "reading" ? 0 : value === "rereading" ? 1 : value === "paused" ? 2 : 3;
}

function toUnitProgress(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * getReaderInsights
 * ---------------------------------
 * 🔒 AUTHORITATIVE READER INSIGHTS API
 *
 * Read-only. Derived. Deterministic.
 */
export const getReaderInsightsHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = request.auth.uid;
  const limit = toBoundedLimit(request.data?.limit);

  try {
    // -------------------------------------------------
    // Active reading projection
    //
    // This is the canonical Continue Reading source. It is intentionally
    // bounded and state-scoped; shelves never gate continuity visibility.
    // -------------------------------------------------
    const progressSnap = await db
      .collection("reading_progress")
      .where("uid", "==", uid)
      .where("status_state", "in", ACTIVE_READING_STATES)
      .orderBy("lastActiveAt", "desc")
      .limit(limit)
      .get();

    let totalReadingTimeSeconds = 0;

    const currentlyReading: any[] = [];

    progressSnap.forEach((doc) => {
      const data = doc.data();
      const statusState =
        typeof data.status_state === "string"
          ? data.status_state.trim().toLowerCase()
          : "";

      totalReadingTimeSeconds += data.totalActiveSeconds ?? 0;

      if (statusState === "reading" || statusState === "paused" || statusState === "rereading") {
        const lastActiveAt = data.lastActiveAt ?? data.updatedAt ?? null;
        currentlyReading.push({
          bookId: data.bookId,
          progress: toUnitProgress(data.progress),
          status_state: statusState,
          continuityLevel: normalizeOptionalString(data.continuityLevel),
          sourceType: normalizeOptionalString(data.sourceType),
          lastPosition: data.lastPosition ?? null,
          lastActiveAt,
        });
      }
    });

    currentlyReading.sort((a, b) => {
      const stateDelta = statusRank(a.status_state) - statusRank(b.status_state);
      if (stateDelta !== 0) return stateDelta;
      return toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt);
    });

    const finishedCountSnap = await db
      .collection("reading_progress")
      .where("uid", "==", uid)
      .where("status_state", "==", "completed")
      .count()
      .get();
    const finishedCount = finishedCountSnap.data().count;

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
};

export const getReaderInsights = onCall({ cors: true }, getReaderInsightsHandler);
