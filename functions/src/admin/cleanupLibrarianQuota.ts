import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

const BATCH_SIZE = 400;
const MAX_BATCHES_PER_RUN = 10;
const RETENTION_DAYS = 90;

/**
 * scheduledLibrarianQuotaCleanup
 * Daily task to prune _ai_librarian_quota documents older than 90 days.
 * Safe to re-run: query is purely time-based and idempotent.
 */
export const scheduledLibrarianQuotaCleanup = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "UTC",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (_event) => {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RETENTION_DAYS);
    const cutoffDateKey = cutoffDate.toISOString().slice(0, 10);

    logger.info("[QUOTA][LIBRARIAN_CLEANUP] Starting daily cleanup.", {
      cutoffDateKey,
      retentionDays: RETENTION_DAYS,
      batchSize: BATCH_SIZE,
    });

    let totalDeleted = 0;
    let batchesRun = 0;
    let hasMore = true;

    while (hasMore && batchesRun < MAX_BATCHES_PER_RUN) {
      let batchDeleted = 0;

      try {
        const snap = await db
          .collection("_ai_librarian_quota")
          .where("dateKey", "<", cutoffDateKey)
          .limit(BATCH_SIZE)
          .get();

        if (snap.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        for (const doc of snap.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();

        batchDeleted = snap.size;
        totalDeleted += batchDeleted;
        batchesRun += 1;

        logger.info("[QUOTA][LIBRARIAN_CLEANUP] Batch committed.", {
          batchIndex: batchesRun,
          batchDeleted,
          totalDeleted,
        });

        if (snap.size < BATCH_SIZE) {
          hasMore = false;
        }
      } catch (error) {
        logger.error("[QUOTA][LIBRARIAN_CLEANUP] Batch failed.", {
          batchIndex: batchesRun + 1,
          totalDeleted,
          error: String(error),
        });
        break;
      }
    }

    if (hasMore && batchesRun >= MAX_BATCHES_PER_RUN) {
      logger.warn("[QUOTA][LIBRARIAN_CLEANUP] Reached max batches per run. Remaining docs will be handled on next run.", {
        batchesRun,
        totalDeleted,
      });
    }

    logger.info("[QUOTA][LIBRARIAN_CLEANUP] Run complete.", {
      totalDeleted,
      batchesRun,
      cutoffDateKey,
    });
  }
);
