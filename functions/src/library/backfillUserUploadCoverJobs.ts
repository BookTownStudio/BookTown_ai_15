import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

const db = admin.firestore();

type CoverState =
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED_RETRYABLE"
  | "FAILED_FATAL";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCanonicalCoverPath(value: unknown, bookId: string): boolean {
  const path = asNonEmptyString(value);
  if (!path) return false;
  return path.startsWith(`books/${bookId}/covers/`);
}

function hasReadyCover(data: Record<string, unknown>, bookId: string): boolean {
  const cover = asRecord(data.cover);
  if (!cover) return false;
  return (
    isCanonicalCoverPath(cover.original, bookId) &&
    isCanonicalCoverPath(cover.large, bookId) &&
    isCanonicalCoverPath(cover.medium, bookId) &&
    isCanonicalCoverPath(cover.small, bookId)
  );
}

export const backfillUserUploadCoverJobs = onCall(
  { cors: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const { uid: executor } = assertRoleFromClaims(caller, "superadmin");

    const payload = asRecord(request.data) ?? {};
    const dryRun = payload.dryRun === true;
    const force = payload.force === true;
    const requestedLimit =
      typeof payload.limit === "number" && Number.isFinite(payload.limit)
        ? Math.floor(payload.limit)
        : 200;
    const limit = Math.min(Math.max(requestedLimit, 1), 500);
    const startAfterBookId = asNonEmptyString(payload.startAfterBookId);

    logger.info("[USER_UPLOAD_COVER_BACKFILL][START]", {
      executor,
      dryRun,
      force,
      limit,
      startAfterBookId: startAfterBookId ?? null,
    });

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
      .collection("books")
      .where("source", "==", "user_upload")
      .orderBy("__name__")
      .limit(limit);

    if (startAfterBookId) {
      query = query.startAfter(startAfterBookId);
    }

    const snap = await query.get();

    let scanned = 0;
    let queued = 0;
    let skippedReady = 0;
    let skippedMissingStoragePath = 0;
    let failed = 0;

    const now = FieldValue.serverTimestamp();

    for (const doc of snap.docs) {
      scanned++;
      const bookId = doc.id;
      const data = (doc.data() || {}) as Record<string, unknown>;
      const fileType = asNonEmptyString(data.fileType);
      const storagePath = asNonEmptyString(data.storagePath);

      if (!storagePath) {
        skippedMissingStoragePath++;
        continue;
      }
      if (fileType !== "pdf" && fileType !== "epub") {
        skippedMissingStoragePath++;
        continue;
      }

      if (!force && hasReadyCover(data, bookId)) {
        const coverState = asNonEmptyString(data.coverState);
        if (coverState === "READY") {
          skippedReady++;
          continue;
        }
      }

      try {
        if (!dryRun) {
          const batch = db.batch();
          const jobRef = db.collection("coverJobs").doc(bookId);
          const ownerUid = asNonEmptyString(data.ownerUid);

          batch.set(
            doc.ref,
            {
              coverState: "PENDING" as CoverState,
              coverFailureCode: null,
              coverFailureMessage: null,
              coverUpdatedAt: now,
              updatedAt: now,
            },
            { merge: true }
          );

          batch.set(
            jobRef,
            {
              id: bookId,
              bookId,
              ownerUid: ownerUid ?? null,
              source: "user_upload",
              fileType,
              storagePath,
              status: "PENDING",
              attempts: 0,
              maxAttempts: 3,
              updatedAt: now,
              createdAt: now,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
            { merge: true }
          );

          await batch.commit();
        }

        queued++;
      } catch (error) {
        failed++;
        logger.error("[USER_UPLOAD_COVER_BACKFILL][BOOK_FAILED]", {
          bookId,
          error: String(error),
        });
      }
    }

    const nextCursor =
      snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : undefined;

    logger.info("[USER_UPLOAD_COVER_BACKFILL][END]", {
      scanned,
      queued,
      skippedReady,
      skippedMissingStoragePath,
      failed,
      dryRun,
      force,
      nextCursor: nextCursor ?? null,
    });

    return {
      dryRun,
      force,
      scanned,
      queued,
      skippedReady,
      skippedMissingStoragePath,
      failed,
      nextCursor,
    };
  }
);
