import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

type CanonicalReaderState = "not_started" | "reading" | "paused" | "abandoned" | "completed";

interface BackfillRequest {
  dryRun?: boolean;
  pageSize?: number;
  maxDocs?: number;
  cursorDocId?: string;
}

interface AdjustmentCounts {
  uidFilled: number;
  userIdFilled: number;
  uidUserIdNormalized: number;
  bookIdFilled: number;
  statusNormalized: number;
  progressNormalized: number;
  updatedAtFilled: number;
  lastPositionBackfilled: number;
}

const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 400;
const DEFAULT_MAX_DOCS = 5_000;
const MAX_MAX_DOCS = 50_000;

function clampPositiveInt(
  value: unknown,
  fallback: number,
  hardMax: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, hardMax);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDocId(progressId: string): { uid: string | null; bookId: string | null } {
  const ix = progressId.indexOf("_");
  if (ix <= 0 || ix >= progressId.length - 1) {
    return { uid: null, bookId: null };
  }

  return {
    uid: progressId.slice(0, ix),
    bookId: progressId.slice(ix + 1),
  };
}

function normalizeProgress(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

function normalizeStatusState(raw: unknown, progress: number): CanonicalReaderState {
  const normalized = asNonEmptyString(raw)?.toLowerCase();

  if (normalized === "currently_reading" || normalized === "in_progress") {
    return "reading";
  }

  if (normalized === "finished" || normalized === "complete") {
    return "completed";
  }

  if (
    normalized === "not_started" ||
    normalized === "reading" ||
    normalized === "paused" ||
    normalized === "abandoned" ||
    normalized === "completed"
  ) {
    return normalized;
  }

  return progress >= 1 ? "completed" : "reading";
}

function buildCanonicalPatch(
  docId: string,
  data: FirebaseFirestore.DocumentData,
  counters: AdjustmentCounts
): { patch: Record<string, unknown> | null; invalidReason: string | null } {
  const parsed = parseDocId(docId);
  const existingUid = asNonEmptyString(data.uid);
  const existingUserId = asNonEmptyString(data.userId);
  const existingBookId = asNonEmptyString(data.bookId);

  const canonicalUid = existingUserId ?? existingUid ?? parsed.uid;
  const canonicalBookId = existingBookId ?? parsed.bookId;

  if (!canonicalUid) {
    return { patch: null, invalidReason: "missing_uid" };
  }

  if (!canonicalBookId) {
    return { patch: null, invalidReason: "missing_book_id" };
  }

  const patch: Record<string, unknown> = {};

  if (!existingUid) {
    patch.uid = canonicalUid;
    counters.uidFilled += 1;
  }

  if (!existingUserId) {
    patch.userId = canonicalUid;
    counters.userIdFilled += 1;
  }

  if (existingUid && existingUserId && existingUid !== existingUserId) {
    patch.uid = existingUserId;
    counters.uidUserIdNormalized += 1;
  }

  if (!existingBookId) {
    patch.bookId = canonicalBookId;
    counters.bookIdFilled += 1;
  }

  const normalizedProgress = normalizeProgress(data.progress);
  if (data.progress !== normalizedProgress) {
    patch.progress = normalizedProgress;
    counters.progressNormalized += 1;
  }

  const currentStatus = asNonEmptyString(data.status_state);
  const normalizedStatus = normalizeStatusState(currentStatus, normalizedProgress);
  if (currentStatus !== normalizedStatus) {
    patch.status_state = normalizedStatus;
    counters.statusNormalized += 1;
  }

  if (data.updatedAt == null) {
    patch.updatedAt = data.createdAt ?? FieldValue.serverTimestamp();
    counters.updatedAtFilled += 1;
  }

  if ((data.lastPosition == null || data.lastPosition === "") && data.lastLocation != null) {
    patch.lastPosition = data.lastLocation;
    counters.lastPositionBackfilled += 1;
  }

  if (Object.keys(patch).length === 0) {
    return { patch: null, invalidReason: null };
  }

  return { patch, invalidReason: null };
}

/**
 * backfillReadingProgressCanonical
 * Admin-only backfill for reading_progress canonical fields and state names.
 * Safe defaults:
 * - dryRun defaults to true
 * - bounded docs per invocation
 * - idempotent merge writes only
 */
export const backfillReadingProgressCanonical = onCall(
  { cors: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    assertRoleFromClaims(caller, "superadmin");

    const payload = (request.data ?? {}) as BackfillRequest;
    const dryRun = payload.dryRun !== false;
    const pageSize = clampPositiveInt(payload.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const maxDocs = clampPositiveInt(payload.maxDocs, DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
    const initialCursor = asNonEmptyString(payload.cursorDocId);

    const db = admin.firestore();
    const counters: AdjustmentCounts = {
      uidFilled: 0,
      userIdFilled: 0,
      uidUserIdNormalized: 0,
      bookIdFilled: 0,
      statusNormalized: 0,
      progressNormalized: 0,
      updatedAtFilled: 0,
      lastPositionBackfilled: 0,
    };

    let processed = 0;
    let mutated = 0;
    let unchanged = 0;
    let skippedInvalid = 0;
    let commits = 0;
    let hasMore = false;
    let lastDocId: string | null = initialCursor;
    const invalidDocIds: string[] = [];

    while (processed < maxDocs) {
      const remaining = maxDocs - processed;
      const take = Math.min(pageSize, remaining);

      let q = db
        .collection("reading_progress")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(take);

      if (lastDocId) {
        q = q.startAfter(lastDocId);
      }

      const snap = await q.get();
      if (snap.empty) {
        hasMore = false;
        break;
      }

      const batch = db.batch();
      let writesInBatch = 0;

      for (const doc of snap.docs) {
        processed += 1;
        lastDocId = doc.id;

        const { patch, invalidReason } = buildCanonicalPatch(doc.id, doc.data(), counters);
        if (invalidReason) {
          skippedInvalid += 1;
          if (invalidDocIds.length < 20) {
            invalidDocIds.push(`${doc.id}:${invalidReason}`);
          }
          continue;
        }

        if (!patch) {
          unchanged += 1;
          continue;
        }

        mutated += 1;
        if (!dryRun) {
          batch.set(doc.ref, patch, { merge: true });
          writesInBatch += 1;
        }
      }

      if (!dryRun && writesInBatch > 0) {
        await batch.commit();
        commits += 1;
      }

      if (snap.size < take) {
        hasMore = false;
        break;
      }

      if (processed >= maxDocs) {
        const probe = await db
          .collection("reading_progress")
          .orderBy(admin.firestore.FieldPath.documentId())
          .startAfter(lastDocId as string)
          .limit(1)
          .get();
        hasMore = !probe.empty;
      }
    }

    logger.info("[BACKFILL][READING_PROGRESS_CANONICAL]", {
      triggeredBy: caller.uid,
      dryRun,
      pageSize,
      maxDocs,
      processed,
      mutated,
      unchanged,
      skippedInvalid,
      hasMore,
      lastDocId,
      counters,
    });

    return {
      ok: true,
      dryRun,
      pageSize,
      maxDocs,
      processed,
      mutated,
      unchanged,
      skippedInvalid,
      commits,
      hasMore,
      nextCursorDocId: hasMore ? lastDocId : null,
      adjustments: counters,
      invalidDocIds,
    };
  }
);
